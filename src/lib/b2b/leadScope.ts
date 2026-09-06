import type { Prisma } from "@prisma/client";

// A B2B agent's own requests — mirrors src/lib/account/bookingScope.ts's
// customerBookingWhere. Unlike bookings there's no guest-email fallback: a
// B2B request's ownership is exclusively the b2bAgentId relation (the agent
// is always an authenticated account, never a guest), so a direct match is
// the whole story.
export function b2bLeadWhere(agentId: string): Prisma.LeadWhereInput {
  return { b2bAgentId: agentId };
}
