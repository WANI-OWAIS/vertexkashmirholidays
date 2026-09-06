import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { isAdminRole } from "@/lib/itinerary/access";

export const dynamic = "force-dynamic";

/**
 * Leads and direct bookings that don't have an itinerary yet — the pool an
 * unlinked itinerary can be attached to (see POST /api/itineraries/[id]/link).
 * A lead-converted booking is excluded from the booking list: it uses its
 * lead's itinerary, never one linked to the booking directly.
 *
 * Leads are scoped to the requester the same way the rest of the CRM scopes
 * them (see /api/leads/[id]) — a non-admin only sees leads assigned to them,
 * never the whole company's. Bookings are intentionally NOT scoped per staff
 * member: unlike leads, bookings have no assignee concept anywhere else in
 * the app (the bookings list/detail routes show all bookings to any staff
 * member with "bookings" permission), so scoping them here would be a new,
 * inconsistent restriction rather than matching existing behaviour.
 */
export async function GET() {
  const guard = await requirePermission("itinerary", "edit");
  if (guard instanceof NextResponse) return guard;
  const admin = isAdminRole(guard.user.role);

  const [leads, bookings] = await Promise.all([
    prisma.lead.findMany({
      // B2B requests (b2bAgentId set) are never a valid link target here —
      // see /api/admin/b2b-requests/[id]/itinerary for how their itinerary
      // gets created instead.
      where: admin
        ? { itinerary: null, b2bAgentId: null }
        : { itinerary: null, b2bAgentId: null, assignedToId: guard.user.id },
      select: { id: true, name: true, phone: true, email: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.booking.findMany({
      where: { itinerary: null, deletedAt: null, leads: { none: {} } },
      select: { id: true, guestName: true, guestEmail: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({
    leads: leads.map((l) => ({ id: l.id, name: l.name, phone: l.phone, email: l.email })),
    bookings: bookings.map((b) => ({
      id: b.id,
      name: b.guestName,
      email: b.guestEmail,
      ref: b.id.slice(-8).toUpperCase(),
    })),
  });
}
