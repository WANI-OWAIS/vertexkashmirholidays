import type { Lead, Prisma } from "@prisma/client";
import { computeBookingFinance } from "@/lib/bookings/finance";
import { computeGstDeduction, computeBookingProfit, computeCommission } from "@/lib/bookings/commission";
import { pickAttribution } from "@/lib/attribution";

/**
 * Thrown when the atomic claim (see below) finds the lead already converted
 * or locked — i.e. a concurrent conversion attempt lost the race, or the
 * lead was genuinely already converted before this request arrived. Callers
 * catch this and map it to a 422, never a 500.
 */
export class LeadAlreadyConvertedError extends Error {
  constructor() {
    super("This lead is already converted.");
  }
}

export interface ConvertLeadToBookingInput {
  tx: Prisma.TransactionClient;
  lead: Lead;
  /**
   * The customer/account this booking belongs to. Callers resolve this
   * themselves BEFORE calling in — normal leads via resolveLeadCustomer()
   * (find-or-create), B2B requests via the already-existing lead.b2bAgentId
   * (never resolved/created here, so this function can never create a
   * second account for an agent who already has one).
   */
  customerId: string | null;
  bookingAmount: number;
  tokenAmount: number;
  tokenGst: { gstPercent: number | null; gstAmount: number | null };
  paymentMethod: string | null;
  performedById: string;
  performedByName: string;
  /**
   * Sales incentive commission — a normal-lead-only concept (the converting
   * staff member's personal conversion rate). B2B partner sales have no
   * commission/pricing system yet (explicitly out of scope), so B2B callers
   * pass false and this step is skipped entirely, not just zeroed.
   */
  creditCommission: boolean;
}

export interface ConvertLeadToBookingResult {
  bookingId: string;
}

/**
 * Shared core of Lead → Booking conversion, used by both the normal lead
 * convert route and the B2B request convert route. Concurrency-safe: the
 * first statement atomically claims the lead (a conditional UPDATE, not a
 * separate check-then-act), so two simultaneous calls for the same lead can
 * never both succeed — the loser's UPDATE matches zero rows and this throws
 * LeadAlreadyConvertedError, causing the whole transaction to roll back
 * before any Booking is created. This closes a real TOCTOU race that
 * previously existed only as a pre-transaction status/locked check.
 */
export async function convertLeadToBooking(
  input: ConvertLeadToBookingInput,
): Promise<ConvertLeadToBookingResult> {
  const {
    tx,
    lead,
    customerId,
    bookingAmount,
    tokenAmount,
    tokenGst,
    paymentMethod,
    performedById,
    performedByName,
    creditCommission,
  } = input;

  // Atomic claim — must be the first statement. A concurrent second call
  // racing this same lead either commits after this one (sees locked: true,
  // status: {not: CONVERTED} no longer matches, count === 0) or is blocked by
  // Postgres's row lock on this UPDATE until this transaction commits, then
  // re-evaluates the same WHERE and also gets count === 0. Either way, only
  // one caller ever proceeds past this point for a given lead.
  const claim = await tx.lead.updateMany({
    where: { id: lead.id, status: { not: "CONVERTED" }, locked: false },
    data: { locked: true },
  });
  if (claim.count === 0) {
    throw new LeadAlreadyConvertedError();
  }

  const travellers = lead.adults + (lead.children ?? 0);
  const booking = await tx.booking.create({
    data: {
      userId: customerId,
      amount: bookingAmount,
      status: "PENDING",
      travelDate: lead.startDate ?? new Date(),
      travelEndDate: lead.endDate ?? null,
      travellers: travellers > 0 ? travellers : 1,
      guestName: lead.name,
      guestEmail: lead.email,
      guestPhone: lead.phone,
      // Attribution is captured once, at Lead creation — copied verbatim
      // here rather than re-derived, per src/lib/attribution.ts. B2B leads
      // typically have none (portal/CRM-created, not ad-driven), in which
      // case this is simply empty — same as any other organic lead.
      ...pickAttribution(lead),
      payments: {
        create: {
          amount: tokenAmount,
          type: "TOKEN",
          method: paymentMethod ?? null,
          gstPercent: tokenGst.gstPercent,
          gstAmount: tokenGst.gstAmount,
          recordedById: performedById,
          note: "Token / advance payment at conversion",
        },
      },
    },
    select: { id: true },
  });

  if (creditCommission) {
    const employee = await tx.user.findUnique({
      where: { id: performedById },
      select: { bookingConversionPct: true },
    });
    const ratePct = employee?.bookingConversionPct;
    if (ratePct != null && ratePct > 0) {
      const finance = computeBookingFinance({
        amount: bookingAmount,
        discountType: null,
        discountValue: 0,
        payments: [{ amount: tokenAmount, type: "TOKEN" }],
        services: [],
      });
      const gstDeduction = computeGstDeduction([
        { amount: tokenAmount, type: "TOKEN", gstAmount: tokenGst.gstAmount },
      ]);
      const profitAmount = computeBookingProfit(finance, gstDeduction);
      await tx.bookingCommission.create({
        data: {
          bookingId: booking.id,
          employeeId: performedById,
          rateSnapshotPct: ratePct,
          profitAmount,
          commissionAmount: computeCommission(profitAmount, ratePct),
        },
      });
    }
  }

  // locked was already set true by the atomic claim above — only the
  // remaining fields need writing here.
  await tx.lead.update({
    where: { id: lead.id },
    data: {
      status: "CONVERTED",
      negotiatedAmount: bookingAmount,
      tokenAmount,
      booking: { connect: { id: booking.id } },
    },
  });

  // Preserve + lock the lead's itinerary as the final canonical one.
  await tx.itinerary.updateMany({
    where: { leadId: lead.id },
    data: { locked: true, status: "CONFIRMED" },
  });

  await tx.leadActivity.createMany({
    data: [
      {
        leadId: lead.id,
        type: "STATUS_CHANGE",
        fromStatus: lead.status,
        toStatus: "CONVERTED",
        performedById,
        performedByName,
      },
      {
        leadId: lead.id,
        type: "BOOKING_LINKED",
        note: `Converted — booking ...${booking.id.slice(-8)}`,
        performedById,
        performedByName,
      },
    ],
  });

  return { bookingId: booking.id };
}
