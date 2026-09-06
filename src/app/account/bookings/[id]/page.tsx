import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft,
  MapPin,
  Car,
  Ticket,
  Package,
  CalendarDays,
  Users,
  FileText,
  Download,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { computeBookingFinance, isBookingCompleted, PAYMENT_STATUS_LABELS } from "@/lib/bookings/finance";
import { customerBookingWhere } from "@/lib/account/bookingScope";
import {
  groupServiceTables,
  parseInclusions,
  type ServiceKind,
} from "@/lib/bookings/serviceDisplay";
import { ItineraryDownloadButton } from "@/components/account/ItineraryDownloadButton";
import { B2bItineraryDownloadButton } from "@/components/account/B2bItineraryDownloadButton";

export const metadata: Metadata = { title: "Booking Details" };
export const dynamic = "force-dynamic";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const STATUS_STYLES: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PAID: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-300",
  CANCELLED: "bg-muted text-muted-foreground",
  REFUNDED: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

const KIND_ICONS: Record<ServiceKind, typeof MapPin> = {
  HOTEL: MapPin,
  TRANSPORT: Car,
  ACTIVITY: Ticket,
  OTHER: Package,
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  TOKEN: "Token",
  PARTIAL: "Partial",
  FINAL: "Final",
  REFUND: "Refund",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function AccountBookingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Scope strictly to the authenticated customer (by account or their verified
  // email) — never another user's booking.
  const booking = await prisma.booking.findFirst({
    where: { id, ...customerBookingWhere(session.user.id, session.user.email) },
    include: {
      tour: { select: { title: true } },
      services: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      payments: { orderBy: { createdAt: "asc" } },
      itinerary: { select: { title: true, status: true, updatedAt: true } },
      leads: {
        take: 1,
        select: {
          id: true,
          b2bAgentId: true,
          itinerary: { select: { title: true, status: true, updatedAt: true } },
        },
      },
    },
  });
  if (!booking) notFound();

  // Lead-converted bookings have no itinerary of their own — they use the
  // originating lead's (see business-rules.md → Itinerary Rules). Only a
  // SENT/CONFIRMED itinerary is shown; a DRAFT is still a staff work-in-progress.
  const originatingLead = booking.leads[0] ?? null;
  const itinerary = booking.itinerary ?? originatingLead?.itinerary ?? null;
  const itineraryVisible = !!itinerary && itinerary.status !== "DRAFT";
  // A B2B-converted booking downloads the agent-branded quotation PDF (see
  // B2bItineraryPdf.tsx), never the normal photo-heavy customer document —
  // this page is shared by both, so the two download paths must diverge here.
  const b2bRequestId = originatingLead?.b2bAgentId ? originatingLead.id : null;

  const finance = computeBookingFinance({
    amount: booking.amount,
    discountType: booking.discountType,
    discountValue: booking.discountValue,
    payments: booking.payments,
    services: booking.services,
  });
  const completed = isBookingCompleted(finance.paymentStatus, booking.travelDate);

  const serviceTables = groupServiceTables(booking.services);
  const inclusions = parseInclusions(booking.inclusions);
  const ref = booking.id.slice(-8).toUpperCase();
  const statusLabel = PAYMENT_STATUS_LABELS[finance.paymentStatus];
  // The booking-summary invoice exists only once services are finalised (locked).
  const invoiceAvailable = booking.servicesLocked;

  return (
    <div className="space-y-5">
      <Link
        href="/account/bookings"
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to my bookings
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              {booking.tour?.title ?? "Custom Booking"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">Ref: {ref}</p>
          </div>
          {completed ? (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
              Completed
            </span>
          ) : (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-bold",
                STATUS_STYLES[booking.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {booking.status}
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-[12px] text-muted-foreground">Travel date</p>
              <p className="font-semibold text-foreground">
                {booking.travelDate.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-[12px] text-muted-foreground">Travellers</p>
              <p className="font-semibold text-foreground">{booking.travellers}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trip itinerary */}
      {itineraryVisible && itinerary && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-foreground">Your Itinerary</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {itinerary.title} · Updated{" "}
                {itinerary.updatedAt.toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            {b2bRequestId ? (
              <B2bItineraryDownloadButton requestId={b2bRequestId} />
            ) : (
              <ItineraryDownloadButton bookingId={booking.id} />
            )}
          </div>
        </div>
      )}

      {/* Service details — no per-service prices */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display font-bold text-foreground">Your Trip Includes</h2>
        {serviceTables.length === 0 && inclusions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Service details will appear here once your trip is finalised.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {serviceTables.map((g) => {
              const Icon = KIND_ICONS[g.kind];
              return (
                <div key={g.kind}>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
                    <Icon className="h-3.5 w-3.5" /> {g.title}
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                          {g.headers.map((h) => (
                            <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {g.rows.map((r, ri) => (
                          <tr key={ri}>
                            {r.map((c, ci) => (
                              <td
                                key={ci}
                                className={cn(
                                  "px-3 py-2",
                                  ci === 0
                                    ? "font-semibold text-foreground"
                                    : "text-muted-foreground",
                                )}
                              >
                                {c}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {inclusions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
                  Additional Inclusions
                </p>
                <div className="flex flex-wrap gap-2">
                  {inclusions.map((inc, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      {inc}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Driver & vehicle — shown once staff assign one */}
      {booking.driverName && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-display font-bold text-foreground">
            <Car className="h-4 w-4 text-primary" /> Your Driver &amp; Vehicle
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { label: "Driver", value: booking.driverName },
              { label: "Driver Phone", value: booking.driverPhone },
              { label: "Vehicle", value: booking.vehicleName },
              { label: "Vehicle Number", value: booking.vehicleNumber },
            ].map((f) => (
              <div key={f.label} className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-[12px] uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-foreground break-words">
                  {f.value || "—"}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-muted-foreground">
            Your driver will contact you before pickup.
          </p>
        </div>
      )}

      {/* Price summary */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display font-bold text-foreground">Price Summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Total Booking Amount" value={inr.format(finance.bookingAmount)} />
          {finance.discountAmount > 0 && (
            <Row label="Discount" value={`– ${inr.format(finance.discountAmount)}`} />
          )}
          <Row label="Payable" value={inr.format(finance.effectivePayable)} strong />
          <Row label="Paid" value={inr.format(finance.paidAmount)} />
          <div className="border-t border-border pt-2">
            <Row label="Remaining Balance" value={inr.format(finance.balance)} strong />
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-block rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-bold text-primary">
            {statusLabel}
          </span>
          {invoiceAvailable && (
            <a
              href={`/api/account/bookings/${booking.id}/invoice`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/10"
            >
              <FileText className="h-3.5 w-3.5" /> Download Invoice (PDF)
            </a>
          )}
        </div>
      </div>

      {/* Payment history for this booking */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display font-bold text-foreground">Payment History</h2>
        {booking.payments.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Method</th>
                  <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                  <th className="py-2 text-right font-semibold">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {booking.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                      {p.createdAt.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-2 pr-3 font-semibold text-foreground">
                      {PAYMENT_TYPE_LABELS[p.type] ?? p.type}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{p.method ?? "—"}</td>
                    <td className="py-2 pr-3 text-right font-bold text-foreground">
                      {inr.format(p.amount)}
                    </td>
                    <td className="py-2 text-right">
                      <a
                        href={`/api/account/bookings/${booking.id}/payments/${p.id}/receipt`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Download receipt"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-foreground", strong ? "font-extrabold" : "font-semibold")}>
        {value}
      </dd>
    </div>
  );
}
