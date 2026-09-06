import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ItineraryEditor } from "@/components/admin/itinerary/ItineraryEditor";
import { itineraryDataSchema, genId, type ItineraryData } from "@/types/itinerary";
import { DEFAULT_ITINERARY_DATA } from "@/components/admin/itinerary/default-data";
import { resolveItineraryAccess } from "@/lib/itinerary/access";
import { applyLeadFactsToItinerary } from "@/lib/itinerary/lead-defaults";
import { resolvePrimaryOffice } from "@/lib/companyOffice";
import { getPdfTrustContent, toItineraryWhyChoose } from "@/lib/itinerary/pdfTrustContent";

export const metadata: Metadata = { title: "Edit Itinerary — Admin" };
export const dynamic = "force-dynamic";

export default async function EditItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !(await can(role, "itinerary", "view"))) {
    redirect("/admin/itinerary");
  }

  const { id } = await params;
  const record = await prisma.itinerary.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          assignedToId: true,
          status: true,
          locked: true,
          category: true,
          adults: true,
          children: true,
          startDate: true,
          endDate: true,
          b2bAgentId: true,
        },
      },
      booking: {
        select: {
          servicesLocked: true,
          razorpayOrderId: true,
          guestName: true,
          travellers: true,
          travelDate: true,
          travelEndDate: true,
          amount: true,
        },
      },
    },
  });
  // B2B itineraries live at /admin/b2b-itineraries/[id] — this page's
  // resolveItineraryAccess() has no B2B concept (and would incorrectly let an
  // admin merely view, never edit, a B2B row via its assignee-based rule).
  if (!record || record.lead?.b2bAgentId != null) notFound();

  const access = resolveItineraryAccess(record, { id: session!.user.id, role });
  if (!access.canView) redirect("/admin/itinerary");

  const parsed = itineraryDataSchema.safeParse(record.data);
  let data: ItineraryData = parsed.success ? parsed.data : DEFAULT_ITINERARY_DATA;

  // For booking-linked itineraries, always merge the current booking facts on load
  // so the cover reflects live data (name, dates, travellers, amount) without
  // requiring a manual booking-save to trigger a sync first.
  if (record.booking) {
    const bk = record.booking;
    const withFacts = applyLeadFactsToItinerary(data, {
      name: bk.guestName,
      category: null,
      adults: bk.travellers,
      children: null,
      startDate: bk.travelDate,
      endDate: bk.travelEndDate ?? null,
    });
    data = {
      ...withFacts,
      totalCost: `Rs ${bk.amount.toLocaleString("en-IN")}/-`,
    };
  }

  const canSave = (await can(role, "itinerary", "edit")) && access.canEdit;

  const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  const { address: companyAddress } = await resolvePrimaryOffice(settings);
  const trustContent = await getPdfTrustContent();

  // Why Choose Vertex is editable itinerary content (like `trust`), but
  // itineraries saved before that field existed parse it as `[]` (schema
  // default) — backfill real copy the first time one of those loads, same
  // spirit as the booking-facts merge above. Not written back until the next
  // explicit Save, matching how that merge behaves too.
  if (data.whyChoose.length === 0 && trustContent.whyChoose.length > 0) {
    data = { ...data, whyChoose: toItineraryWhyChoose(trustContent.whyChoose) };
  }

  // Same backfill for Included Activities — itineraries saved before that
  // field existed parse it as `[]` too. Default to the one activity common
  // to nearly every package (Shikara Ride); staff can delete it per
  // itinerary same as any other activity row. Not written back until the
  // next explicit Save.
  if (data.activities.length === 0) {
    data = {
      ...data,
      activities: DEFAULT_ITINERARY_DATA.activities.map((a) => ({ ...a, id: genId("act") })),
    };
  }

  const leadSync = record.lead
    ? {
        leadId: record.lead.id,
        name: record.lead.name,
        category: record.lead.category,
        adults: record.lead.adults,
        children: record.lead.children,
        startDate: record.lead.startDate
          ? new Date(record.lead.startDate).toISOString().slice(0, 10)
          : "",
        endDate: record.lead.endDate
          ? new Date(record.lead.endDate).toISOString().slice(0, 10)
          : "",
      }
    : undefined;

  return (
    <div className="space-y-3">
      {record.lead && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <Link
            href={`/admin/leads/${record.lead.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to lead: {record.lead.name}
          </Link>
          {access.locked && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              <Lock className="h-3.5 w-3.5" />
              Final itinerary — locked (lead converted)
            </span>
          )}
        </div>
      )}
      {record.bookingId && !record.lead && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <Link
            href={`/admin/bookings/${record.bookingId}/services`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to booking: {record.bookingId.slice(-8).toUpperCase()}
          </Link>
          {access.locked && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
              <Lock className="h-3.5 w-3.5" />
              View-only — services locked
            </span>
          )}
        </div>
      )}
      <ItineraryEditor
        id={record.id}
        initialData={data}
        initialTitle={record.title}
        initialStatus={record.status}
        canSave={canSave}
        leadSync={leadSync}
        lockCost={!!record.bookingId && !!record.booking?.razorpayOrderId}
        isBookingLinked={!!record.bookingId}
        companyAddress={companyAddress}
        trustContent={trustContent}
        socialLinks={{
          instagram: settings?.instagram,
          facebook: settings?.facebook,
          youtube: settings?.youtube,
        }}
      />
    </div>
  );
}
