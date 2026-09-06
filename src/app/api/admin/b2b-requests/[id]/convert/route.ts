import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { resolveGst } from "@/lib/payments/gst";
import { convertLeadToBooking, LeadAlreadyConvertedError } from "@/lib/bookings/convertLead";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// GST is required (not nullable/optional, unlike the normal convert route) —
// Phase 5 requires it explicitly provided and validated before a B2B
// conversion, not left to the payment-method-dependent default. resolveGst()
// still correctly nulls it out for a cash payment method regardless.
const schema = z.object({
  bookingAmount: z.coerce.number().positive("Total amount must be greater than zero."),
  tokenAmount: z.coerce.number().positive("Token amount must be greater than zero."),
  paymentMethod: z.string().trim().max(40).nullable().optional(),
  gstPercent: z.coerce.number().min(0).max(100),
});

/**
 * Convert a B2B request into the existing Booking flow. The B2B agent already
 * exists as a User/customer account (lead.b2bAgentId) — this NEVER creates or
 * matches a second account by email, unlike the normal lead path's
 * resolveLeadCustomer(). No commission credit (B2B partner sales have no
 * commission/pricing system yet — explicitly out of scope) and no "new
 * account" credentials email (the agent already has their own login).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("b2bRequests", "edit");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const lead = await prisma.lead.findUnique({ where: { id } });
  // Only B2B requests may use this path — a normal lead id 404s here exactly
  // as a B2B lead id 404s on the normal /api/leads/[id]/convert route.
  if (!lead || lead.b2bAgentId === null) {
    return NextResponse.json({ error: "B2B request not found" }, { status: 404 });
  }
  if (lead.status === "CONVERTED" || lead.locked) {
    return NextResponse.json({ error: "This request is already converted." }, { status: 422 });
  }

  // Same business rule as the normal flow: an itinerary must exist before a
  // request can be converted — it's the agreed plan the booking is built on.
  const itinerary = await prisma.itinerary.findUnique({
    where: { leadId: id },
    select: { id: true },
  });
  if (!itinerary) {
    return NextResponse.json(
      {
        error: "Generate an itinerary for this request before converting.",
        code: "ITINERARY_REQUIRED",
      },
      { status: 422 },
    );
  }

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
  const { bookingAmount, tokenAmount, paymentMethod, gstPercent } = parsed.data;

  const tokenGst = resolveGst(tokenAmount, gstPercent, paymentMethod);

  if (tokenAmount >= bookingAmount) {
    return NextResponse.json(
      { error: "Token amount must be less than the total amount." },
      { status: 422 },
    );
  }

  const performedById = guard.user.id as string;
  const performedByName = (guard.user.name ?? guard.user.email) as string;

  let bookingId: string;
  try {
    ({ bookingId } = await prisma.$transaction((tx) =>
      convertLeadToBooking({
        tx,
        lead,
        // The agent IS the customer/account — never resolved or created via
        // email/phone matching, unlike the normal lead path.
        customerId: lead.b2bAgentId,
        bookingAmount,
        tokenAmount,
        tokenGst,
        paymentMethod: paymentMethod ?? null,
        performedById,
        performedByName,
        creditCommission: false,
      }),
    ));
  } catch (err) {
    if (err instanceof LeadAlreadyConvertedError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  return NextResponse.json({ bookingId }, { status: 201 });
}
