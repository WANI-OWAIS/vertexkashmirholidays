import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/siteSettings";
import {
  sendMail,
  leadNotificationHtml,
  leadNotificationText,
  leadConfirmationHtml,
  leadConfirmationText,
} from "@/lib/mail";
import { resolvePrimaryOffice } from "@/lib/companyOffice";
import { requirePermission } from "@/lib/permissions";
import { leadInputSchema } from "@/lib/leads/schema";
import { buildWhatsAppHref } from "@/lib/whatsapp";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
import { checkBotSignals } from "@/lib/security/formGuard";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { isSameOrigin } from "@/lib/security/origin";
import { maskPhone, maskEmail } from "@/lib/security/mask";
import { deriveChannel, buildAttributionCreateInput } from "@/lib/attribution.server";
import { LeadStatus } from "@prisma/client";
import { env } from "@/lib/env";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// Lead statuses that represent an open, in-progress conversation. A recent
// active duplicate (same phone/email) is blocked; HOLD/REJECTED/CONVERTED are
// treated as closed and always allow a fresh enquiry. (We keep the existing
// 8-value enum and map onto it rather than renaming — see CRM module.)
const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.NEW,
  LeadStatus.CONNECTED,
  LeadStatus.NOT_CONNECTED,
  LeadStatus.QUALIFIED,
  LeadStatus.NEGOTIATION,
];

// A matching ACTIVE lead newer than this is treated as a live duplicate.
const DUPLICATE_WINDOW_DAYS = 15;

// Strips CR/LF (and surrounding whitespace) from any value placed into an email
// header, defeating header-injection attempts.
function stripHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

// Admin: list leads with pagination, optional filters, and role-scoped access.
export async function GET(req: NextRequest) {
  const guard = await requirePermission("leads", "view");
  if (guard instanceof NextResponse) return guard;

  const role = (guard.user as { role: string }).role;
  const userId = guard.user.id as string;
  const isAdminOrSuper = role === "SUPERADMIN" || role === "ADMIN";

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const source = searchParams.get("source")?.trim();
  const assignedToId = searchParams.get("assignedToId")?.trim();
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const take = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "30")));
  const skip = (page - 1) * take;

  // B2B requests (b2bAgentId set) live exclusively under /api/admin/b2b-requests
  // — excluded here so they never mix into the normal lead workflow.
  const where: Prisma.LeadWhereInput = { b2bAgentId: null };
  // Non-admin users can only see their assigned leads — enforced server-side.
  if (!isAdminOrSuper) {
    where.assignedToId = userId;
  }
  if (status && status !== "ALL") where.status = status as Prisma.LeadWhereInput["status"];
  if (source && source !== "ALL") where.source = source as Prisma.LeadWhereInput["source"];
  if (isAdminOrSuper && assignedToId && assignedToId !== "ALL") {
    where.assignedToId = assignedToId === "UNASSIGNED" ? null : assignedToId;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
      { email: { contains: search, mode: "insensitive" } },
      { id: { contains: search, mode: "insensitive" } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      // Matches the admin Leads list's display order (most recently touched
      // lead first) — not createdAt, which would reorder rows the moment a
      // filter/search request replaces the initial server-rendered page.
      orderBy: { updatedAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        source: true,
        category: true,
        adults: true,
        status: true,
        startDate: true,
        followUpAt: true,
        updatedAt: true,
        negotiatedAmount: true,
        tokenAmount: true,
        assignedToId: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdAt: true,
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({ leads, total, page, pages: Math.ceil(total / take) });
}

// Server-authoritative payload schema. Built on the SAME shared schema the
// client form uses (@/lib/leads/schema) so the two can never drift. Extended
// with the optional free-text message + legacy top-level date/travellers that
// the contact form historically sent. Object schemas strip unknown keys, so a
// forged `status`/`id`/`assignedToId` is dropped here (anti mass-assignment).
const leadServerSchema = leadInputSchema.extend({
  message: z.string().trim().max(2000).optional(),
  travelDate: z.string().max(40).optional(),
  travellers: z.coerce.number().int().positive().max(99).optional(),
});

const TRANSPORT_MODE_LABEL: Record<string, string> = {
  FLIGHT: "Flight",
  TRAIN: "Train",
  EITHER: "Flight or Train",
};

// Mirrors TransportAssistancePlacement in TransportAssistanceBanner.tsx —
// kept as a plain string on the wire (not a shared enum import) since this is
// a server route and that type lives in a "use client" component.
const PLACEMENT_LABEL: Record<string, string> = {
  "tour-detail": "Tour detail page",
  homepage: "Homepage",
  "tour-listing": "Tour listing page",
  "things-to-do": "Things To Do page",
  adventures: "Adventures page",
  "travel-stories": "Travel Stories page",
  "city-page": "Origin-city SEO page",
};

// Builds the lead's notes from a free-text message plus any page context, so the
// CRM shows what the visitor was looking at when they enquired.
function composeNotes(
  message: string | undefined,
  context:
    | {
        tourName?: string;
        destinationName?: string;
        fromCity?: string;
        transportMode?: string;
        returnDate?: string;
        placement?: string;
      }
    | undefined,
): string | undefined {
  const parts: string[] = [];
  // Flight/train quote requests have no live fare API — flag this clearly at
  // the top of the notes so sales knows to check Akbar/Riya/TripJack.
  if (context?.fromCity || context?.transportMode) {
    parts.push("✈️ Flight/Train Quote Request");
    if (context.fromCity) parts.push(`From: ${context.fromCity}`);
    if (context.transportMode)
      parts.push(`Mode: ${TRANSPORT_MODE_LABEL[context.transportMode] ?? context.transportMode}`);
    if (context.returnDate) parts.push(`Return: ${context.returnDate}`);
    if (context.placement) parts.push(`Requested from: ${PLACEMENT_LABEL[context.placement] ?? context.placement}`);
  }
  if (context?.tourName) parts.push(`Tour: ${context.tourName}`);
  if (context?.destinationName) parts.push(`Destination: ${context.destinationName}`);
  if (message) parts.push(message);
  return parts.length ? parts.join("\n") : undefined;
}

// Public: create a lead from any inquiry/contact form.
// No auth guard — called from hero, tour sidebar, contact page, and campaign pages.
export async function POST(req: NextRequest) {
  // Reject cross-site scripted POSTs (CSRF) before doing any work.
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ip = clientIp(req);

  // 1) Honeypot + time-trap. Generic message to the client; detail server-side.
  const signals = checkBotSignals(body);
  if (!signals.ok) {
    console.warn(`[leads] blocked bot signal (${signals.reason}) ip=${ip}`);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 400 });
  }

  // 2) Per-IP burst limit (cheap work first, before validation/DB). Distinct
  // keys per window so the two counters never collide in the store.
  const ipBurst = await rateLimit(`lead:ip:burst:${ip}`, 8, "1 m");
  const ipHour = await rateLimit(`lead:ip:hour:${ip}`, 30, "1 h");
  if (!ipBurst.success || !ipHour.success) {
    console.warn(`[leads] rate-limited ip=${ip}`);
    // Report the hourly window when that is the one exhausted — it is the
    // longer wait, so a client honouring Retry-After won't come back early.
    return tooManyRequests(
      ipHour.success ? ipBurst : ipHour,
      "Too many requests. Please try again in a little while.",
    );
  }

  // 3) Turnstile CAPTCHA (enforced only when TURNSTILE_SECRET_KEY is set).
  const turnstileToken =
    body && typeof body === "object" ? (body as Record<string, unknown>).turnstileToken : undefined;
  const captchaOk = await verifyTurnstile(
    typeof turnstileToken === "string" ? turnstileToken : undefined,
    ip,
  );
  if (!captchaOk) {
    console.warn(`[leads] turnstile failed ip=${ip}`);
    return NextResponse.json(
      { error: "Verification failed. Please refresh and try again." },
      { status: 403 },
    );
  }

  const parsed = leadServerSchema.safeParse(body);
  if (!parsed.success) {
    // Field-level errors so the client can render them inline (Batch 5). Never
    // trust the client — this is the authoritative validation pass.
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return NextResponse.json(
      { error: "Please check the highlighted fields and try again.", fieldErrors },
      { status: 400 },
    );
  }

  // Whitelist: read ONLY these fields. `agree` is guaranteed true by the schema
  // (mandatory consent); it is not persisted. Anything else the client sent was
  // already stripped by the object schema.
  const { name, phone, email, message, source, context, travelDate, travellers, attribution } =
    parsed.data;

  // Context-supplied date/travellers fill in when the top-level fields are absent.
  const effectiveDate = travelDate ?? context?.travelDate;
  const effectiveTravellers = travellers ?? context?.travellers;
  // Flight/train quote requests only — reuses Lead.endDate for the return date.
  const effectiveReturnDate = context?.returnDate;
  // Free-text page tag for campaign attribution (the enum captures the channel).
  const sourcePage = source;

  // 4) Per-identity throttle — cap repeated submissions from one phone/email
  // (max 3 / 24h each). Masked in logs.
  const phoneLimit = await rateLimit(`lead:phone:${phone}`, 3, "24 h");
  const emailLimit = email
    ? await rateLimit(`lead:email:${email}`, 3, "24 h")
    : { success: true, remaining: 3, reset: Date.now() };
  if (!phoneLimit.success || !emailLimit.success) {
    console.warn(
      `[leads] identity rate-limited phone=${maskPhone(phone)} email=${maskEmail(email)} ip=${ip}`,
    );
    return tooManyRequests(phoneLimit.success ? emailLimit : phoneLimit);
  }

  // ── Anti-junk / duplicate prevention ───────────────────────────────────────
  // Look up the most recent lead matching the normalized phone OR email. If it
  // is still ACTIVE and was created within the dedupe window, block the new
  // submission with a friendly message. Closed leads (HOLD/REJECTED/CONVERTED)
  // or stale active ones (older than the window) fall through and are allowed.
  const normalizedEmail = email || undefined;
  const recent = await prisma.lead.findFirst({
    where: {
      OR: [{ phone }, ...(normalizedEmail ? [{ email: normalizedEmail }] : [])],
    },
    orderBy: { createdAt: "desc" },
    select: { status: true, createdAt: true },
  });

  if (recent && ACTIVE_LEAD_STATUSES.includes(recent.status)) {
    const ageMs = Date.now() - recent.createdAt.getTime();
    const withinWindow = ageMs < DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (withinWindow) {
      const settings = await getSiteSettings();
      const whatsapp = buildWhatsAppHref(
        settings?.whatsapp,
        "Hi! I recently submitted an enquiry and wanted to follow up.",
      );
      return NextResponse.json(
        {
          error:
            "Your query is already in progress — our team will reach out within 3 days. For anything urgent, message us on WhatsApp.",
          blocked: true,
          whatsapp,
        },
        { status: 409 },
      );
    }
  }

  const lead = await prisma.lead.create({
    data: {
      // name is sanitized (control chars stripped, trimmed) and phone is E.164,
      // both enforced by the shared schema; email is lowercased + trimmed.
      name,
      phone,
      email: email || undefined,
      source: deriveChannel(attribution),
      sourcePage,
      adults: effectiveTravellers ?? 1,
      startDate: effectiveDate ? new Date(effectiveDate) : undefined,
      endDate: effectiveReturnDate ? new Date(effectiveReturnDate) : undefined,
      notes: composeNotes(message, context),
      ...buildAttributionCreateInput(attribution, req),
    },
  });

  // Dedicated lead inbox; falls back to the admin/from address if unset.
  const leadsTo =
    env.LEADS_EMAIL ?? env.MAIL_TO_ADMIN ?? env.MAIL_FROM ?? "leads@vertexkashmirholidays.com";

  // Only needed for the customer confirmation email's business-details block
  // (settings is unstable_cache'd, so this is cheap even when email is unset).
  const settings = lead.email ? await getSiteSettings() : null;

  const submittedAt = lead.createdAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

  const mailData = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email ?? undefined,
    travelDate: effectiveDate,
    travellers: effectiveTravellers,
    message: lead.notes ?? undefined,
    source: sourcePage ?? source,
    leadId: lead.id,
    submittedAt,
  };

  // Email is best-effort and runs AFTER the DB commit: a mail failure must never
  // fail the visitor's request (the lead is already saved). The subject is the
  // header-injection vector, so any interpolated value is stripped of CR/LF
  // (name is already control-char-sanitized by the schema; this is defence in
  // depth). The HTML/text bodies are templated and escape every value.
  try {
    await sendMail({
      to: stripHeader(leadsTo),
      subject: stripHeader(`New lead from ${lead.name} (${lead.phone})`),
      html: leadNotificationHtml(mailData),
      text: leadNotificationText(mailData),
      replyTo: lead.email ? stripHeader(lead.email) : undefined,
    });
  } catch (err) {
    // Log only the lead id — never the phone/email — and move on.
    console.error("[leads] notification email failed (lead saved):", lead.id, err);
  }

  // Customer-facing confirmation — only when they gave an email. Same
  // best-effort/never-block-the-response treatment as the admin notification.
  if (lead.email) {
    try {
      // Corporate (operational) office, not the legal Registered Office —
      // customer-facing mail should never surface the registered address.
      const office = await resolvePrimaryOffice(settings);
      const confirmationData = {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        travelDate: effectiveDate,
        travellers: effectiveTravellers,
        notes: lead.notes ?? undefined,
        submittedAt,
        business: {
          siteName: settings?.siteName ?? "Vertex Kashmir Holidays",
          phone: settings?.sitePhone,
          email: settings?.siteEmail,
          whatsappNumber: settings?.whatsapp ?? settings?.sitePhone,
          address: office.address,
          tourismRegNumber: settings?.tourismRegNumber,
        },
      };
      await sendMail({
        to: stripHeader(lead.email),
        subject: stripHeader(
          `We've received your enquiry — ${settings?.siteName ?? "Vertex Kashmir Holidays"}`,
        ),
        html: leadConfirmationHtml(confirmationData),
        text: leadConfirmationText(confirmationData),
      });
    } catch (err) {
      console.error("[leads] confirmation email failed (lead saved):", lead.id, err);
    }
  }

  return NextResponse.json({ success: true, id: lead.id }, { status: 201 });
}
