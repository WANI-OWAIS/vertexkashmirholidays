import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { resolveLeadCustomer } from "@/lib/bookings/customer";
import { sendCustomerCredentialsEmail } from "@/lib/bookings/notify";
import { resolveGst } from "@/lib/payments/gst";
import { convertLeadToBooking, LeadAlreadyConvertedError } from "@/lib/bookings/convertLead";
import { enqueueForLead } from "@/lib/offlineConversion/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  bookingAmount: z.coerce.number().positive("Booking amount must be greater than zero."),
  tokenAmount: z.coerce.number().positive("Token amount must be greater than zero."),
  // Token payment mode + optional GST (GST applies only to non-cash; server recomputes).
  paymentMethod: z.string().trim().max(40).nullable().optional(),
  gstPercent: z.coerce.number().min(0).max(100).nullable().optional(),
});

/**
 * Convert a lead via the dedicated CTA flow. Validates the booking/token amounts,
 * creates (or links) a customer, creates a booking with the token recorded as the
 * first payment, and locks the lead + its itinerary. Returns the new bookingId so
 * the client can redirect to the Add Booking Services page.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("leads", "edit");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const lead = await prisma.lead.findUnique({ where: { id } });
  // B2B requests convert via POST /api/admin/b2b-requests/[id]/convert instead
  // — this route's resolveLeadCustomer() would wrongly create a second
  // account for an agent who already has one, so B2B rows must never reach it.
  if (!lead || lead.b2bAgentId !== null) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Conversion is a lead activity, so only the staff member the lead is assigned
  // to may convert it — not an admin acting on someone else's lead.
  if (lead.assignedToId !== guard.user.id) {
    return NextResponse.json(
      { error: "Only the staff member this lead is assigned to can convert it." },
      { status: 403 },
    );
  }
  if (lead.status === "CONVERTED" || lead.locked) {
    return NextResponse.json({ error: "This lead is already converted." }, { status: 422 });
  }

  // Business rule: an itinerary must be prepared and linked to the lead before it
  // can be converted — the itinerary is the agreed plan the booking is built on.
  // This is the authoritative check (the UI mirrors it for a smoother prompt).
  const itinerary = await prisma.itinerary.findUnique({
    where: { leadId: id },
    select: { id: true },
  });
  if (!itinerary) {
    return NextResponse.json(
      {
        error:
          "Add an itinerary for this lead before converting. The itinerary is required to create the booking.",
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
  const { bookingAmount, tokenAmount, paymentMethod } = parsed.data;

  // GST on the token payment — only for non-cash modes; server-authoritative.
  const tokenGst = resolveGst(tokenAmount, parsed.data.gstPercent, paymentMethod);

  // Token must always be less than the booking amount.
  if (tokenAmount >= bookingAmount) {
    return NextResponse.json(
      { error: "Token amount must be less than the booking amount." },
      { status: 422 },
    );
  }

  const performedById = guard.user.id as string;
  const performedByName = (guard.user.name ?? guard.user.email) as string;

  let result: { bookingId: string; created: boolean; tempPassword: string | null };
  try {
    result = await prisma.$transaction(async (tx) => {
      // Link an existing customer (by email or phone) or create a new one. Returns
      // a temp password when a brand-new customer account was created so we can
      // email default credentials after the transaction commits.
      const customer = await resolveLeadCustomer(tx, {
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
      });

      const { bookingId } = await convertLeadToBooking({
        tx,
        lead,
        customerId: customer.customerId,
        bookingAmount,
        tokenAmount,
        tokenGst,
        paymentMethod: paymentMethod ?? null,
        performedById,
        performedByName,
        creditCommission: true,
      });

      return { bookingId, created: customer.created, tempPassword: customer.tempPassword };
    });
  } catch (err) {
    if (err instanceof LeadAlreadyConvertedError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }

  // Best-effort: email default credentials when a brand-new customer was created
  // and we have an email to send them to. Never blocks/fails the conversion.
  if (result.created && lead.email && result.tempPassword) {
    await sendCustomerCredentialsEmail(lead.email, lead.name, result.tempPassword);
  }

  // Best-effort: queue offline-conversion uploads for any platform this lead
  // has a click ID for. Never blocks/fails the conversion.
  try {
    await enqueueForLead(id);
  } catch (err) {
    console.error("[leads/convert] offline conversion enqueue failed (lead converted):", id, err);
  }

  return NextResponse.json({ bookingId: result.bookingId }, { status: 201 });
}
