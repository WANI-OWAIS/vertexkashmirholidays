import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { b2bLeadWhere } from "@/lib/b2b/leadScope";
import { b2bRequestFieldsSchema } from "@/lib/b2b/requestSchema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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
 * Single B2B request, strictly scoped to the authenticated agent's own — an
 * id belonging to a different agent 404s rather than leaking existence.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || session.user.agencyStatus === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const request_ = await prisma.lead.findFirst({
    where: { id, ...b2bLeadWhere(session.user.id) },
    select: REQUEST_SELECT,
  });
  if (!request_) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(request_);
}

/**
 * Agent self-edit — no delete (agents may only correct/withdraw details, not
 * remove the record). Blocked once the request is `locked` (set true at
 * conversion, the same lock used repo-wide for a converted lead — see
 * src/app/api/leads/[id]/convert), mirroring the 423 used on the normal-lead
 * PATCH route for the identical case.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || session.user.agencyStatus === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await prisma.lead.findFirst({
    where: { id, ...b2bLeadWhere(session.user.id) },
    select: { id: true, locked: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.locked) {
    return NextResponse.json(
      { error: "This request is locked and can no longer be edited." },
      { status: 423 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = b2bRequestFieldsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const data = parsed.data;

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      name: data.guestName,
      phone: data.guestPhone,
      adults: data.pax ?? 1,
      children: data.children,
      days: data.days,
      rooms: data.rooms,
      budget: data.budget,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      notes: data.notes,
    },
    select: REQUEST_SELECT,
  });

  return NextResponse.json(updated);
}
