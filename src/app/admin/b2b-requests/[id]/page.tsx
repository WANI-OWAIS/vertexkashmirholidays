import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, FileEdit, ExternalLink } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/siteSettings";
import { parseGstRates } from "@/lib/payments/gst";
import { CreateB2bItineraryButton } from "@/components/admin/b2b/CreateB2bItineraryButton";
import { B2bConvertAction } from "@/components/admin/b2b/B2bConvertAction";
import { B2B_STATUS_LABELS as STATUS_LABELS, type B2bRequestStatus } from "@/lib/b2b/requestStatus";

export const metadata: Metadata = { title: "B2B Request — Admin" };
export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AdminB2bRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !(await can(role, "b2bRequests", "view"))) {
    redirect("/admin/b2b-requests");
  }

  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      adults: true,
      children: true,
      days: true,
      rooms: true,
      budget: true,
      startDate: true,
      endDate: true,
      notes: true,
      status: true,
      createdById: true,
      createdAt: true,
      b2bAgentId: true,
      bookingId: true,
      b2bAgent: { select: { id: true, name: true, email: true, agencyName: true } },
      itinerary: { select: { id: true, status: true, updatedAt: true } },
    },
  });
  if (!lead || lead.b2bAgentId === null) notFound();

  const canManageItinerary = await can(role, "itinerary", "create");
  const canConvert = await can(role, "b2bRequests", "edit");
  const settings = canConvert ? await getSiteSettings() : null;
  const gstRates = parseGstRates(settings?.gstRates);

  return (
    <div className="space-y-5">
      <Link
        href="/admin/b2b-requests"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to B2B Requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">{lead.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lead.b2bAgent?.agencyName ?? lead.b2bAgent?.name} · {lead.b2bAgent?.email}
          </p>
        </div>
        <span className="inline-flex rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
          {STATUS_LABELS[lead.status as B2bRequestStatus] ?? lead.status}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Guest</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{lead.name}</p>
          <p className="text-sm text-muted-foreground">{lead.phone}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Trip</p>
          <p className="mt-1 text-sm text-foreground">
            {lead.days ? `${lead.days} days` : "Days not specified"} · {lead.adults}
            {lead.children ? ` + ${lead.children} children` : ""} pax
            {lead.rooms ? ` · ${lead.rooms} rooms` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {fmtDate(lead.startDate)} — {fmtDate(lead.endDate)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Budget</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {lead.budget ? inr.format(lead.budget) : "Not specified"}
          </p>
        </div>
        {lead.notes && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:col-span-2 lg:col-span-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Other Requirements
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{lead.notes}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">Itinerary</h2>
        {lead.itinerary ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Status: <span className="font-semibold text-foreground">{lead.itinerary.status}</span> ·
              Last updated {fmtDate(lead.itinerary.updatedAt)}
            </p>
            {canManageItinerary && (
              <Link
                href={`/admin/b2b-itineraries/${lead.itinerary.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"
              >
                <FileEdit className="h-4 w-4" />
                Edit Itinerary
              </Link>
            )}
          </div>
        ) : canManageItinerary ? (
          <div className="mt-3">
            <p className="mb-3 text-sm text-muted-foreground">
              No itinerary yet — this request stays Pending until one is generated.
            </p>
            <CreateB2bItineraryButton leadId={lead.id} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No itinerary yet.</p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">Booking</h2>
        {lead.bookingId ? (
          <div className="mt-3">
            <Link
              href={`/admin/bookings/${lead.bookingId}/services`}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
              View Booking
            </Link>
          </div>
        ) : canConvert ? (
          <div className="mt-3">
            <p className="mb-3 text-sm text-muted-foreground">
              {lead.itinerary
                ? "Ready to convert once amounts are confirmed with the agent."
                : "Generate an itinerary before this request can be converted."}
            </p>
            <B2bConvertAction
              leadId={lead.id}
              guestName={lead.name}
              gstRates={gstRates}
              hasItinerary={!!lead.itinerary}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Not converted yet.</p>
        )}
      </div>
    </div>
  );
}
