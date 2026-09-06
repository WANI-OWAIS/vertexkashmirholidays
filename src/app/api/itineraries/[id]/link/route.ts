import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { resolveItineraryAccess, isAdminRole } from "@/lib/itinerary/access";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const linkSchema = z.object({
  type: z.enum(["lead", "booking"]),
  id: z.string().min(1),
});

/**
 * Attaches a standalone (unlinked) itinerary to a lead or a direct booking.
 * Only ever moves an itinerary INTO a link — an already-linked itinerary
 * can't be relinked/moved here (unlink first isn't supported; this is a
 * one-way action, matching how lead/booking itineraries are created).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("itinerary", "edit");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const existing = await prisma.itinerary.findUnique({
    where: { id },
    select: {
      ownerId: true,
      leadId: true,
      bookingId: true,
      locked: true,
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = resolveItineraryAccess(existing, { id: guard.user.id, role: guard.user.role });
  if (!access.canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access.canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (existing.leadId || existing.bookingId) {
    return NextResponse.json(
      { error: "This itinerary is already linked to a lead/booking." },
      { status: 422 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 422 },
    );
  }
  const { type, id: targetId } = parsed.data;

  if (type === "lead") {
    const lead = await prisma.lead.findUnique({
      where: { id: targetId },
      select: { id: true, assignedToId: true, b2bAgentId: true, itinerary: { select: { id: true } } },
    });
    if (!lead || lead.b2bAgentId !== null) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    // Same scoping as the rest of the CRM (see /api/leads/[id]) — a non-admin
    // may only link to a lead assigned to them, never link the itinerary
    // sitting in front of them onto someone else's lead.
    if (!isAdminRole(guard.user.role) && lead.assignedToId !== guard.user.id) {
      return NextResponse.json({ error: "That lead isn't assigned to you." }, { status: 403 });
    }
    if (lead.itinerary) {
      return NextResponse.json(
        { error: "That lead already has an itinerary linked to it." },
        { status: 409 },
      );
    }
    await prisma.itinerary.update({ where: { id }, data: { leadId: targetId } });
  } else {
    const booking = await prisma.booking.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true, itinerary: { select: { id: true } }, leads: { select: { id: true } } },
    });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (booking.itinerary) {
      return NextResponse.json(
        { error: "That booking already has an itinerary linked to it." },
        { status: 409 },
      );
    }
    if (booking.leads.length > 0) {
      return NextResponse.json(
        { error: "This booking was converted from a lead; link the itinerary to the lead instead." },
        { status: 422 },
      );
    }
    await prisma.itinerary.update({ where: { id }, data: { bookingId: targetId } });
  }

  return NextResponse.json({ success: true });
}
