import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { resolveItineraryAccess } from "@/lib/itinerary/access";
import { resolveTokenPaymentLink } from "@/lib/itinerary/tokenPaymentLink";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Resolve (reuse or mint) this itinerary's current token Payment Link for
 * embedding as a QR in the exported PDF. Same view-access bar as GET the
 * itinerary itself — anyone who can open/export it can trigger this.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("itinerary", "view");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const existing = await prisma.itinerary.findUnique({
    where: { id },
    select: {
      ownerId: true,
      leadId: true,
      locked: true,
      lead: { select: { assignedToId: true, locked: true, b2bAgentId: true } },
      bookingId: true,
      booking: { select: { servicesLocked: true } },
    },
  });
  // No booking/payment concept for B2B yet (later phase) — never mint a real
  // payment link against a B2B itinerary.
  if (!existing || existing.lead?.b2bAgentId != null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = resolveItineraryAccess(existing, { id: guard.user.id, role: guard.user.role });
  if (!access.canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await resolveTokenPaymentLink(id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 502 });

  return NextResponse.json(result);
}
