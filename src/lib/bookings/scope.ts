// Booking visibility scoping. ADMIN/SUPERADMIN see every booking; every other
// staff role (in practice SALES) sees only bookings converted from a lead
// assigned to them — direct/website bookings have no linked lead and are
// admin-only. Mirrors the ownership pattern already used for leads
// (src/app/api/leads/route.ts: `if (!isAdminOrSuper) where.assignedToId = userId`).
//
// B2B-converted bookings are the one exception: a B2B Lead never has
// assignedToId set (that field is the sales-pipeline concept; B2B has no
// per-agent assignee), so without this OR branch a non-admin staff member
// could never see ANY B2B booking's services/details page — a 404 on every
// visit, regardless of the "bookings" permission they'd been granted. This
// matches the "any staff with the right permission, no per-staff ownership"
// rule already applied throughout the B2B module (e.g. B2B itineraries —
// see .../api/admin/b2b-itineraries/[id]).

import type { Prisma } from "@prisma/client";
import type { Role } from "@/lib/rbac";

export function bookingWhereForUser(role: Role, userId: string): Prisma.BookingWhereInput {
  if (role === "SUPERADMIN" || role === "ADMIN") return {};
  return {
    OR: [
      { leads: { some: { assignedToId: userId } } },
      { leads: { some: { b2bAgentId: { not: null } } } },
    ],
  };
}
