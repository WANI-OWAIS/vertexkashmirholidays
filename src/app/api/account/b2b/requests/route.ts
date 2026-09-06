import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { b2bRequestCreateSchema } from "@/lib/b2b/requestSchema";
import { b2bLeadWhere } from "@/lib/b2b/leadScope";

export const dynamic = "force-dynamic";

const REQUEST_SELECT = {
  id: true,
  name: true,
  phone: true,
  adults: true,
  children: true,
  days: true,
  rooms: true,
  budget: true,
  startDate: true,
  endDate: true,
  notes: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * An agent's own B2B requests. Any agencyStatus may read (a SUSPENDED agent
 * keeps visibility into their own history — only creating new requests is
 * ACTIVE-gated, see POST below).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.agencyStatus === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requests = await prisma.lead.findMany({
    where: b2bLeadWhere(session.user.id),
    orderBy: { createdAt: "desc" },
    select: REQUEST_SELECT,
  });

  return NextResponse.json({ requests });
}

/**
 * Create a B2B request. Deliberately separate from POST /api/leads — that
 * route's anti-junk dedupe (block a repeat submission from the same phone/
 * email within 15 days) is designed for anonymous visitors and would wrongly
 * block a second legitimate request from the same agent, whose email never
 * changes. No dedupe here; a light per-agent rate limit is the only
 * double-submit guard.
 *
 * Only agencyStatus ACTIVE may create — PENDING/SUSPENDED get no B2B
 * functionality, checked server-side (never trust a client-supplied status).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.agencyStatus !== "ACTIVE") {
    return NextResponse.json(
      { error: "Your B2B account is not active yet." },
      { status: 403 },
    );
  }

  const rl = await rateLimit(`b2b-request:${session.user.id}`, 5, "1 m");
  if (!rl.success) {
    return tooManyRequests(rl, "Too many requests. Please try again in a moment.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = b2bRequestCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const data = parsed.data;

  const lead = await prisma.lead.create({
    data: {
      name: data.guestName,
      phone: data.guestPhone,
      source: "MANUAL",
      adults: data.pax ?? 1,
      children: data.children,
      days: data.days,
      rooms: data.rooms,
      budget: data.budget,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      notes: data.notes,
      b2bAgentId: session.user.id,
      // createdById left null — the agent submitted this themselves (see
      // Lead.createdById convention: null = self-submitted, set = staff
      // created on the agent's behalf).
    },
    select: REQUEST_SELECT,
  });

  return NextResponse.json(lead, { status: 201 });
}
