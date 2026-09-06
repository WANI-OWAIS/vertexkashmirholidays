import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { z } from "zod";
import { BookingStatus } from "@prisma/client";
import { computeBookingFinance, isBookingCompleted } from "@/lib/bookings/finance";
import { bookingWhereForUser } from "@/lib/bookings/scope";
import type { Role } from "@/lib/rbac";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "PAID", "FAILED", "CANCELLED", "REFUNDED"]).optional(),
  discountType: z.enum(["FLAT", "PERCENT"]).nullable().optional(),
  discountValue: z.coerce.number().min(0).optional(),
  inclusions: z.array(z.string().trim().min(1).max(120)).optional(),
  // Customer email — required before services can be locked (invoice destination).
  guestEmail: z.string().trim().email("Enter a valid email address").max(200).optional(),
  // ── Editable booking details (esp. for direct/website bookings) ──
  // Contact info (name/phone/email) is always editable. Trip + money fields
  // (travelDate/travellers/amount) feed the invoice, so they're blocked once
  // services are locked — same rule as the services sheet.
  guestName: z.string().trim().min(2, "Enter the guest's name").max(120).optional(),
  guestPhone: z.string().trim().min(6, "Enter a valid phone number").max(20).optional(),
  travelDate: z.string().trim().min(1).optional(),
  travellers: z.coerce.number().int().positive().max(50).optional(),
  amount: z.coerce.number().min(0).optional(),
});

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await requirePermission("bookings", "view");
  if (guard instanceof NextResponse) return guard;
  const role = guard.user.role as Role;
  const userId = guard.user.id as string;
  const { id } = await params;
  const booking = await prisma.booking.findFirst({
    where: { id, ...bookingWhereForUser(role, userId) },
    include: {
      tour: { select: { title: true, slug: true, coverImage: true, priceFrom: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(booking);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("bookings", "edit");
  if (guard instanceof NextResponse) return guard;
  const role = guard.user.role as Role;
  const userId = guard.user.id as string;
  const { id } = await params;
  const existing = await prisma.booking.findFirst({
    where: { id, ...bookingWhereForUser(role, userId) },
    select: {
      id: true,
      servicesLocked: true,
      amount: true,
      discountType: true,
      discountValue: true,
      travelDate: true,
      payments: { select: { amount: true, type: true } },
      services: { select: { amount: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const {
    status,
    discountType,
    discountValue,
    inclusions,
    guestEmail,
    guestName,
    guestPhone,
    travelDate,
    travellers,
    amount,
  } = parsed.data;

  // Discount, inclusions, travel date, travellers and amount all feed the locked
  // services sheet / emailed invoice — blocked once locked. Contact info
  // (name/phone/email) stays editable at all times.
  const touchesServices =
    discountType !== undefined ||
    discountValue !== undefined ||
    inclusions !== undefined ||
    travelDate !== undefined ||
    travellers !== undefined ||
    amount !== undefined;
  if (touchesServices && existing.servicesLocked) {
    return NextResponse.json(
      {
        error:
          "Services are locked — travel, traveller and amount details can no longer be changed.",
      },
      { status: 423 },
    );
  }

  // Parse + validate a new travel date when supplied.
  let travel: Date | undefined;
  if (travelDate !== undefined) {
    travel = new Date(travelDate);
    if (Number.isNaN(travel.getTime())) {
      return NextResponse.json({ error: "Enter a valid travel date." }, { status: 422 });
    }
  }

  // A reduced booking amount can never drop below what's already been paid or
  // below the current services total (which the amount caps).
  if (amount !== undefined) {
    const paid = existing.payments.reduce((t, p) => t + p.amount, 0);
    const servicesTotal = existing.services.reduce((t, s) => t + s.amount, 0);
    const floor = Math.max(paid, servicesTotal);
    if (amount < floor) {
      return NextResponse.json(
        {
          error: `Amount can't be less than ₹${floor.toLocaleString("en-IN")} (already paid / services total).`,
        },
        { status: 422 },
      );
    }
  }

  // ── Cancellation business rule (server-authoritative) ──
  // Admin-only, matching the UI's isAdmin-gated CANCEL/REFUND buttons —
  // enforced here too so a SALES/EDITOR user with `bookings:edit` can't reach
  // it by calling the API directly. Both the "nothing paid" Cancel action and
  // the "something paid, refund it" Refund action land on the same CANCELLED
  // status (see BookingsClient.tsx) — the only thing this blocks is a
  // *completed* booking (fully paid AND the travel date has already passed):
  // nothing is owed either way at that point, so there's nothing left to
  // cancel or refund. REFUNDED remains a valid status value (e.g. for
  // historical records / direct API use) but nothing in the UI sets it anymore.
  if (status === "CANCELLED" || status === "REFUNDED") {
    if (role !== "ADMIN" && role !== "SUPERADMIN") {
      return NextResponse.json(
        { error: "Only an administrator can cancel or refund a booking." },
        { status: 403 },
      );
    }
  }
  if (status === "CANCELLED") {
    const finance = computeBookingFinance({
      amount: existing.amount,
      discountType: existing.discountType,
      discountValue: existing.discountValue,
      payments: existing.payments,
      services: [],
    });
    if (isBookingCompleted(finance.paymentStatus, existing.travelDate)) {
      return NextResponse.json(
        { error: "This booking is already completed and can no longer be cancelled." },
        { status: 422 },
      );
    }
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status: status as BookingStatus } : {}),
      ...(discountType !== undefined ? { discountType } : {}),
      ...(discountValue !== undefined ? { discountValue } : {}),
      ...(inclusions !== undefined ? { inclusions: JSON.stringify(inclusions) } : {}),
      ...(guestEmail !== undefined ? { guestEmail } : {}),
      ...(guestName !== undefined ? { guestName } : {}),
      ...(guestPhone !== undefined ? { guestPhone } : {}),
      ...(travel !== undefined ? { travelDate: travel } : {}),
      ...(travellers !== undefined ? { travellers } : {}),
      ...(amount !== undefined ? { amount } : {}),
    },
  });

  // A cancelled/refunded booking can no longer earn/keep a commission. Rows
  // already PAID are left untouched — reversing money already paid to an
  // employee is a manual finance decision, not something to auto-flip here.
  if (status === "CANCELLED" || status === "REFUNDED") {
    await prisma.bookingCommission.updateMany({
      where: { bookingId: id, status: { in: ["EXPECTED", "EARNED"] } },
      data: { status: "REVERSED" },
    });
  }

  return NextResponse.json(updated);
}

/**
 * Delete a booking (admin). Soft delete by default (sets `deletedAt`, hiding it
 * from every listing/report while retaining the row + its payment/service
 * history). Pass `?permanent=1` to remove the row irreversibly — Prisma cascade
 * rules then delete its BookingPayment + BookingService rows (no orphans), and
 * any linked lead's `bookingId` is set null.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("bookings", "delete");
  if (guard instanceof NextResponse) return guard;
  const role = guard.user.role as Role;
  const userId = guard.user.id as string;
  const { id } = await params;

  const existing = await prisma.booking.findFirst({
    where: { id, ...bookingWhereForUser(role, userId) },
    select: { id: true, deletedAt: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const permanent = new URL(req.url).searchParams.get("permanent") === "1";

  if (permanent) {
    // Cascade (schema onDelete) removes BookingPayment + BookingService rows and
    // nulls Lead.bookingId — the delete is atomic and leaves no orphans.
    await prisma.booking.delete({ where: { id } });
    return NextResponse.json({ ok: true, mode: "permanent" });
  }

  if (existing.deletedAt) {
    return NextResponse.json({ error: "Booking is already deleted." }, { status: 422 });
  }
  await prisma.booking.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true, mode: "soft" });
}
