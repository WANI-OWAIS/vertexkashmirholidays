import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { buildLeadItineraryData } from "@/lib/itinerary/lead-defaults";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Create the single current itinerary for a lead and seed its history.
 * Enforces: one itinerary per lead, assignment scoping, and the converted-lock.
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
      assignedToId: true,
      status: true,
      b2bAgentId: true,
      itinerary: { select: { id: true } },
    },
  });
  // B2B requests don't have itinerary generation yet (later phase) — this
  // endpoint assumes normal-lead semantics and must never touch a B2B row.
  if (!lead || lead.b2bAgentId !== null) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Creating an itinerary is a lead activity — only the lead's assignee may do it
  // (an admin acting on someone else's lead can only reassign, not manage it).
  if (lead.assignedToId !== guard.user.id) {
    return NextResponse.json(
      { error: "Only the staff member this lead is assigned to can manage its itinerary." },
      { status: 403 },
    );
  }
  if (lead.status === "CONVERTED") {
    return NextResponse.json(
      { error: "Lead is converted — its itinerary is locked." },
      { status: 422 },
    );
  }
  // Single-itinerary rule: never create a second one.
  if (lead.itinerary) {
    return NextResponse.json({ id: lead.itinerary.id, existing: true });
  }

  const editedByName = (guard.user.name ?? guard.user.email) as string;
  const title = `${lead.name} — Kashmir Itinerary`;
  // Seed the itinerary with the lead's customer details (price starts at 0).
  const data = buildLeadItineraryData(lead) as unknown as Prisma.InputJsonValue;

  const created = await prisma.itinerary.create({
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
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
