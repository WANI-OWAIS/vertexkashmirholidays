import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { LeadStatus, LeadSource, LeadCategory, LeadActivityType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { itineraryDataSchema } from "@/types/itinerary";
import { applyLeadFactsToItinerary } from "@/lib/itinerary/lead-defaults";
import { isAdminRole } from "@/lib/itinerary/access";
import { notifyLeadAssigned, notifyLeadUnassigned } from "@/lib/notifications";
import { phoneField } from "@/lib/leads/schema";

type Params = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("leads", "view");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { performedAt: "desc" } },
      assignedTo: { select: { id: true, name: true, email: true } },
      booking: {
        select: { id: true, status: true, amount: true, travelDate: true, guestName: true },
      },
    },
  });
  // B2B requests are managed exclusively via /api/admin/b2b-requests — this
  // endpoint assumes normal-lead semantics and must never touch a B2B row.
  if (!lead || lead.b2bAgentId !== null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // SALES users can only view leads assigned to them.
  const role = (guard.user as { role: string }).role;
  if (role === "SALES" && lead.assignedToId !== (guard.user.id as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(lead);
}

const patchSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  phone: phoneField.optional(),
  email: z.string().email("Enter a valid email").nullable().optional(),
  source: z.nativeEnum(LeadSource).optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  assignedToId: z.string().nullable().optional(),
  notes: z.string().optional(),
  category: z.nativeEnum(LeadCategory).nullable().optional(),
  adults: z.coerce.number().int().positive().optional(),
  children: z.coerce.number().int().min(0).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  followUpAt: z.string().nullable().optional(),
  bookingId: z.string().nullable().optional(),
  negotiatedAmount: z.coerce.number().positive().nullable().optional(),
  tokenAmount: z.coerce.number().positive().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("leads", "edit");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const existing = await prisma.lead.findUnique({
    where: { id },
    include: { itinerary: { select: { id: true, title: true, locked: true, data: true } } },
  });
  if (!existing || existing.b2bAgentId !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Access split: an admin's only lead power is (re)assignment; every other lead
  // change (status, details, notes, follow-up, booking link, amounts) belongs to
  // the staff member the lead is assigned to. Both rules are applied per-field
  // after the body is parsed (see below).
  const role = (guard.user as { role: string }).role;
  const userId = guard.user.id as string;
  const admin = isAdminRole(role);
  const isAssignee = existing.assignedToId === userId;
  // An unassigned lead has no owner, so an admin may act on it freely (any
  // operation). Once a lead is assigned, an admin's only power is reassignment;
  // all other work belongs to the assignee.
  const canManage = isAssignee || (admin && existing.assignedToId === null);

  // Locked (converted) leads cannot be edited until an admin unlocks them.
  if (existing.locked) {
    return NextResponse.json(
      { error: "This lead is locked. An admin must unlock it before editing." },
      { status: 423 },
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const {
    status,
    assignedToId,
    startDate,
    endDate,
    notes,
    followUpAt,
    bookingId,
    negotiatedAmount,
    tokenAmount,
    ...rest
  } = parsed.data;

  // Changing a lead's assignee is an admin-only action.
  const assignmentChanged =
    assignedToId !== undefined && (assignedToId ?? null) !== (existing.assignedToId ?? null);
  if (assignmentChanged && !admin) {
    return NextResponse.json(
      { error: "Only an admin can change a lead's assignee." },
      { status: 403 },
    );
  }

  // Any non-assignment change is a lead activity reserved for the assignee — an
  // admin acting on someone else's lead may only reassign it, nothing more.
  const sameTime = (a: Date | null, b: string | null | undefined) =>
    (a ? a.getTime() : null) === (b ? new Date(b).getTime() : null);
  const workChanged =
    (status !== undefined && status !== existing.status) ||
    (notes !== undefined && notes !== (existing.notes ?? "")) ||
    (followUpAt !== undefined && !sameTime(existing.followUpAt, followUpAt)) ||
    (bookingId !== undefined && (bookingId ?? null) !== (existing.bookingId ?? null)) ||
    (negotiatedAmount !== undefined &&
      (negotiatedAmount ?? null) !== (existing.negotiatedAmount ?? null)) ||
    (tokenAmount !== undefined && (tokenAmount ?? null) !== (existing.tokenAmount ?? null)) ||
    (startDate !== undefined && !sameTime(existing.startDate, startDate)) ||
    (endDate !== undefined && !sameTime(existing.endDate, endDate)) ||
    (rest.name !== undefined && rest.name !== existing.name) ||
    (rest.phone !== undefined && rest.phone !== existing.phone) ||
    (rest.email !== undefined && (rest.email ?? null) !== (existing.email ?? null)) ||
    (rest.source !== undefined && rest.source !== existing.source) ||
    (rest.category !== undefined && (rest.category ?? null) !== (existing.category ?? null)) ||
    (rest.adults !== undefined && rest.adults !== existing.adults) ||
    (rest.children !== undefined && (rest.children ?? null) !== (existing.children ?? null));
  if (workChanged && !canManage) {
    return NextResponse.json(
      { error: "Only the staff member this lead is assigned to can update it." },
      { status: 403 },
    );
  }

  // Business rule: travel end can't precede travel start. Compare the effective
  // values (incoming where provided, otherwise the stored ones) so a partial
  // update that touches only one date is still validated against the other.
  const effStart =
    startDate !== undefined ? (startDate ? new Date(startDate) : null) : existing.startDate;
  const effEnd = endDate !== undefined ? (endDate ? new Date(endDate) : null) : existing.endDate;
  if (effStart && effEnd && effEnd.getTime() < effStart.getTime()) {
    return NextResponse.json(
      { error: "Travel end date can't be before the start date." },
      { status: 422 },
    );
  }

  if (bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true },
    });
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  // Conversion is an intentional CTA flow (POST /api/leads/[id]/convert), never a
  // casual status edit — block CONVERTED from the normal status update path.
  if (status === LeadStatus.CONVERTED) {
    return NextResponse.json(
      { error: "Use the Convert action to convert a lead." },
      { status: 422 },
    );
  }

  const performedByName = (guard.user.name ?? guard.user.email) as string;
  const performedById = guard.user.id as string;

  const bookingChanged =
    bookingId !== undefined && (bookingId ?? null) !== (existing.bookingId ?? null);

  // Keep the linked (unlocked) itinerary's lead-derived cover fields in sync
  // when the lead's trip facts change — especially dates.
  const itin = existing.itinerary;
  const tripFactsTouched =
    rest.name !== undefined ||
    rest.category !== undefined ||
    rest.adults !== undefined ||
    rest.children !== undefined ||
    startDate !== undefined ||
    endDate !== undefined;

  const itinerarySyncOps: Prisma.PrismaPromise<unknown>[] = [];
  if (itin && !itin.locked && tripFactsTouched) {
    const parsedItin = itineraryDataSchema.safeParse(itin.data);
    if (parsedItin.success) {
      const facts = {
        name: rest.name ?? existing.name,
        category: rest.category !== undefined ? rest.category : existing.category,
        adults: rest.adults ?? existing.adults,
        children: rest.children !== undefined ? rest.children : existing.children,
        startDate:
          startDate !== undefined ? (startDate ? new Date(startDate) : null) : existing.startDate,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : existing.endDate,
      };
      const nextData = applyLeadFactsToItinerary(parsedItin.data, facts);
      const changed =
        nextData.preparedFor !== parsedItin.data.preparedFor ||
        nextData.travelDates !== parsedItin.data.travelDates ||
        nextData.duration !== parsedItin.data.duration ||
        nextData.travelers !== parsedItin.data.travelers ||
        nextData.packageType !== parsedItin.data.packageType;
      if (changed) {
        const jsonData = nextData as unknown as Prisma.InputJsonValue;
        itinerarySyncOps.push(
          prisma.itinerary.update({
            where: { id: itin.id },
            data: { data: jsonData, lastEditedById: performedById },
          }),
          prisma.itineraryHistory.create({
            data: {
              itineraryId: itin.id,
              title: itin.title,
              data: jsonData,
              editedById: performedById,
              editedByName: performedByName,
            },
          }),
        );
      }
    }
  }

  const [updated] = await prisma.$transaction([
    prisma.lead.update({
      where: { id },
      data: {
        ...rest,
        ...(notes !== undefined && { notes }),
        ...(status !== undefined && { status }),
        ...(negotiatedAmount !== undefined && { negotiatedAmount }),
        ...(tokenAmount !== undefined && { tokenAmount }),
        ...(bookingId !== undefined && {
          booking: bookingId ? { connect: { id: bookingId } } : { disconnect: true },
        }),
        ...(assignedToId !== undefined && {
          assignedTo: assignedToId ? { connect: { id: assignedToId } } : { disconnect: true },
        }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(followUpAt !== undefined && { followUpAt: followUpAt ? new Date(followUpAt) : null }),
      },
    }),
    ...(status !== undefined && status !== existing.status
      ? [
          prisma.leadActivity.create({
            data: {
              leadId: id,
              type: LeadActivityType.STATUS_CHANGE,
              fromStatus: existing.status,
              toStatus: status,
              performedById,
              performedByName,
            },
          }),
        ]
      : []),
    ...(assignedToId !== undefined && assignedToId !== existing.assignedToId
      ? [
          prisma.leadActivity.create({
            data: {
              leadId: id,
              type: LeadActivityType.ASSIGNMENT_CHANGE,
              fromAssigneeId: existing.assignedToId,
              toAssigneeId: assignedToId,
              performedById,
              performedByName,
            },
          }),
        ]
      : []),
    ...(notes !== undefined && notes.trim() !== "" && notes !== (existing.notes ?? "")
      ? [
          prisma.leadActivity.create({
            data: {
              leadId: id,
              type: LeadActivityType.NOTE_ADDED,
              note: notes,
              performedById,
              performedByName,
            },
          }),
        ]
      : []),
    ...(followUpAt !== undefined &&
    (followUpAt ? new Date(followUpAt).getTime() : null) !==
      (existing.followUpAt ? existing.followUpAt.getTime() : null)
      ? [
          prisma.leadActivity.create({
            data: {
              leadId: id,
              type: LeadActivityType.FOLLOW_UP_SCHEDULED,
              note: followUpAt
                ? `Scheduled for ${new Date(followUpAt).toISOString().slice(0, 16).replace("T", " ")}`
                : "Follow-up cleared",
              performedById,
              performedByName,
            },
          }),
        ]
      : []),
    ...(bookingChanged
      ? [
          prisma.leadActivity.create({
            data: {
              leadId: id,
              type: LeadActivityType.BOOKING_LINKED,
              note: bookingId ? `Linked to booking ...${bookingId.slice(-8)}` : "Booking unlinked",
              performedById,
              performedByName,
            },
          }),
        ]
      : []),
    // Sync lead trip facts into the linked itinerary's cover fields.
    ...itinerarySyncOps,
  ]);

  // Post-commit, best-effort: notify the affected staff (in-app + email). On a
  // reassignment both the removed and the added owner are informed.
  if (assignmentChanged) {
    const leadForNotify = {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      email: updated.email,
      category: updated.category,
      startDate: updated.startDate,
    };
    const newAssignee = assignedToId ?? null;
    const oldAssignee = existing.assignedToId ?? null;
    if (oldAssignee && oldAssignee !== newAssignee) {
      await notifyLeadUnassigned(oldAssignee, leadForNotify, performedByName);
    }
    if (newAssignee && newAssignee !== oldAssignee) {
      await notifyLeadAssigned(newAssignee, leadForNotify, performedByName);
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("leads", "delete");
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing || existing.b2bAgentId !== null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Converted leads are permanent business records and cannot be deleted.
  if (existing.status === LeadStatus.CONVERTED) {
    return NextResponse.json({ error: "A converted lead cannot be deleted." }, { status: 422 });
  }

  // Cascade rules (schema onDelete) clean up the linked itinerary, its history,
  // and the lead's activity timeline — no orphan records remain.
  await prisma.lead.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
