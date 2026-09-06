import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { sendPaymentInvoiceEmail } from "@/lib/bookings/notify";
import { resolveGst } from "@/lib/payments/gst";
import { computeBookingFinance, isBookingCompleted } from "@/lib/bookings/finance";
import { syncBookingCommission } from "@/lib/bookings/commissionSync";
import { bookingWhereForUser } from "@/lib/bookings/scope";
import type { Role } from "@/lib/rbac";
import type { PaymentType } from "@prisma/client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  type: z.enum(["TOKEN", "PARTIAL", "FINAL", "REFUND"]).optional(),
  method: z.string().trim().max(40).nullable().optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  // Optional GST percent — only applied for non-cash methods (server recomputes).
  gstPercent: z.coerce.number().min(0).max(100).nullable().optional(),
});

/** Record an additional payment against a booking (token/partial/final/refund). */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("bookings", "edit");
  if (guard instanceof NextResponse) return guard;
  const role = guard.user.role as Role;
  const userId = guard.user.id as string;
  const { id } = await params;

  const booking = await prisma.booking.findFirst({
    where: { id, ...bookingWhereForUser(role, userId) },
    select: {
      id: true,
      amount: true,
      discountType: true,
      discountValue: true,
      travelDate: true,
      status: true,
      payments: { select: { amount: true, type: true } },
    },
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 422 },
    );
  }
  const d = parsed.data;
  const isRefund = (d.type ?? "PARTIAL") === "REFUND";

  const finance = computeBookingFinance({
    amount: booking.amount,
    discountType: booking.discountType,
    discountValue: booking.discountValue,
    payments: booking.payments,
    services: [],
  });

  if (isRefund) {
    // A completed booking (fully paid AND the travel date has passed) has
    // nothing left to refund — matches the Cancel/Refund CTA visibility rule
    // in BookingsClient.tsx / api/bookings/[id]/route.ts.
    if (isBookingCompleted(finance.paymentStatus, booking.travelDate)) {
      return NextResponse.json(
        { error: "This booking is completed and can no longer be refunded." },
        { status: 422 },
      );
    }
  } else {
    // A payment can never exceed the remaining balance (server-authoritative).
    if (finance.balance <= 0) {
      return NextResponse.json(
        { error: "This booking is already fully paid. No further payment can be recorded." },
        { status: 422 },
      );
    }
    if (d.amount > finance.balance) {
      return NextResponse.json(
        {
          error: `Payment (₹${d.amount.toLocaleString("en-IN")}) exceeds the remaining balance (₹${finance.balance.toLocaleString("en-IN")}).`,
        },
        { status: 422 },
      );
    }
  }

  // GST is server-authoritative: applied only to non-cash methods, recomputed here.
  const { gstPercent, gstAmount } = resolveGst(d.amount, d.gstPercent, d.method);

  const created = await prisma.bookingPayment.create({
    data: {
      bookingId: id,
      amount: d.amount,
      type: (d.type ?? "PARTIAL") as PaymentType,
      method: d.method ?? null,
      reference: d.reference ?? null,
      note: d.note ?? null,
      gstPercent,
      gstAmount,
      recordedById: guard.user.id as string,
    },
  });

  // A refund IS a cancellation — a booking with money going back out isn't
  // going ahead. Only the payment ledger records how much was returned.
  if (isRefund && booking.status !== "CANCELLED") {
    await prisma.booking.update({ where: { id }, data: { status: "CANCELLED" } });
  }

  await syncBookingCommission(prisma, id);

  // Branded payment receipt email + PDF (best-effort, never blocks the record).
  const { delivered: emailed } = await sendPaymentInvoiceEmail(id, created.id);

  return NextResponse.json({ ...created, emailed }, { status: 201 });
}
