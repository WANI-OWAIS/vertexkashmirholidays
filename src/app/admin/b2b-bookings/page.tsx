import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireModuleView } from "@/lib/admin/moduleGuard";
import { computeBookingFinance } from "@/lib/bookings/finance";
import { B2bBookingsClient } from "@/components/admin/b2b/B2bBookingsClient";

export const metadata: Metadata = { title: "B2B Bookings — Admin" };
export const dynamic = "force-dynamic";

/**
 * Bookings converted from a B2B request (Lead.b2bAgentId set) — a filtered
 * view of the same Booking data the main Bookings module manages, not a
 * separate resource, so this reuses the "bookings" permission (see
 * MODULE_PATH_ALIASES in moduleGuard.tsx) rather than a new RBAC module.
 * Any staff with bookings view access sees every B2B booking, matching
 * B2B Agents/Requests' own "no per-staff ownership" access pattern.
 */
export default async function AdminB2bBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const guard = await requireModuleView("bookings");
  if (!guard.ok) return guard.page;
  const { agent } = await searchParams;

  const rows = await prisma.booking.findMany({
    where: {
      deletedAt: null,
      leads: { some: agent ? { b2bAgentId: agent } : { b2bAgentId: { not: null } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      guestName: true,
      guestPhone: true,
      travelDate: true,
      travellers: true,
      amount: true,
      status: true,
      createdAt: true,
      tour: { select: { title: true } },
      payments: { select: { amount: true, type: true } },
      leads: {
        where: { b2bAgentId: { not: null } },
        take: 1,
        select: { b2bAgent: { select: { id: true, name: true, agencyName: true, email: true } } },
      },
    },
  });

  const bookings = rows.map(({ payments, leads, ...b }) => {
    const finance = computeBookingFinance({ amount: b.amount, payments, services: [] });
    return {
      ...b,
      paymentStatus: finance.paymentStatus,
      paidAmount: finance.paidAmount,
      b2bAgent: leads[0]?.b2bAgent ?? null,
    };
  });

  return <B2bBookingsClient initialBookings={bookings} />;
}
