import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { b2bLeadWhere } from "@/lib/b2b/leadScope";
import { B2B_STATUS_LABELS, type B2bRequestStatus } from "@/lib/b2b/requestStatus";
import { B2bItineraryDownloadButton } from "@/components/account/B2bItineraryDownloadButton";

export const metadata: Metadata = { title: "Request Details" };
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

/**
 * Single B2B request, strictly scoped to the authenticated agent's own via
 * b2bLeadWhere (server-side — an id belonging to a different agent 404s
 * rather than leaking existence, never relies on client-side filtering).
 * Itinerary section is read-only (download only, no generate/edit — that's
 * CRM-only, see /admin/b2b-itineraries). Booking section links straight into
 * the existing /account/bookings/[id] page — no new booking UI at all.
 */
export default async function AccountRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.agencyStatus === null) {
    redirect("/account");
  }

  const { id } = await params;
  const request = await prisma.lead.findFirst({
    where: { id, ...b2bLeadWhere(session.user.id) },
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
      bookingId: true,
      locked: true,
      createdAt: true,
      itinerary: { select: { status: true, updatedAt: true } },
    },
  });
  if (!request) notFound();

  const status = request.status as B2bRequestStatus;
  const itineraryReady = !!request.itinerary && request.itinerary.status !== "DRAFT";

  return (
    <div className="space-y-5">
      <Link
        href="/account/requests"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to My Requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">{request.name}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex rounded-full bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
            {B2B_STATUS_LABELS[status] ?? request.status}
          </span>
          {!request.locked && (
            <Link
              href={`/account/requests/${request.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-foreground transition hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Guest</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{request.name}</p>
          <p className="text-sm text-muted-foreground">{request.phone}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Trip</p>
          <p className="mt-1 text-sm text-foreground">
            {request.days ? `${request.days} days` : "Days not specified"} · {request.adults}
            {request.children ? ` + ${request.children} children` : ""} pax
            {request.rooms ? ` · ${request.rooms} rooms` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {fmtDate(request.startDate)} — {fmtDate(request.endDate)}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Budget</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {request.budget ? inr.format(request.budget) : "Not specified"}
          </p>
        </div>
        {request.notes && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:col-span-2 lg:col-span-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Other Requirements
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{request.notes}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-display font-bold text-foreground">Itinerary</h2>
        {itineraryReady ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Updated {fmtDate(request.itinerary!.updatedAt)}
            </p>
            <B2bItineraryDownloadButton requestId={request.id} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Not available yet — our team is preparing your itinerary.
          </p>
        )}
      </div>

      {request.bookingId && (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display font-bold text-foreground">Booking</h2>
          <div className="mt-3">
            <Link
              href={`/account/bookings/${request.bookingId}`}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" />
              View Booking
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
