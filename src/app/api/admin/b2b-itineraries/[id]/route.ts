import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { itineraryDataSchema } from "@/types/itinerary";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Deliberately separate from /api/itineraries/[id] (which gates edit access
// via resolveItineraryAccess()'s assignee-only rule — B2B requests have no
// assignee concept). Both routes key by the ITINERARY id; this one only ever
// serves itineraries whose lead has b2bAgentId set, so a normal itinerary id
// 404s here exactly as a B2B one 404s on the generic route.
async function loadB2bItinerary(id: string) {
  const record = await prisma.itinerary.findUnique({
    where: { id },
    include: { lead: { select: { id: true, b2bAgentId: true } } },
  });
  if (!record || record.lead?.b2bAgentId == null) return null;
  return record;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("itinerary", "view");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const record = await loadB2bItinerary(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: record.id,
    title: record.title,
    status: record.status,
    leadId: record.leadId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    data: record.data,
  });
}

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(["DRAFT", "SENT", "CONFIRMED"]).optional(),
  data: itineraryDataSchema.optional(),
});

/**
 * Update/regenerate a B2B itinerary. Never touches Lead.status — it's already
 * IN_PROGRESS from creation (see .../b2b-requests/[id]/itinerary POST), and
 * an update is defined to keep it there, i.e. simply not change it.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("itinerary", "edit");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const existing = await loadB2bItinerary(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 422 },
    );
  }

  const editedByName = (guard.user.name ?? guard.user.email) as string;

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.itinerary.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.data !== undefined ? { data: parsed.data.data } : {}),
        lastEditedById: guard.user.id,
      },
      select: { id: true, updatedAt: true },
    }),
  ];

  // Version history — same convention as the normal itinerary route.
  if (parsed.data.data !== undefined) {
    ops.push(
      prisma.itineraryHistory.create({
        data: {
          itineraryId: id,
          title: parsed.data.title ?? existing.title,
          data: parsed.data.data,
          editedById: guard.user.id,
          editedByName,
        },
      }),
    );
  }

  const [updated] = await prisma.$transaction(ops);
  return NextResponse.json(updated);
}
