import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { itineraryDataSchema } from "@/types/itinerary";
import { resolveItineraryAccess } from "@/lib/itinerary/access";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Itinerary + the minimal lead fields needed to resolve access.
const ACCESS_SELECT = {
  ownerId: true,
  leadId: true,
  bookingId: true,
  locked: true,
  title: true,
  data: true,
  lead: { select: { assignedToId: true, locked: true, b2bAgentId: true } },
  booking: { select: { servicesLocked: true } },
} as const;

/**
 * Extract a numeric amount from the itinerary's free-form "total cost" string
 * (e.g. "Rs 30,500/-" → 30500). Returns null when no positive number is present.
 * Used to keep the lead's negotiated amount in sync with the proposed price.
 */
function parseProposedAmount(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = parseFloat(digits);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("itinerary", "view");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const record = await prisma.itinerary.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true } },
      lead: { select: { id: true, assignedToId: true, locked: true, b2bAgentId: true } },
      booking: { select: { servicesLocked: true } },
    },
  });
  // B2B itineraries are managed exclusively via /api/admin/b2b-itineraries —
  // this route's resolveItineraryAccess() has no B2B concept, so a B2B row
  // must never reach it (an admin's view-any-lead bypass would otherwise let
  // one through).
  if (!record || record.lead?.b2bAgentId != null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = resolveItineraryAccess(record, { id: guard.user.id, role: guard.user.role });
  if (!access.canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    id: record.id,
    title: record.title,
    status: record.status,
    ownerId: record.ownerId,
    ownerName: record.owner?.name ?? null,
    leadId: record.leadId,
    bookingId: record.bookingId,
    locked: access.locked,
    canEdit: access.canEdit,
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

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("itinerary", "edit");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const existing = await prisma.itinerary.findUnique({ where: { id }, select: ACCESS_SELECT });
  // B2B itineraries are managed exclusively via /api/admin/b2b-itineraries.
  if (!existing || existing.lead?.b2bAgentId != null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = resolveItineraryAccess(existing, { id: guard.user.id, role: guard.user.role });
  if (!access.canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access.canEdit) {
    return NextResponse.json(
      {
        error: access.locked
          ? "This itinerary is locked because the lead is converted and can no longer be edited."
          : "Forbidden",
      },
      { status: 403 },
    );
  }

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

  // Snapshot a history row (version history) whenever content changes for a
  // lead- OR booking-linked itinerary.
  if ((existing.leadId || existing.bookingId) && parsed.data.data !== undefined) {
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

    // Lead-only: sync the proposed package cost into the lead's negotiated amount
    // (tentative until conversion). Only while the lead is unlocked; the Convert
    // modal then prefills its Booking Amount from this. No-op if no positive number.
    if (existing.leadId && !existing.lead?.locked) {
      const proposed = parseProposedAmount(parsed.data.data.totalCost);
      if (proposed != null) {
        ops.push(
          prisma.lead.update({
            where: { id: existing.leadId },
            data: { negotiatedAmount: proposed },
          }),
        );
      }
    }
  }

  const [updated] = await prisma.$transaction(ops);
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("itinerary", "delete");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const existing = await prisma.itinerary.findUnique({ where: { id }, select: ACCESS_SELECT });
  // B2B itineraries are managed exclusively via /api/admin/b2b-itineraries.
  if (!existing || existing.lead?.b2bAgentId != null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = resolveItineraryAccess(existing, { id: guard.user.id, role: guard.user.role });
  if (!access.canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Linked itineraries (to a lead or a direct booking) are the record that
  // customer/lead relies on — never deletable, regardless of lock state.
  if (existing.leadId || existing.bookingId) {
    return NextResponse.json(
      { error: "This itinerary is linked to a lead/booking and can't be deleted." },
      { status: 422 },
    );
  }

  await prisma.itinerary.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
