import nodemailer from "nodemailer";
import { buildWhatsAppHref } from "@/lib/whatsapp";
import { groupServiceTables } from "@/lib/bookings/serviceDisplay";
import { env } from "@/lib/env";
import { NEXT_PUBLIC_SITE_URL } from "@/lib/env.public";
import { SITE_URL } from "@/lib/seo";

function createTransporter() {
  if (!env.SMTP_HOST) return null;

  const port = parseInt(env.SMTP_PORT ?? "465", 10);

  // Derive `secure` from the port so the two can never drift: only port 465 uses
  // implicit TLS (secure: true); 587/25 use STARTTLS (secure: false), which
  // Nodemailer negotiates automatically. SMTP_SECURE is intentionally no longer
  // read — the port is the single source of truth.
  const secure = port === 465;

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional From override — defaults to MAIL_FROM (the no-reply sender) when omitted. */
  from?: string;
  /** Optional Reply-To (the From is always the no-reply sender). */
  replyTo?: string;
  /** Optional silent internal copy — never visible to the customer recipient. */
  bcc?: string;
  /** Extra headers, merged over the transactional defaults. */
  headers?: Record<string, string>;
  /** Optional file attachments (e.g. PDF invoices). Passed straight to Nodemailer. */
  attachments?: MailAttachment[];
}

export interface SendMailResult {
  /** True only when at least one recipient was accepted by the SMTP server. */
  delivered: boolean;
  messageId?: string;
  accepted: string[];
  rejected: string[];
  response?: string;
  /** Set when SMTP is not configured (local-dev console fallback, no real send). */
  skipped?: boolean;
}

// Normalises nodemailer's Address[] | string[] result into plain emails.
function toEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((a) =>
    typeof a === "string" ? a : ((a as { address?: string })?.address ?? String(a)),
  );
}

export async function sendMail(options: MailOptions): Promise<SendMailResult> {
  const from =
    options.from ?? env.MAIL_FROM ?? "Vertex Kashmir Holidays <noreply@vertexkashmirholidays.com>";

  const transporter = createTransporter();

  // No SMTP configured → local-dev console fallback. This does NOT send a real
  // email, so it reports delivered:false; callers that require delivery (e.g. the
  // OTP route) must check the result and fail accordingly.
  if (!transporter) {
    console.warn(
      "[mail] SMTP not configured (SMTP_HOST missing) — message NOT sent:",
      options.to,
      "|",
      options.subject,
    );
    return { delivered: false, skipped: true, accepted: [], rejected: [] };
  }

  // Transport-level failures (timeout, auth, TLS) reject here and propagate to
  // the caller — that is intentional.
  //
  // Transactional defaults that improve deliverability and stop auto-responders:
  //   • Auto-Submitted (RFC 3834) marks this as a system-generated message.
  //   • X-Auto-Response-Suppress tells Outlook/Exchange not to send OOO replies.
  // Per-call headers (options.headers) win over these defaults.
  const { headers: extraHeaders, replyTo, from: _from, ...rest } = options;
  const info = await transporter.sendMail({
    from,
    replyTo: replyTo ?? env.MAIL_REPLY_TO,
    headers: {
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
      ...extraHeaders,
    },
    ...rest,
  });

  const accepted = toEmails(info.accepted);
  const rejected = toEmails(info.rejected);
  const delivered = accepted.length > 0 && rejected.length === 0;

  console.log("[mail] send result", {
    to: options.to,
    messageId: info.messageId,
    accepted,
    rejected,
    response: info.response,
    delivered,
  });

  return {
    delivered,
    messageId: info.messageId,
    accepted,
    rejected,
    response: info.response,
  };
}

/**
 * Verifies the SMTP connection/credentials without sending a message. Useful for
 * diagnosing configuration. Returns a flag + human-readable message and never
 * throws or leaks credentials.
 */
export async function verifyTransport(): Promise<{
  ok: boolean;
  message: string;
}> {
  const transporter = createTransporter();
  if (!transporter) {
    return {
      ok: false,
      message: "SMTP not configured (SMTP_HOST missing). Emails fall back to console logging.",
    };
  }
  try {
    await transporter.verify();
    return { ok: true, message: "SMTP connection verified successfully." };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "SMTP verification failed.",
    };
  }
}

// ── Reusable email builders ──────────────────────────────────────────────────

interface LeadNotificationData {
  name: string;
  phone: string;
  email?: string;
  travelDate?: string;
  travellers?: number;
  message?: string;
  source?: string;
  /** Lead row id, for quick lookup in the CRM. */
  leadId?: string;
  /** Human-readable submission timestamp. */
  submittedAt?: string;
}

export function leadNotificationText(data: LeadNotificationData): string {
  const lines = [
    "New lead — Vertex Kashmir Holidays",
    "",
    `Name: ${data.name}`,
    `Phone: ${data.phone}`,
  ];
  if (data.email) lines.push(`Email: ${data.email}`);
  if (data.travelDate) lines.push(`Travel Date: ${data.travelDate}`);
  if (data.travellers) lines.push(`Travellers: ${data.travellers}`);
  if (data.source) lines.push(`Source: ${data.source}`);
  if (data.message) lines.push("", "Message:", data.message);
  if (data.submittedAt) lines.push("", `Submitted: ${data.submittedAt}`);
  if (data.leadId) lines.push(`Lead ID: ${data.leadId}`);
  return lines.join("\n");
}

export function leadNotificationHtml(data: LeadNotificationData): string {
  // Multi-line message: escape first, then turn newlines into <br /> so it reads.
  const messageRow = data.message
    ? `          <tr>
           <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#666666;vertical-align:top"><strong>Message</strong></td>
           <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222222;vertical-align:top">${escapeHtml(data.message).replace(/\n/g, "<br />")}</td>
         </tr>`
    : "";

  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 12px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0;color:${BRAND};font-size:20px;font-weight:700">New Lead</h1>
             <p style="margin:6px 0 0;color:#666666;font-size:13px;line-height:1.5">A new enquiry was submitted on vertexkashmirholidays.com.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:4px 28px 28px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Name", data.name)}
${detailRow("Phone", data.phone)}
${data.email ? detailRow("Email", data.email) : ""}
${data.travelDate ? detailRow("Travel Date", data.travelDate) : ""}
${data.travellers ? detailRow("Travellers", String(data.travellers)) : ""}
${data.source ? detailRow("Source", data.source) : ""}
${messageRow}
${data.submittedAt ? detailRow("Submitted", data.submittedAt) : ""}
${data.leadId ? detailRow("Lead ID", data.leadId) : ""}
             </table>
           </td>
         </tr>`;

  return emailShell({
    title: "New Lead — Vertex Kashmir Holidays",
    preheader: `New lead from ${escapeHtml(data.name)} (${escapeHtml(data.phone)})`,
    contentHtml: content,
  });
}

// ── Lead confirmation (customer-facing) ──────────────────────────────────────
// Sent to the visitor themselves, only when they gave an email — acknowledges
// the enquiry, recaps exactly what they submitted (so they can spot a typo'd
// date/city and reply to correct it), and gives them our business details up
// front rather than making them wait for a callback to get basic contact info.

export interface LeadConfirmationData {
  name: string;
  phone: string;
  email: string;
  travelDate?: string;
  travellers?: number;
  /** Same composed notes shown to staff (tour/destination/flight-train
   *  context + any free-text message) — one source of truth for "what they
   *  filled in," so this can never drift from what sales sees. */
  notes?: string;
  submittedAt?: string;
  business: {
    siteName: string;
    phone?: string | null;
    email?: string | null;
    whatsappNumber?: string | null;
    address?: string | null;
    tourismRegNumber?: string | null;
  };
}

export function leadConfirmationText(data: LeadConfirmationData): string {
  const { text: waText } = resolveWhatsApp(data.business.whatsappNumber);
  const lines = [
    `Thank You For Your Enquiry — ${data.business.siteName}`,
    "",
    `Hi ${data.name}, thanks for reaching out! We've received your enquiry and one of our travel`,
    "experts will get back to you shortly — usually within a few hours.",
    "",
    "Here's what you shared with us:",
    `  Name: ${data.name}`,
    `  Phone: ${data.phone}`,
    `  Email: ${data.email}`,
  ];
  if (data.travelDate) lines.push(`  Travel Date: ${data.travelDate}`);
  if (data.travellers) lines.push(`  Travellers: ${data.travellers}`);
  if (data.notes) lines.push(`  Details: ${data.notes.replace(/\n/g, " · ")}`);
  lines.push(
    "",
    `If anything above needs correcting, just reply to this email or message us on WhatsApp.`,
    "",
    `— ${data.business.siteName}`,
  );
  if (data.business.phone) lines.push(`Phone: ${data.business.phone}`);
  if (data.business.email) lines.push(`Email: ${data.business.email}`);
  lines.push(`WhatsApp: ${waText}`);
  if (data.business.address) lines.push(`Address: ${data.business.address}`);
  if (data.business.tourismRegNumber)
    lines.push(`J&K Tourism Reg.: ${data.business.tourismRegNumber}`);
  return lines.join("\n");
}

export function leadConfirmationHtml(data: LeadConfirmationData): string {
  const { href: waHref, text: waText } = resolveWhatsApp(data.business.whatsappNumber);

  const notesRow = data.notes
    ? `          <tr>
           <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#666666;vertical-align:top"><strong>Details</strong></td>
           <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222222;vertical-align:top">${escapeHtml(data.notes).replace(/\n/g, "<br />")}</td>
         </tr>`
    : "";

  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">Thank You For Your Enquiry</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Hi ${escapeHtml(data.name)}, thanks for reaching out! We've received your enquiry and one of our travel experts will get back to you shortly — usually within a few hours.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:14px 28px 4px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0 0 6px;color:${BRAND};font-size:13px;font-weight:700">Here's what you shared with us</p>
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Name", data.name)}
${detailRow("Phone", data.phone)}
${detailRow("Email", data.email)}
${data.travelDate ? detailRow("Travel Date", data.travelDate) : ""}
${data.travellers ? detailRow("Travellers", String(data.travellers)) : ""}
${notesRow}
             </table>
             <p style="margin:10px 0 0;color:#9aa0a6;font-size:12px;line-height:1.5">Spot something that needs correcting? Just reply to this email or message us on WhatsApp.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:18px 28px 28px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#f4f7fb;border:1px solid #e6e8eb;border-radius:12px">
               <tr>
                 <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif">
                   <p style="margin:0 0 4px;color:${BRAND};font-size:14px;font-weight:700">${escapeHtml(data.business.siteName)}</p>
                   <p style="margin:0 0 10px;color:#444444;font-size:12.5px;line-height:1.7">
                     ${data.business.phone ? `Phone: ${escapeHtml(data.business.phone)}<br />` : ""}
                     ${data.business.email ? `Email: ${escapeHtml(data.business.email)}<br />` : ""}
                     ${data.business.address ? `Address: ${escapeHtml(data.business.address)}<br />` : ""}
                     ${data.business.tourismRegNumber ? `J&amp;K Tourism Reg.: ${escapeHtml(data.business.tourismRegNumber)}` : ""}
                   </p>
                   <a href="${waHref}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">WhatsApp us: ${escapeHtml(waText)}</a>
                 </td>
               </tr>
             </table>
           </td>
         </tr>`;

  return emailShell({
    title: `Thank You For Your Enquiry — ${data.business.siteName}`,
    preheader: `We've received your enquiry, ${escapeHtml(data.name)} — our team will be in touch shortly.`,
    contentHtml: content,
  });
}

// ── Lead assignment notifications (staff-facing) ─────────────────────────────
// Sent to a salesperson when a lead is assigned to them, and to the previous
// owner when a lead is reassigned away. Internal team emails — concise, with the
// key lead facts and a direct link into the CRM.

export interface LeadAssignmentData {
  assigneeName: string;
  leadName: string;
  leadPhone: string;
  leadEmail?: string | null;
  category?: string | null;
  travelDate?: string | null;
  /** Staff member who performed the (re)assignment. */
  actorName: string;
  /** Absolute URL to the lead in the admin CRM. */
  leadUrl: string;
}

function leadFactsText(data: LeadAssignmentData): string[] {
  const lines = [`Name: ${data.leadName}`, `Phone: ${data.leadPhone}`];
  if (data.leadEmail) lines.push(`Email: ${data.leadEmail}`);
  if (data.category) lines.push(`Category: ${data.category}`);
  if (data.travelDate) lines.push(`Travel Date: ${data.travelDate}`);
  return lines;
}

function leadFactsRows(data: LeadAssignmentData): string {
  return [
    detailRow("Name", data.leadName),
    detailRow("Phone", data.leadPhone),
    data.leadEmail ? detailRow("Email", data.leadEmail) : "",
    data.category ? detailRow("Category", data.category) : "",
    data.travelDate ? detailRow("Travel Date", data.travelDate) : "",
  ].join("\n");
}

export function leadAssignedText(data: LeadAssignmentData): string {
  return [
    "Lead Assigned — Vertex Kashmir Holidays",
    "",
    `Hello ${data.assigneeName},`,
    "",
    `A new lead has been assigned to you by ${data.actorName}. Please review and follow up.`,
    "",
    ...leadFactsText(data),
    "",
    `Open the lead: ${data.leadUrl}`,
  ].join("\n");
}

export function leadAssignedHtml(data: LeadAssignmentData): string {
  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">A New Lead Has Been Assigned to You</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Hello ${escapeHtml(data.assigneeName)}, ${escapeHtml(data.actorName)} has assigned the following lead to you. Please review the details and follow up promptly.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 4px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${leadFactsRows(data)}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:18px 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <a href="${escapeHtml(data.leadUrl)}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">View Lead</a>
           </td>
         </tr>`;

  return emailShell({
    title: "A new lead has been assigned to you",
    preheader: `${escapeHtml(data.leadName)} — ${escapeHtml(data.leadPhone)}`,
    contentHtml: content,
  });
}

export function leadUnassignedText(data: LeadAssignmentData): string {
  return [
    "Lead Reassigned — Vertex Kashmir Holidays",
    "",
    `Hello ${data.assigneeName},`,
    "",
    `The following lead has been reassigned and is no longer assigned to you by ${data.actorName}. No further action is required from your side.`,
    "",
    ...leadFactsText(data),
  ].join("\n");
}

export function leadUnassignedHtml(data: LeadAssignmentData): string {
  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">A Lead Has Been Reassigned</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Hello ${escapeHtml(data.assigneeName)}, the following lead has been reassigned by ${escapeHtml(data.actorName)} and is no longer assigned to you. No further action is required from your side.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 28px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${leadFactsRows(data)}
             </table>
           </td>
         </tr>`;

  return emailShell({
    title: "A lead has been reassigned",
    preheader: `${escapeHtml(data.leadName)} is no longer assigned to you`,
    contentHtml: content,
  });
}

// ── Booking request received (pre-payment) ───────────────────────────────────
// Sent the moment a guest submits their booking details and a PENDING Booking +
// Razorpay order are created — BEFORE payment. Deliberately distinct from
// bookingConfirmationHtml below: this must never say "confirmed," "booked," or
// imply the trip is secured, since payment can still fail or be abandoned. It
// exists purely to acknowledge receipt and recap what they submitted, the same
// way the lead-confirmation email does for enquiries.

interface BookingRequestReceivedData {
  guestName: string;
  tourTitle: string;
  travelDate: string;
  travellers: number;
  totalAmount: number;
  payableNow: number;
  paymentOptionLabel: string; // e.g. "10% Advance" or "Full Payment"
  whatsappNumber?: string | null;
  /** How long the PENDING order stays open before the stale-booking sweep
   *  auto-cancels it (STALE_BOOKING_MINUTES in src/lib/bookings/cleanup.ts) —
   *  passed in rather than hardcoded so this copy can never drift from what
   *  the system actually does. */
  expiryMinutes: number;
}

export function bookingRequestReceivedText(data: BookingRequestReceivedData): string {
  const { text: waText } = resolveWhatsApp(data.whatsappNumber);
  return [
    "Booking Request Received — Vertex Kashmir Holidays",
    "",
    `Dear ${data.guestName}, we've received your booking request. Here's what you submitted:`,
    "",
    `Tour: ${data.tourTitle}`,
    `Travel Date: ${data.travelDate}`,
    `Travellers: ${data.travellers}`,
    `Total Amount: ${inr(data.totalAmount)}`,
    `Payment Option: ${data.paymentOptionLabel}`,
    `Payable Now: ${inr(data.payableNow)}`,
    "",
    "This is a REQUEST, not a confirmation — your seats are not yet reserved,",
    "and our team will not reach out until your payment is verified.",
    "",
    `If payment isn't completed within ${data.expiryMinutes} minutes, this request is`,
    "automatically cancelled and no charge is made — you're welcome to start again",
    "anytime.",
    "",
    "Once payment is confirmed, you'll automatically receive your booking",
    "confirmation and invoice by email, and our team will be in touch.",
    "",
    "If you haven't finished paying yet, please return to checkout, or message us",
    "on WhatsApp if you ran into any trouble.",
    `WhatsApp us: ${waText}`,
  ].join("\n");
}

export function bookingRequestReceivedHtml(data: BookingRequestReceivedData): string {
  const { href: waHref, text: waText } = resolveWhatsApp(data.whatsappNumber);

  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">Booking Request Received</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Dear ${escapeHtml(data.guestName)}, we've received your booking request. Here's what you submitted:</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 4px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Tour", data.tourTitle)}
${detailRow("Travel Date", data.travelDate)}
${detailRow("Travellers", String(data.travellers))}
${detailRow("Total Amount", inr(data.totalAmount))}
${detailRow("Payment Option", data.paymentOptionLabel)}
${detailRow("Payable Now", inr(data.payableNow))}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:14px 28px 8px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#fff8ec;border:1px solid #f3e2bd;border-radius:12px">
               <tr>
                 <td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif">
                   <p style="margin:0 0 8px;color:#7a5c1e;font-size:12.5px;font-weight:700">This is a request, not a confirmation</p>
                   <p style="margin:0 0 8px;color:#5c4a26;font-size:12.5px;line-height:1.6">Your seats are not yet reserved, and our team will not reach out until your payment is verified.</p>
                   <p style="margin:0;color:#5c4a26;font-size:12.5px;line-height:1.6">If payment isn't completed within <strong>${data.expiryMinutes} minutes</strong>, this request is automatically cancelled and no charge is made — you're welcome to start again anytime.</p>
                 </td>
               </tr>
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0 0 16px;color:#666666;font-size:12.5px;line-height:1.6">Once payment is confirmed, you'll automatically receive your booking confirmation and invoice by email. If you haven't finished paying yet, please return to checkout, or message us on WhatsApp if you ran into any trouble.</p>
             <a href="${waHref}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">WhatsApp us: ${escapeHtml(waText)}</a>
           </td>
         </tr>`;

  return emailShell({
    title: `Booking Request Received — ${data.tourTitle}`,
    preheader: `We've received your booking request for ${escapeHtml(data.tourTitle)} — complete payment within ${data.expiryMinutes} minutes to secure your seats.`,
    contentHtml: content,
  });
}

interface BookingData {
  guestName: string;
  tourTitle: string;
  amount: number;
  travelDate: string;
  travellers: number;
  razorpayPayId: string;
  /** Public WhatsApp number (e.g. SiteSettings.whatsapp). Digits are extracted. */
  whatsappNumber?: string | null;
  /** Booking id — when present, the portal CTA section is appended. */
  bookingId?: string;
}

export function bookingConfirmationText(data: BookingData): string {
  const { text: waText } = resolveWhatsApp(data.whatsappNumber);
  return [
    "Booking Confirmed — Vertex Kashmir Holidays",
    "",
    `Dear ${data.guestName}, your booking is confirmed.`,
    "",
    `Tour: ${data.tourTitle}`,
    `Travel Date: ${data.travelDate}`,
    `Travellers: ${data.travellers}`,
    `Amount Paid: ₹${data.amount.toLocaleString("en-IN")}`,
    `Payment ID: ${data.razorpayPayId}`,
    "",
    "Our team will contact you within 24 hours with your complete itinerary details.",
    `WhatsApp us: ${waText}`,
    ...(data.bookingId ? [bookingPortalSectionText(data.bookingId)] : []),
  ].join("\n");
}

export function bookingConfirmationHtml(data: BookingData): string {
  const { href: waHref, text: waText } = resolveWhatsApp(data.whatsappNumber);

  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">Booking Confirmed</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Dear ${escapeHtml(data.guestName)}, your booking is confirmed. Here are your details:</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 4px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Tour", data.tourTitle)}
${detailRow("Travel Date", data.travelDate)}
${detailRow("Travellers", String(data.travellers))}
${detailRow("Amount Paid", `₹${data.amount.toLocaleString("en-IN")}`)}
${detailRow("Payment ID", data.razorpayPayId)}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:18px 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0 0 16px;color:#444444;font-size:13px;line-height:1.6">Our team will contact you within 24 hours with your complete itinerary details.</p>
             <a href="${waHref}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">WhatsApp us: ${escapeHtml(waText)}</a>
           </td>
         </tr>`;

  return emailShell({
    title: `Booking Confirmed — ${data.tourTitle}`,
    preheader: `Your booking for ${escapeHtml(data.tourTitle)} is confirmed.`,
    contentHtml: content + (data.bookingId ? bookingPortalSectionHtml(data.bookingId) : ""),
  });
}

// ── Internal staff booking notification ─────────────────────────────────────

interface StaffBookingNotificationData {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  tourTitle: string;
  travelDate: string;
  travellers: number;
  amountPaid: number;
  paymentOption: string;
  bookingId: string;
}

export function staffBookingNotificationText(data: StaffBookingNotificationData): string {
  return [
    "New Booking — Vertex Kashmir Holidays",
    "",
    `Guest: ${data.guestName}`,
    `Phone: ${data.guestPhone}`,
    `Email: ${data.guestEmail}`,
    `Tour: ${data.tourTitle}`,
    `Travel Date: ${data.travelDate}`,
    `Travellers: ${data.travellers}`,
    `Amount Paid: ₹${data.amountPaid.toLocaleString("en-IN")}`,
    `Payment Option: ${data.paymentOption}`,
    "",
    `Admin Link: ${SITE_URL}/admin/bookings/${data.bookingId}/services`,
  ].join("\n");
}

export function staffBookingNotificationHtml(data: StaffBookingNotificationData): string {
  const adminUrl = `${SITE_URL}/admin/bookings/${data.bookingId}/services`;
  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">New Booking Received</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">A new booking has been confirmed on the website.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 4px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Guest", data.guestName)}
${detailRow("Phone", data.guestPhone)}
${detailRow("Email", data.guestEmail)}
${detailRow("Tour", data.tourTitle)}
${detailRow("Travel Date", data.travelDate)}
${detailRow("Travellers", String(data.travellers))}
${detailRow("Amount Paid", `₹${data.amountPaid.toLocaleString("en-IN")}`)}
${detailRow("Payment Option", data.paymentOption)}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:18px 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">View Booking in Admin</a>
           </td>
         </tr>`;
  return emailShell({
    title: `New Booking — ${data.tourTitle}`,
    preheader: `${escapeHtml(data.guestName)} booked ${escapeHtml(data.tourTitle)} for ${escapeHtml(data.travelDate)}`,
    contentHtml: content,
  });
}

export interface InvoiceService {
  kind: "HOTEL" | "TRANSPORT" | "ACTIVITY" | "OTHER";
  name: string;
  location?: string | null;
  nights?: number | null;
  roomType?: string | null;
  pickup?: string | null;
  dropoff?: string | null;
  timing?: string | null;
}

interface BookingInvoiceData {
  guestName: string;
  bookingRef: string;
  travelDate?: string;
  travellers?: number;
  services: InvoiceService[]; // NO per-line pricing — detail only
  inclusions: string[];
  totalAmount: number; // effective payable (after discount)
  bookingAmount: number; // raw booking amount before discount
  discountAmount: number;
  paidAmount: number;
  remainingBalance: number;
  status: string; // e.g. "Partial"
  whatsappNumber?: string | null;
  bookingId?: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function bookingInvoiceText(data: BookingInvoiceData): string {
  const { text: waText } = resolveWhatsApp(data.whatsappNumber);
  const lines = [
    "Booking Summary — Vertex Kashmir Holidays",
    "",
    `Dear ${data.guestName}, here is your booking summary.`,
    `Booking Ref: ${data.bookingRef}`,
  ];
  if (data.travelDate) lines.push(`Travel Date: ${data.travelDate}`);
  if (data.travellers) lines.push(`Travellers: ${data.travellers}`);
  lines.push("", "Your package includes:");
  for (const g of groupServiceTables(data.services)) {
    lines.push(`  ${g.title}:`);
    lines.push(`    ${g.headers.join(" | ")}`);
    for (const r of g.rows) {
      lines.push(`    ${r.join(" | ")}`);
    }
  }
  if (data.inclusions.length) {
    lines.push("", "Additional inclusions:", ...data.inclusions.map((i) => `  • ${i}`));
  }
  lines.push(
    "",
    `Total Booking Amount: ${inr(data.bookingAmount)}`,
    `Discount: ${inr(data.discountAmount)}`,
    `Payable: ${inr(data.totalAmount)}`,
    `Paid: ${inr(data.paidAmount)}`,
    `Remaining Balance: ${inr(data.remainingBalance)}`,
    `Status: ${data.status}`,
    "",
    "A detailed PDF summary is attached to this email.",
    `WhatsApp us: ${waText}`,
  );
  if (data.bookingId) lines.push(bookingPortalSectionText(data.bookingId));
  return lines.join("\n");
}

export function bookingInvoiceHtml(data: BookingInvoiceData): string {
  const { href: waHref, text: waText } = resolveWhatsApp(data.whatsappNumber);

  const serviceBlocks = groupServiceTables(data.services)
    .map((g) => {
      const headCells = g.headers
        .map(
          (h, i) =>
            `<th style="padding:7px 10px;border-bottom:1px solid #e6e6e6;font-size:10px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#ffffff;text-align:${i === 0 ? "left" : "left"}">${escapeHtml(h)}</th>`,
        )
        .join("");
      const bodyRows = g.rows
        .map(
          (r) =>
            `<tr>${r
              .map(
                (c, i) =>
                  `<td style="padding:8px 10px;border-bottom:1px solid #eeeeee;font-size:12px;color:${i === 0 ? "#1a1a1a" : "#666666"};font-weight:${i === 0 ? "700" : "400"}">${escapeHtml(c)}</td>`,
              )
              .join("")}</tr>`,
        )
        .join("");
      return `<div style="margin:0 0 16px">
       <p style="margin:0 0 6px;color:${BRAND};font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase">${escapeHtml(g.title)}</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #eeeeee;border-radius:8px;overflow:hidden">
         <thead><tr style="background:${BRAND}">${headCells}</tr></thead>
         <tbody>${bodyRows}</tbody>
       </table>
     </div>`;
    })
    .join("");

  const inclusionItems = data.inclusions
    .map((i) => `<li style="margin:0 0 4px;color:#444444;font-size:12px">${escapeHtml(i)}</li>`)
    .join("");

  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">Booking Summary</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Dear ${escapeHtml(data.guestName)}, here is your confirmed booking summary. Ref: <strong>${escapeHtml(data.bookingRef)}</strong></p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 4px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${data.travelDate ? detailRow("Travel Date", data.travelDate) : ""}
${data.travellers ? detailRow("Travellers", String(data.travellers)) : ""}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:14px 28px 0;font-family:Arial,Helvetica,sans-serif">
             <h2 style="margin:0 0 10px;color:${BRAND};font-size:14px">Your Package Includes</h2>
             ${serviceBlocks || '<p style="color:#9aa0a6;font-size:12px">Service details will be shared shortly.</p>'}
             ${inclusionItems ? `<h2 style="margin:6px 0 6px;color:${BRAND};font-size:14px">Additional Inclusions</h2><ul style="margin:0;padding-left:18px">${inclusionItems}</ul>` : ""}
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:12px 28px 4px">
             <h2 style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;color:${BRAND};font-size:14px">Price Summary</h2>
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Total Booking Amount", inr(data.bookingAmount))}
${data.discountAmount > 0 ? detailRow("Discount", `– ${inr(data.discountAmount)}`) : ""}
${detailRow("Payable", inr(data.totalAmount))}
${detailRow("Paid", inr(data.paidAmount))}
${detailRow("Remaining Balance", inr(data.remainingBalance))}
${detailRow("Status", data.status)}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:14px 28px 6px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0;color:#666666;font-size:12px;line-height:1.6">📎 A professionally formatted PDF summary is attached for your records.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:12px 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <a href="${waHref}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">WhatsApp us: ${escapeHtml(waText)}</a>
           </td>
         </tr>`;

  return emailShell({
    title: `Booking Summary — ${data.bookingRef}`,
    preheader: `Your booking summary — remaining balance ${inr(data.remainingBalance)}.`,
    contentHtml: content + (data.bookingId ? bookingPortalSectionHtml(data.bookingId) : ""),
  });
}

// ── Payment invoice / receipt ────────────────────────────────────────────────
// Sent whenever a payment is recorded against a booking (online or staff-entered).
// Strictly payment-focused — never includes the booking's service line items.

interface PaymentInvoiceData {
  customerName: string;
  bookingRef: string;
  invoiceRef: string;
  amount: number;
  type: string; // Token / Partial / Final / Refund
  method?: string | null;
  paymentDate: string;
  totalPaid: number;
  remainingBalance: number;
  status: string;
  whatsappNumber?: string | null;
  bookingId?: string;
}

export function paymentInvoiceText(data: PaymentInvoiceData): string {
  const { text: waText } = resolveWhatsApp(data.whatsappNumber);
  const lines = [
    "Payment Receipt — Vertex Kashmir Holidays",
    "",
    `Dear ${data.customerName}, we have received your payment.`,
    `Receipt: ${data.invoiceRef}`,
    `Booking Ref: ${data.bookingRef}`,
    "",
    `Amount Received: ${inr(data.amount)}`,
    `Payment Type: ${data.type}`,
  ];
  if (data.method) lines.push(`Method: ${data.method}`);
  lines.push(
    `Payment Date: ${data.paymentDate}`,
    "",
    `Total Paid To Date: ${inr(data.totalPaid)}`,
    `Remaining Balance: ${inr(data.remainingBalance)}`,
    `Status: ${data.status}`,
    "",
    "A PDF receipt is attached to this email.",
    `WhatsApp us: ${waText}`,
  );
  if (data.bookingId) lines.push(bookingPortalSectionText(data.bookingId));
  return lines.join("\n");
}

export function paymentInvoiceHtml(data: PaymentInvoiceData): string {
  const { href: waHref, text: waText } = resolveWhatsApp(data.whatsappNumber);

  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">Payment Receipt</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Dear ${escapeHtml(data.customerName)}, thank you — we have received your payment. Receipt: <strong>${escapeHtml(data.invoiceRef)}</strong></p>
           </td>
         </tr>
         <tr>
           <td align="center" class="vk-px" style="padding:14px 28px 4px">
             <table role="presentation" cellpadding="0" cellspacing="0" border="0">
               <tr>
                 <td align="center" style="padding:16px 30px;border-radius:12px;background:${BRAND}">
                   <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1px;color:rgba(255,255,255,0.75)">AMOUNT RECEIVED</div>
                   <div style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:700;color:#ffffff;margin-top:4px">${inr(data.amount)}</div>
                 </td>
               </tr>
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:12px 28px 4px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Booking Ref", data.bookingRef)}
${detailRow("Payment Type", data.type)}
${data.method ? detailRow("Method", data.method) : ""}
${detailRow("Payment Date", data.paymentDate)}
${detailRow("Total Paid To Date", inr(data.totalPaid))}
${detailRow("Remaining Balance", inr(data.remainingBalance))}
${detailRow("Status", data.status)}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:14px 28px 6px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0;color:#666666;font-size:12px;line-height:1.6">📎 A PDF receipt is attached for your records.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:12px 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <a href="${waHref}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">WhatsApp us: ${escapeHtml(waText)}</a>
           </td>
         </tr>`;

  return emailShell({
    title: `Payment Receipt — ${data.invoiceRef}`,
    preheader: `Payment of ${inr(data.amount)} received — balance ${inr(data.remainingBalance)}.`,
    contentHtml: content + (data.bookingId ? bookingPortalSectionHtml(data.bookingId) : ""),
  });
}

// ── Driver / vehicle details ─────────────────────────────────────────────────
// Sent to the customer when staff assign (or update) the driver and vehicle for
// an upcoming trip. Purely informational — driver contact + vehicle, plus the
// trip date for context.

interface DriverDetailsEmailData {
  guestName: string;
  driverName: string;
  driverPhone: string;
  vehicleName: string;
  vehicleNumber: string;
  tourTitle?: string | null;
  travelDate?: string | null;
  updated?: boolean; // true when this is an update to previously-sent details
  whatsappNumber?: string | null;
}

export function driverDetailsText(data: DriverDetailsEmailData): string {
  const { text: waText } = resolveWhatsApp(data.whatsappNumber);
  const lines = [
    `Driver & Vehicle Details — Vertex Kashmir Holidays`,
    "",
    `Dear ${data.guestName}, ${data.updated ? "your driver and vehicle details have been updated." : "the driver and vehicle for your upcoming trip have been assigned."}`,
    "",
  ];
  if (data.tourTitle) lines.push(`Tour: ${data.tourTitle}`);
  if (data.travelDate) lines.push(`Travel Date: ${data.travelDate}`);
  lines.push(
    `Driver Name: ${data.driverName}`,
    `Driver Phone: ${data.driverPhone}`,
    `Vehicle: ${data.vehicleName}`,
    `Vehicle Number: ${data.vehicleNumber}`,
    "",
    "Your driver will contact you before pickup. Safe travels!",
    `WhatsApp us: ${waText}`,
  );
  return lines.join("\n");
}

export function driverDetailsHtml(data: DriverDetailsEmailData): string {
  const { href: waHref, text: waText } = resolveWhatsApp(data.whatsappNumber);

  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">${data.updated ? "Updated Driver &amp; Vehicle Details" : "Your Driver &amp; Vehicle Details"}</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Dear ${escapeHtml(data.guestName)}, ${data.updated ? "your driver and vehicle details have been updated. Here is the latest information for your trip." : "the driver and vehicle for your upcoming trip have been assigned. Please keep these details handy."}</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 4px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${data.tourTitle ? detailRow("Tour", data.tourTitle) : ""}
${data.travelDate ? detailRow("Travel Date", data.travelDate) : ""}
${detailRow("Driver Name", data.driverName)}
${detailRow("Driver Phone", data.driverPhone)}
${detailRow("Vehicle", data.vehicleName)}
${detailRow("Vehicle Number", data.vehicleNumber)}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:18px 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0 0 16px;color:#444444;font-size:13px;line-height:1.6">Your driver will reach out before pickup. If you have any questions, we&apos;re a message away.</p>
             <a href="${waHref}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">WhatsApp us: ${escapeHtml(waText)}</a>
           </td>
         </tr>`;

  return emailShell({
    title: `Driver & Vehicle Details — Vertex Kashmir Holidays`,
    preheader: `${escapeHtml(data.driverName)} · ${escapeHtml(data.vehicleNumber)}`,
    contentHtml: content,
  });
}

// Escapes user-supplied values before they are interpolated into email HTML, so
// a name/message can never inject markup into the message.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Brand navy used across all emails.
const BRAND = "#0f3460";

// Canonical public origin. Used as the last-resort fallback below and as the
// base for images embedded in emails.
const PRODUCTION_ORIGIN = "https://vertexkashmirholidays.com";

// Exported for src/lib/notifications.ts, which needs the same fallback
// chain (deliberately including NEXTAUTH_URL — see src/lib/auth.config.ts's
// trustHost comment) for its own notification links.
export function siteUrl(): string {
  return (NEXT_PUBLIC_SITE_URL ?? env.NEXTAUTH_URL ?? PRODUCTION_ORIGIN).replace(/\/$/, "");
}

// Base origin for images referenced from email HTML. Deliberately NOT siteUrl():
// that chain falls back to NEXTAUTH_URL, which points at the http:// beta host,
// and mail clients block or fail to proxy images served over plain HTTP — which
// rendered the header logo as a broken-image icon in every template. Anything
// that is not an https:// origin (unset, http://, localhost) falls back to the
// canonical production domain, where the brand assets are always reachable.
function emailAssetBase(): string {
  const base = SITE_URL.replace(/\/$/, "");
  return base.startsWith("https://") ? base : PRODUCTION_ORIGIN;
}

// Human-friendly booking reference (matches lib/bookings/invoice-pdf bookingRef).
function shortRef(bookingId: string): string {
  return bookingId.slice(-8).toUpperCase();
}

// Customer-portal links for the booking emails. Every link points to a
// middleware-protected account page (never a raw API endpoint): unauthenticated
// or forwarded clicks are bounced to /login, so a leaked email can never expose
// another customer's booking — and the invoice/receipt PDFs download from inside
// the booking page itself (the PDF is also attached to the email).
function portalUrls(bookingId: string) {
  const base = siteUrl();
  return {
    login: `${base}/login`,
    view: `${base}/account/bookings/${bookingId}`,
    portal: `${base}/account/bookings`,
  };
}

// ── Customer-portal CTA block (shared by all booking emails) ─────────────────
// "Manage your booking anytime…" with Login / View Booking / Download Invoice
// buttons + the booking reference. Rendered as the inner <tr> rows of the card.
export function bookingPortalSectionHtml(bookingId: string): string {
  const u = portalUrls(bookingId);
  const ref = shortRef(bookingId);
  const btn = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:4px 6px 0 0;padding:10px 16px;border-radius:9px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;font-weight:700;text-decoration:none;${
      primary
        ? `background:${BRAND};color:#ffffff`
        : `background:#ffffff;color:${BRAND};border:1px solid ${BRAND}`
    }">${escapeHtml(label)}</a>`;

  return `          <tr>
           <td class="vk-px" style="padding:4px 28px 28px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#f4f7fb;border:1px solid #e6e8eb;border-radius:12px">
               <tr>
                 <td style="padding:18px 20px;font-family:Arial,Helvetica,sans-serif">
                   <p style="margin:0 0 4px;color:${BRAND};font-size:14px;font-weight:700">Your Customer Dashboard</p>
                   <p style="margin:0 0 10px;color:#444444;font-size:12.5px;line-height:1.6">Log in to manage your booking — view status, payments and download your invoice &amp; receipts securely.</p>
                   <p style="margin:0 0 12px;color:#666666;font-size:12.5px">Booking Reference: <strong style="color:#1a1a1a">${escapeHtml(ref)}</strong></p>
                   ${btn(u.view, "View Booking", true)}${btn(u.login, "Login to Account", false)}
                 </td>
               </tr>
             </table>
           </td>
         </tr>`;
}

export function bookingPortalSectionText(bookingId: string): string {
  const u = portalUrls(bookingId);
  return [
    "",
    "── Your Customer Dashboard ──",
    "Log in to manage your booking and download your invoice & receipts securely.",
    `Booking Reference: ${shortRef(bookingId)}`,
    `View Booking:     ${u.view}`,
    `Login to Account: ${u.login}`,
  ].join("\n");
}

/** Absolute URL to the brand icon — resolves in an inbox regardless of host. */
export function brandLogoUrl(): string {
  return `${emailAssetBase()}/brand/png/icon/vertex-icon-512.png`;
}

/**
 * Branded header band rendered at the top of every transactional email: the
 * company logo (absolute URL so it resolves in the inbox) and wordmark on the
 * brand navy. Falls back gracefully to the wordmark if the image is blocked.
 */
function brandHeader(): string {
  const logo = brandLogoUrl();
  return `          <tr>
           <td class="vk-px" style="padding:20px 28px;background:${BRAND};border-radius:14px 14px 0 0">
             <table role="presentation" cellpadding="0" cellspacing="0" border="0">
               <tr>
                 <td style="vertical-align:middle;padding-right:10px">
                   <img src="${logo}" width="34" height="34" alt="Vertex Kashmir Holidays" style="display:block;border:0;border-radius:7px;background:#ffffff" />
                 </td>
                 <td style="vertical-align:middle">
                   <div style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#ffffff;line-height:1.1">Vertex Kashmir</div>
                   <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;letter-spacing:3px;color:rgba(255,255,255,0.75);margin-top:2px">HOLIDAYS</div>
                 </td>
               </tr>
             </table>
           </td>
         </tr>`;
}

/**
 * Shared, cross-client email chrome: a full HTML document with a centered white
 * card on a light background, a hidden preheader (the inbox preview snippet) and
 * an "automated message" footer. All transactional emails render through this so
 * they stay visually consistent and deliverability-friendly. `contentHtml` is the
 * inner `<tr>…</tr>` rows of the card body. `preheader` must be pre-escaped.
 */
function emailShell(opts: {
  title: string;
  preheader: string;
  contentHtml: string;
  maxWidth?: number;
}): string {
  const maxWidth = opts.maxWidth ?? 600;
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "https://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="https://www.w3.org/1999/xhtml" lang="en">
<head>
 <meta charset="utf-8" />
 <meta name="viewport" content="width=device-width, initial-scale=1.0" />
 <meta http-equiv="X-UA-Compatible" content="IE=edge" />
 <meta name="color-scheme" content="light dark" />
 <title>${escapeHtml(opts.title)}</title>
 <style>
   /* Desktop paddings (28px/32px content gutters, 16px outer) are too wide on
      a phone screen — they squeeze the label/value tables until text wraps
      awkwardly. On narrow screens, shrink to a single small gutter close to
      what the mail app's own message view already gives, rather than
      stacking our padding on top of it. !important is required: this must
      beat the inline styles above, and only clients that support <style> at
      all honor media queries anyway (legacy Outlook just keeps the desktop
      values, which is an acceptable fallback there). */
   @media only screen and (max-width: 480px) {
     .vk-outer { padding-left: 10px !important; padding-right: 10px !important; }
     .vk-px { padding-left: 16px !important; padding-right: 16px !important; }
   }
 </style>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
 <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f4f5f7">${opts.preheader}</div>
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7">
   <tr>
     <td class="vk-outer" align="center" style="padding:32px 16px">
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${maxWidth}px;background:#ffffff;border-radius:14px;border:1px solid #e6e8eb">
${brandHeader()}
${opts.contentHtml}
       </table>
       <p style="margin:16px 0 0;color:#9aa0a6;font-size:11px;font-family:Arial,Helvetica,sans-serif">
         This is an automated message from Vertex Kashmir Holidays.
       </p>
     </td>
   </tr>
 </table>
</body>
</html>`;
}

/** A label/value row for the detail tables. Both sides are HTML-escaped. */
function detailRow(label: string, value: string): string {
  return `          <tr>
           <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#666666;white-space:nowrap;vertical-align:top"><strong>${escapeHtml(label)}</strong></td>
           <td style="padding:10px 12px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#222222;vertical-align:top">${escapeHtml(value)}</td>
         </tr>`;
}

/** Resolves the WhatsApp click-to-chat link + label, with a contact-page fallback. */
function resolveWhatsApp(whatsappNumber?: string | null): {
  href: string;
  text: string;
} {
  const waDigits = (whatsappNumber ?? "").replace(/[^0-9]/g, "");
  return waDigits
    ? { href: buildWhatsAppHref(whatsappNumber), text: `+${waDigits}` }
    : { href: `${siteUrl()}/contact`, text: "Contact us" };
}

/**
 * Plain-text part for the OTP email. A well-formed text alternative materially
 * improves inbox placement (multipart/alternative with a real text body looks
 * far less like spam than HTML-only).
 */
export function otpVerificationText(data: { name: string; code: string; ttlMinutes: number }) {
  return [
    `Hi ${data.name},`,
    "",
    "Use this code to finish creating your Vertex Kashmir Holidays account:",
    "",
    `    ${data.code}`,
    "",
    `This code expires in ${data.ttlMinutes} minutes and can be used only once.`,
    "If you didn't request this, you can ignore this email — no account will be created.",
    "",
    "— Vertex Kashmir Holidays",
    "https://vertexkashmirholidays.com",
  ].join("\n");
}

export function otpVerificationHtml(data: { name: string; code: string; ttlMinutes: number }) {
  const name = escapeHtml(data.name);
  const code = escapeHtml(data.code);
  // Hidden preheader: the preview line Gmail/Apple Mail show next to the subject.
  const preheader = `Your verification code is ${code} (expires in ${data.ttlMinutes} minutes).`;

  const content = `          <tr>
           <td class="vk-px" style="padding:32px 32px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 12px;color:${BRAND};font-size:20px;font-weight:700">Verify your email</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">
               Hi ${name}, use the verification code below to finish creating your
               Vertex Kashmir Holidays account.
             </p>
           </td>
         </tr>
         <tr>
           <td align="center" class="vk-px" style="padding:8px 32px 8px">
             <table role="presentation" cellpadding="0" cellspacing="0" border="0">
               <tr>
                 <td align="center" class="vk-px" style="padding:16px 28px;border-radius:12px;background:${BRAND};color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;letter-spacing:8px">${code}</td>
               </tr>
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 32px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:16px 0 0;color:#666666;font-size:13px;line-height:1.6">
               This code expires in <strong>${data.ttlMinutes} minutes</strong> and can be
               used only once. If you didn't request this, you can safely ignore this
               email &mdash; no account will be created.
             </p>
           </td>
         </tr>`;

  return emailShell({
    title: "Verify your email",
    preheader,
    contentHtml: content,
    maxWidth: 480,
  });
}

/**
 * Plain-text part for the forgot-password OTP email. Same shape as
 * {@link otpVerificationText} — only the copy differs (resetting an existing
 * account's password rather than creating one).
 */
export function passwordResetOtpText(data: { name: string; code: string; ttlMinutes: number }) {
  return [
    `Hi ${data.name},`,
    "",
    "Use this code to reset your Vertex Kashmir Holidays account password:",
    "",
    `    ${data.code}`,
    "",
    `This code expires in ${data.ttlMinutes} minutes and can be used only once.`,
    "If you didn't request this, you can ignore this email — your password will not change.",
    "",
    "— Vertex Kashmir Holidays",
    "https://vertexkashmirholidays.com",
  ].join("\n");
}

export function passwordResetOtpHtml(data: { name: string; code: string; ttlMinutes: number }) {
  const name = escapeHtml(data.name);
  const code = escapeHtml(data.code);
  const preheader = `Your password reset code is ${code} (expires in ${data.ttlMinutes} minutes).`;

  const content = `          <tr>
           <td class="vk-px" style="padding:32px 32px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 12px;color:${BRAND};font-size:20px;font-weight:700">Reset your password</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">
               Hi ${name}, use the verification code below to reset your
               Vertex Kashmir Holidays account password.
             </p>
           </td>
         </tr>
         <tr>
           <td align="center" class="vk-px" style="padding:8px 32px 8px">
             <table role="presentation" cellpadding="0" cellspacing="0" border="0">
               <tr>
                 <td align="center" class="vk-px" style="padding:16px 28px;border-radius:12px;background:${BRAND};color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;letter-spacing:8px">${code}</td>
               </tr>
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 32px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:16px 0 0;color:#666666;font-size:13px;line-height:1.6">
               This code expires in <strong>${data.ttlMinutes} minutes</strong> and can be
               used only once. If you didn't request this, you can safely ignore this
               email &mdash; your password will not change.
             </p>
           </td>
         </tr>`;

  return emailShell({
    title: "Reset your password",
    preheader,
    contentHtml: content,
    maxWidth: 480,
  });
}

// ── Careers application email verification ─────────────────────────────────────
// Sent when a candidate clicks "Verify Email" on a job application form
// (src/components/careers/JobApplyForm.tsx). Same shape as the password-reset
// OTP email above, Careers-specific copy only.

export function careersOtpText(data: { code: string; ttlMinutes: number }) {
  return [
    "Verify your email to complete your job application",
    "",
    "Use this code to verify your email for your application to",
    "Vertex Kashmir Holidays:",
    "",
    `    ${data.code}`,
    "",
    `This code expires in ${data.ttlMinutes} minutes and can be used only once.`,
    "If you didn't request this, you can ignore this email.",
    "",
    "— Vertex Kashmir Holidays",
    "https://vertexkashmirholidays.com",
  ].join("\n");
}

export function careersOtpHtml(data: { code: string; ttlMinutes: number }) {
  const code = escapeHtml(data.code);
  const preheader = `Your application verification code is ${code} (expires in ${data.ttlMinutes} minutes).`;

  const content = `          <tr>
           <td class="vk-px" style="padding:32px 32px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 12px;color:${BRAND};font-size:20px;font-weight:700">Verify your email</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">
               Use the verification code below to confirm your email address and
               complete your job application with Vertex Kashmir Holidays.
             </p>
           </td>
         </tr>
         <tr>
           <td align="center" class="vk-px" style="padding:8px 32px 8px">
             <table role="presentation" cellpadding="0" cellspacing="0" border="0">
               <tr>
                 <td align="center" class="vk-px" style="padding:16px 28px;border-radius:12px;background:${BRAND};color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;letter-spacing:8px">${code}</td>
               </tr>
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 32px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:16px 0 0;color:#666666;font-size:13px;line-height:1.6">
               This code expires in <strong>${data.ttlMinutes} minutes</strong> and can be
               used only once. If you didn't request this, you can safely ignore this
               email.
             </p>
           </td>
         </tr>`;

  return emailShell({
    title: "Verify your email",
    preheader,
    contentHtml: content,
    maxWidth: 480,
  });
}

// ── Booking checkout email verification ─────────────────────────────────────
// Sent when a guest clicks "Verify Email" on the public booking form
// (src/components/booking/BookingForm.tsx). Same shape as the Careers OTP
// email above, booking-specific copy only.

export function bookingOtpText(data: { code: string; ttlMinutes: number }) {
  return [
    "Verify your email to complete your booking",
    "",
    "Use this code to verify your email for your booking with",
    "Vertex Kashmir Holidays:",
    "",
    `    ${data.code}`,
    "",
    `This code expires in ${data.ttlMinutes} minutes and can be used only once.`,
    "If you didn't request this, you can ignore this email.",
    "",
    "— Vertex Kashmir Holidays",
    "https://vertexkashmirholidays.com",
  ].join("\n");
}

export function bookingOtpHtml(data: { code: string; ttlMinutes: number }) {
  const code = escapeHtml(data.code);
  const preheader = `Your booking verification code is ${code} (expires in ${data.ttlMinutes} minutes).`;

  const content = `          <tr>
           <td class="vk-px" style="padding:32px 32px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 12px;color:${BRAND};font-size:20px;font-weight:700">Verify your email</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">
               Use the verification code below to confirm your email address and
               complete your booking with Vertex Kashmir Holidays.
             </p>
           </td>
         </tr>
         <tr>
           <td align="center" class="vk-px" style="padding:8px 32px 8px">
             <table role="presentation" cellpadding="0" cellspacing="0" border="0">
               <tr>
                 <td align="center" class="vk-px" style="padding:16px 28px;border-radius:12px;background:${BRAND};color:#ffffff;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:700;letter-spacing:8px">${code}</td>
               </tr>
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 32px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:16px 0 0;color:#666666;font-size:13px;line-height:1.6">
               This code expires in <strong>${data.ttlMinutes} minutes</strong> and can be
               used only once. If you didn't request this, you can safely ignore this
               email.
             </p>
           </td>
         </tr>`;

  return emailShell({
    title: "Verify your email",
    preheader,
    contentHtml: content,
    maxWidth: 480,
  });
}

// ── Careers application notification (HR-facing) ─────────────────────────────
// Sent when a candidate completes the Apply form (email already OTP-verified).
// By design there is no candidate record in the database — this email plus
// the Cloudinary-hosted resume ARE the record, so all candidate details a
// staff member needs are laid out here.

interface CareersApplicationData {
  jobTitle: string;
  fullName: string;
  email: string;
  phone: string;
  experience: string;
  currentCompany?: string;
  noticePeriod?: string;
  coverLetter?: string;
  resumeUrl: string;
  submittedAt: string;
}

export function careersApplicationText(data: CareersApplicationData): string {
  const lines = [
    `New job application — ${data.jobTitle}`,
    "",
    `Name: ${data.fullName}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone}`,
  ];
  lines.push(`Experience: ${data.experience}`);
  if (data.currentCompany) lines.push(`Current Company: ${data.currentCompany}`);
  if (data.noticePeriod) lines.push(`Notice Period: ${data.noticePeriod}`);
  lines.push("", `Resume: ${data.resumeUrl}`);
  if (data.coverLetter) lines.push("", `Cover Letter:`, data.coverLetter);
  lines.push("", `Submitted: ${data.submittedAt}`);
  return lines.join("\n");
}

export function careersApplicationHtml(data: CareersApplicationData): string {
  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 12px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0;color:${BRAND};font-size:20px;font-weight:700">New Job Application</h1>
             <p style="margin:6px 0 0;color:#666666;font-size:13px;line-height:1.5">A candidate applied for <strong>${escapeHtml(data.jobTitle)}</strong> on vertexkashmirholidays.com.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:4px 28px 28px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Name", data.fullName)}
${detailRow("Email", data.email)}
${detailRow("Phone", data.phone)}
${detailRow("Experience", data.experience)}
${data.currentCompany ? detailRow("Current Company", data.currentCompany) : ""}
${data.noticePeriod ? detailRow("Notice Period", data.noticePeriod) : ""}
${detailRow("Submitted", data.submittedAt)}
             </table>
           </td>
         </tr>
         <tr>
           <td style="padding:0 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <a href="${escapeHtml(data.resumeUrl)}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">Download Resume</a>
           </td>
         </tr>
         ${
           data.coverLetter
             ? `<tr>
           <td style="padding:0 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#222222">Cover Letter</p>
             <p style="margin:0;font-size:13px;line-height:1.6;color:#444444;white-space:pre-wrap">${escapeHtml(data.coverLetter)}</p>
           </td>
         </tr>`
             : ""
         }`;

  return emailShell({
    title: "New Job Application — Vertex Kashmir Holidays",
    preheader: `${escapeHtml(data.fullName)} applied for ${escapeHtml(data.jobTitle)}`,
    contentHtml: content,
  });
}

// ── New-customer default credentials ───────────────────────────────────────────
// Sent when a lead is converted and a brand-new customer account is created. The
// customer can log in with these credentials and is encouraged to change the
// password. Only ever sent when an email is available (the unique login key).

interface CustomerCredentialsData {
  name: string;
  email: string;
  tempPassword: string;
  /** Absolute login URL; falls back to the site /login. */
  loginUrl?: string;
}

function resolveLoginUrl(loginUrl?: string): string {
  if (loginUrl) return loginUrl;
  return `${siteUrl()}/login`;
}

export function customerCredentialsText(data: CustomerCredentialsData): string {
  const loginUrl = resolveLoginUrl(data.loginUrl);
  return [
    "Your Vertex Kashmir Holidays account",
    "",
    `Dear ${data.name}, an account has been created for you so you can track your`,
    "bookings, payments and trip details online.",
    "",
    "Log in with these details:",
    `  Email: ${data.email}`,
    `  Temporary password: ${data.tempPassword}`,
    "",
    `Sign in: ${loginUrl}`,
    "",
    "For your security, please change this password after your first login.",
    "",
    "— Vertex Kashmir Holidays",
  ].join("\n");
}

export function customerCredentialsHtml(data: CustomerCredentialsData): string {
  const loginUrl = resolveLoginUrl(data.loginUrl);
  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">Your account is ready</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Dear ${escapeHtml(data.name)}, an account has been created for you so you can track your bookings, payments and trip details online.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 4px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Email", data.email)}
${detailRow("Temporary Password", data.tempPassword)}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:18px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <a href="${loginUrl}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">Sign in to your account</a>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0;color:#666666;font-size:13px;line-height:1.6">For your security, please <strong>change this password</strong> after your first login.</p>
           </td>
         </tr>`;

  return emailShell({
    title: "Your Vertex Kashmir Holidays account",
    preheader: `Your account is ready — sign in with ${escapeHtml(data.email)}.`,
    contentHtml: content,
    maxWidth: 480,
  });
}

// ── B2B partner activation ────────────────────────────────────────────────────
// Sent exactly once per activation event — whenever a B2B agent's
// agencyStatus transitions to ACTIVE (see PATCH /api/admin/b2b-agents/[id]),
// whether that's their first approval or a later reactivation after
// suspension. Same "temp password, must change on first login" convention as
// customerCredentialsHtml/Text above, not a second parallel design — this is
// literally the only point in the B2B agent's lifecycle where a password is
// ever emailed to them (registration itself never sends credentials).

interface B2bAgentActivationData {
  contactName: string;
  agencyName: string;
  email: string;
  tempPassword: string;
  /** Absolute login URL; falls back to the site /login. */
  loginUrl?: string;
  /** Absolute link to the B2B partner terms/confidentiality policy; falls back to the public B2B program page. */
  termsUrl?: string;
}

function resolveB2bTermsUrl(termsUrl?: string): string {
  if (termsUrl) return termsUrl;
  return `${siteUrl()}/b2b-travel-partner-program#b2b-confidentiality`;
}

export function b2bAgentActivationText(data: B2bAgentActivationData): string {
  const loginUrl = resolveLoginUrl(data.loginUrl);
  const termsUrl = resolveB2bTermsUrl(data.termsUrl);
  return [
    "Your Vertex Kashmir Holidays B2B Partner account is active",
    "",
    `Dear ${data.contactName},`,
    "",
    `Good news — ${data.agencyName}'s B2B partner application has been approved. You can now log in and start submitting travel requests for your clients.`,
    "",
    "Log in with these details:",
    `  Email: ${data.email}`,
    `  Temporary password: ${data.tempPassword}`,
    "",
    `Sign in: ${loginUrl}`,
    "",
    "For your security, please change this password after your first login.",
    "",
    `Please review our B2B Partner Terms & Confidentiality Policy: ${termsUrl}`,
    "",
    "— Vertex Kashmir Holidays",
  ].join("\n");
}

export function b2bAgentActivationHtml(data: B2bAgentActivationData): string {
  const loginUrl = resolveLoginUrl(data.loginUrl);
  const termsUrl = resolveB2bTermsUrl(data.termsUrl);
  const content = `          <tr>
           <td class="vk-px" style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <h1 style="margin:0 0 10px;color:${BRAND};font-size:20px;font-weight:700">Your B2B Partner account is active</h1>
             <p style="margin:0;color:#444444;font-size:14px;line-height:1.6">Dear ${escapeHtml(data.contactName)}, good news — <strong>${escapeHtml(data.agencyName)}</strong>&rsquo;s B2B partner application has been approved. You can now log in and start submitting travel requests for your clients.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 4px">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:1px solid #eeeeee">
${detailRow("Email", data.email)}
${detailRow("Temporary Password", data.tempPassword)}
             </table>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:18px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <a href="${loginUrl}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:${BRAND};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">Sign in to your account</a>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 8px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0;color:#666666;font-size:13px;line-height:1.6">For your security, please <strong>change this password</strong> after your first login.</p>
           </td>
         </tr>
         <tr>
           <td class="vk-px" style="padding:8px 28px 28px;font-family:Arial,Helvetica,sans-serif">
             <p style="margin:0;color:#666666;font-size:13px;line-height:1.6">Please review our <a href="${termsUrl}" style="color:${BRAND};font-weight:700;text-decoration:underline">B2B Partner Terms &amp; Confidentiality Policy</a>, which apply to your account.</p>
           </td>
         </tr>`;

  return emailShell({
    title: "Your Vertex Kashmir Holidays B2B Partner account is active",
    preheader: `${escapeHtml(data.agencyName)}'s B2B partner account is now active — sign in with ${escapeHtml(data.email)}.`,
    contentHtml: content,
    maxWidth: 480,
  });
}

// ── Hotel supplier rate request (B2B outbound) ───────────────────────────────
// Sent from the Hotel Rates admin page to a supplier property whose MAP rate
// is missing or has expired. Deliberately NOT built on the shared emailShell()
// card/banner/"automated message" treatment every other builder above uses —
// this is a person-to-person partnership outreach, not a transactional
// system email, so it's plain letter-style HTML that reads like it was
// actually typed, not templated. Company identity (legal name, GSTIN,
// tourism registration, registered address) still comes from SiteSettings
// rather than being hardcoded, and it's sent From the sales@ mailbox via
// MailOptions.from.

export interface HotelRateRequestCompany {
  tradeName: string; // SiteSettings.siteName
  legalName: string | null; // SiteSettings.legalName
  phone: string | null; // SiteSettings.sitePhone
  contactEmails: string; // e.g. "bookings@…, sales@…" — shown in the signature
  website: string;
  gstNumber: string | null;
  tourismRegNumber: string | null;
  address: string | null; // SiteSettings.siteAddress
  logoUrl?: string | null;
}

export interface HotelRateRequestData {
  hotelName: string;
  contactPerson?: string | null;
  senderName: string;
  company: HotelRateRequestCompany;
}

export const HOTEL_RATE_REQUEST_SUBJECT = "Request for B2B Hotel Rates & Partnership";

function hotelRateRequestGreeting(data: HotelRateRequestData): string {
  return data.contactPerson ? `Dear ${data.contactPerson},` : "Dear Manager,";
}

const HOTEL_RATE_REQUEST_ASKS = [
  "CP / MAP / AP rates",
  "Extra bed / child rates",
  "Seasonal rates and validity",
  "Complimentary inclusions, if any",
];

export function hotelRateRequestText(data: HotelRateRequestData): string {
  const { company } = data;
  const orgLine = company.legalName
    ? `We are from ${company.tradeName} operated by ${company.legalName}.`
    : `We are from ${company.tradeName}.`;
  return [
    hotelRateRequestGreeting(data),
    "",
    "I hope you are doing well.",
    "",
    `${orgLine} We are interested in establishing a B2B partnership with ${data.hotelName} and would appreciate the opportunity to include your property among our accommodation options.`,
    "",
    "Kindly share your latest B2B rate sheet, including:",
    ...HOTEL_RATE_REQUEST_ASKS.map((a) => `  • ${a}`),
    "",
    "We would also appreciate it if you could share high-resolution images of the rooms and property for our reference and presentation to clients.",
    "",
    "We look forward to establishing a long-term business association with your property.",
    "",
    "With Regards,",
    data.senderName,
    company.tradeName,
    company.phone ? `Phone: ${company.phone}` : "",
    company.gstNumber ? `GSTIN: ${company.gstNumber}` : "",
    company.tourismRegNumber ? `Tourism Reg. No: ${company.tourismRegNumber}` : "",
    "",
    company.legalName ?? company.tradeName,
    company.address ?? "",
    `Email: ${company.contactEmails}`,
    `Website: ${company.website}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function hotelRateRequestHtml(data: HotelRateRequestData): string {
  const { company } = data;
  const orgLine = company.legalName
    ? `We are from <strong>${escapeHtml(company.tradeName)}</strong> operated by <strong>${escapeHtml(company.legalName)}</strong>.`
    : `We are from <strong>${escapeHtml(company.tradeName)}</strong>.`;

  const asksList = HOTEL_RATE_REQUEST_ASKS.map(
    (a) => `<li style="margin:0 0 5px">${escapeHtml(a)}</li>`,
  ).join("");

  const logo = company.logoUrl
    ? `<img src="${escapeHtml(company.logoUrl)}" width="20" height="20" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:4px;margin-right:6px" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="utf-8" />
 <meta name="viewport" content="width=device-width, initial-scale=1.0" />
 <title>${escapeHtml(HOTEL_RATE_REQUEST_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff">
 <div style="max-width:560px;padding:20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a">
   <p style="margin:0 0 14px">${escapeHtml(hotelRateRequestGreeting(data))}</p>
   <p style="margin:0 0 14px">I hope you are doing well.</p>
   <p style="margin:0 0 14px">${orgLine} We are interested in establishing a B2B partnership with <strong>${escapeHtml(data.hotelName)}</strong> and would appreciate the opportunity to include your property among our accommodation options.</p>
   <p style="margin:0 0 8px">Kindly share your latest B2B rate sheet, including:</p>
   <ul style="margin:0 0 14px;padding-left:20px">${asksList}</ul>
   <p style="margin:0 0 14px">We would also appreciate it if you could share high-resolution images of the rooms and property for our reference and presentation to clients.</p>
   <p style="margin:0 0 20px">We look forward to establishing a long-term business association with your property.</p>
   <p style="margin:0 0 2px">With Regards,</p>
   <p style="margin:0 0 2px">${logo}<strong>${escapeHtml(data.senderName)}</strong></p>
   <p style="margin:0 0 2px">${escapeHtml(company.tradeName)}</p>
   ${company.phone ? `<p style="margin:0 0 2px">📞 ${escapeHtml(company.phone)}</p>` : ""}
   ${company.gstNumber ? `<p style="margin:0 0 2px">GSTIN: ${escapeHtml(company.gstNumber)}</p>` : ""}
   ${company.tourismRegNumber ? `<p style="margin:0 0 14px">Tourism Reg. No: ${escapeHtml(company.tourismRegNumber)}</p>` : ""}
   <p style="margin:0;color:#8a8f98;font-size:11px;line-height:1.6">
     ${escapeHtml(company.legalName ?? company.tradeName)}${company.address ? `<br />${escapeHtml(company.address)}` : ""}<br />
     Email: ${escapeHtml(company.contactEmails)}<br />
     Website: ${escapeHtml(company.website)}
   </p>
 </div>
</body>
</html>`;
}
