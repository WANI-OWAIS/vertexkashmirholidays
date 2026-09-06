import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { buildLeadItineraryData } from "@/lib/itinerary/lead-defaults";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Create the single current itinerary for a B2B request. Mirrors
 * src/app/api/leads/[id]/itinerary/route.ts (the normal-lead equivalent) for
 * data seeding + the one-itinerary-per-lead rule (Itinerary.leadId @unique
 * already enforces this at the DB level), but is deliberately its own route:
 * the normal route is assignee-gated (see resolveItineraryAccess) and B2B
 * requests have no per-staff assignee — any staff with itinerary permission
 * may act on any B2B request, gated only by "is this actually a B2B row."
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("itinerary", "create");
  if (guard instanceof NextResponse) return guard;
  const { id: leadId } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      name: true,
      category: true,
      adults: true,
      children: true,
      startDate: true,
      endDate: true,
      status: true,
      b2bAgentId: true,
      itinerary: { select: { id: true } },
    },
  });
  if (!lead || lead.b2bAgentId === null) {
    return NextResponse.json({ error: "B2B request not found" }, { status: 404 });
  }

  // Single-itinerary rule: never create a second one.
  if (lead.itinerary) {
    return NextResponse.json({ id: lead.itinerary.id, existing: true });
  }

  const editedByName = (guard.user.name ?? guard.user.email) as string;
  const title = `${lead.name} — Kashmir Itinerary`;
  const data = buildLeadItineraryData(lead) as unknown as Prisma.InputJsonValue;

  const [created] = await prisma.$transaction([
    prisma.itinerary.create({
      data: {
        title,
        status: "DRAFT",
        data,
        ownerId: guard.user.id,
        leadId: lead.id,
        history: {
          create: { title, data, editedById: guard.user.id, editedByName },
        },
      },
      select: { id: true },
    }),
    // Creating the first itinerary is what moves a B2B request out of
    // "Pending" — a no-op update (same value) if it's already IN_PROGRESS.
    ...(lead.status === "NEW"
      ? [prisma.lead.update({ where: { id: lead.id }, data: { status: "IN_PROGRESS" as const } })]
      : []),
  ]);

  return NextResponse.json({ id: created.id }, { status: 201 });
}
