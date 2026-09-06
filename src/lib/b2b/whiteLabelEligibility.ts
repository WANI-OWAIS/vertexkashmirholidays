import { prisma } from "@/lib/prisma";

// White-label (fully agent-branded, no Vertex mention) documents are an
// earned partner privilege, not a default — an agency must have at least
// this many real bookings with Vertex before their itinerary quotations and
// invoices drop Vertex's own branding. "Real" excludes bookings that never
// actually happened (cancelled/failed) or were unwound (refunded); PENDING/
// CONFIRMED/PAID all count, matching the "a booking is only real once it's
// underway" reasoning already applied to the Bookings cancel/refund rules
// (see BookingsClient.tsx / api/bookings/[id]/route.ts).
//
// Below the threshold, documents stay co-branded: the agent's own identity
// up front, plus a small "Powered by Vertex Kashmir Holidays" footer credit
// (see B2bItineraryPdf.tsx / InvoiceDocuments.tsx's `whiteLabel` prop).
export const WHITE_LABEL_MIN_BOOKINGS = 3;

export async function isB2bAgentWhiteLabelEligible(agentId: string): Promise<boolean> {
  const count = await prisma.booking.count({
    where: {
      deletedAt: null,
      status: { notIn: ["CANCELLED", "FAILED", "REFUNDED"] },
      leads: { some: { b2bAgentId: agentId } },
    },
  });
  return count >= WHITE_LABEL_MIN_BOOKINGS;
}
