"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  Lock,
  X,
  Hotel,
  Car,
  Ticket,
  Package,
  Wallet,
  CheckCircle2,
  Mail,
  AlertTriangle,
  Pencil,
  Check,
  UserRound,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { computeBookingFinance, round2 } from "@/lib/bookings/finance";
import { PAYMENT_METHODS, isCashMethod } from "@/lib/payments/gst";
import { canEditDriver, type DriverDetails } from "@/lib/bookings/driver";
import { isValidPhone, PHONE_MESSAGE } from "@/lib/auth/validation";

type Kind = "HOTEL" | "TRANSPORT" | "ACTIVITY" | "OTHER";

interface Service {
  id: string;
  kind: Kind;
  name: string;
  amount: number;
  location: string | null;
  nights: number | null;
  roomType: string | null;
  pickup: string | null;
  dropoff: string | null;
  timing: string | null;
  sortOrder: number;
}

interface Payment {
  id: string;
  amount: number;
  type: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  gstPercent: number | null;
  gstAmount: number | null;
  createdAt: string;
}

interface BookingData {
  id: string;
  amount: number;
  status: string;
  servicesLocked: boolean;
  createdAt: string;
  discountType: string | null;
  discountValue: number;
  inclusions: string[];
  travelDate: string;
  travelEndDate: string | null;
  travellers: number;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string;
  address: string | null;
  requirements: string | null;
  tourTitle: string | null;
  isWebsiteBooking: boolean;
  customer: { name: string | null; email: string } | null;
  lead: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    assignedTo: { name: string | null; email: string } | null;
  } | null;
  services: Service[];
  payments: Payment[];
  driver: DriverDetails | null;
}

type FieldKey =
  "name" | "location" | "nights" | "roomType" | "pickup" | "dropoff" | "timing" | "amount";
interface FieldDef {
  key: FieldKey;
  label: string;
  type: "text" | "number";
}

const SECTIONS: {
  kind: Kind;
  title: string;
  icon: typeof Hotel;
  addLabel: string;
  fields: FieldDef[];
}[] = [
  {
    kind: "HOTEL",
    title: "Hotel Details",
    icon: Hotel,
    addLabel: "Add Hotel",
    fields: [
      { key: "name", label: "Hotel Name", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "roomType", label: "Room Type", type: "text" },
      { key: "nights", label: "Nights", type: "number" },
      { key: "amount", label: "Amount", type: "number" },
    ],
  },
  {
    kind: "TRANSPORT",
    title: "Transport",
    icon: Car,
    addLabel: "Add Cab",
    fields: [
      { key: "name", label: "Cab Name", type: "text" },
      { key: "pickup", label: "Pick", type: "text" },
      { key: "dropoff", label: "Drop", type: "text" },
      { key: "amount", label: "Amount", type: "number" },
    ],
  },
  {
    kind: "ACTIVITY",
    title: "Activities",
    icon: Ticket,
    addLabel: "Add Activity",
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "timing", label: "Timing", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "amount", label: "Price", type: "number" },
    ],
  },
  {
    kind: "OTHER",
    title: "Other",
    icon: Package,
    addLabel: "Add Item",
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "amount", label: "Amount", type: "number" },
    ],
  },
];

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// "12 Jul 2026 – 18 Jul 2026" when an end date exists and differs, else the single date.
function formatTravel(start: string, end: string | null): string {
  if (end && new Date(end).getTime() !== new Date(start).getTime()) {
    return `${fmtDate(start)} – ${fmtDate(end)}`;
  }
  return fmtDate(start);
}
// Booking details are editable only when travel is at least 2 full days away.
function canEditDetails(travelDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const travel = new Date(travelDate);
  travel.setHours(0, 0, 0, 0);
  return (travel.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) >= 2;
}

const inputCls =
  "w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary disabled:opacity-60";

let draftSeq = 0;

export function BookingServicesClient({
  booking,
  gstRates,
  canEdit,
}: {
  booking: BookingData;
  gstRates: number[];
  /** `bookings:edit` permission — distinct from the time-based edit window below. */
  canEdit: boolean;
}) {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>(booking.services);
  const [drafts, setDrafts] = useState<Service[]>([]);
  // Draft ids that have completed their first auto-save (i.e. are now genuinely
  // persisted server-side) — the draft itself stays in `drafts` for rendering,
  // but this lets hasHotel/hasTransport below see it without waiting for a
  // page refresh to re-fetch `booking.services`.
  const [savedDraftIds, setSavedDraftIds] = useState<Set<string>>(new Set());
  // Live amounts lifted from rows on blur (keyed by row id, drafts included), so
  // totals recalc as soon as an amount field is edited. Each row also persists
  // itself on blur (auto-save) — there is no per-row manual Save step.
  const [liveAmounts, setLiveAmounts] = useState<Record<string, number>>({});
  const [payments, setPayments] = useState<Payment[]>(booking.payments);
  const [discountType, setDiscountType] = useState<string>(booking.discountType ?? "");
  const [discountValue, setDiscountValue] = useState<string>(
    booking.discountValue ? String(booking.discountValue) : "",
  );
  const [inclusions, setInclusions] = useState<string[]>(booking.inclusions);
  const [inclusionInput, setInclusionInput] = useState("");
  const [locked, setLocked] = useState(booking.servicesLocked);
  const [savingMeta, startMeta] = useTransition();
  // Customer email — required before services can be locked (the invoice is sent
  // there). Pre-filled from the booking/customer/lead; can be added inline.
  const [email, setEmail] = useState<string>(
    booking.guestEmail ?? booking.customer?.email ?? booking.lead?.email ?? "",
  );
  // Lock flow dialog: "email" prompts for a missing email, "confirm" confirms the
  // lock. Replaces the old window.confirm() so we never use a browser alert.
  const [dialog, setDialog] = useState<null | "email" | "confirm">(null);
  const [savingEmail, startSaveEmail] = useTransition();
  // Edit booking details (guest contact + trip/amount) — esp. for direct bookings.
  const [editOpen, setEditOpen] = useState(false);
  const withinEditWindow = canEditDetails(booking.travelDate);

  // Amount actually in effect for a row: the live (blurred) value if present, else
  // the persisted amount. Drafts default to 0 until edited.
  const amountOf = (row: Service) => liveAmounts[row.id] ?? row.amount;

  // Services as the finance calc sees them — persisted + drafts, with live amounts.
  const effectiveServices = useMemo(
    () => [...services, ...drafts].map((s) => ({ amount: amountOf(s) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [services, drafts, liveAmounts],
  );

  const finance = useMemo(
    () =>
      computeBookingFinance({
        amount: booking.amount,
        discountType: discountType || null,
        discountValue: discountValue ? parseFloat(discountValue) : 0,
        payments,
        services: effectiveServices,
      }),
    [booking.amount, discountType, discountValue, payments, effectiveServices],
  );

  // Record a row's amount on blur so totals react immediately.
  function setLiveAmount(id: string, amount: number) {
    setLiveAmounts((prev) => (prev[id] === amount ? prev : { ...prev, [id]: amount }));
  }

  function capError(amount: number, excludeId: string | null): string | null {
    const others = [...services, ...drafts]
      .filter((s) => s.id !== excludeId)
      .reduce((t, s) => t + amountOf(s), 0);
    if (round2(others + amount) > booking.amount) {
      return `Services total would exceed the booking amount (${inr(booking.amount)}).`;
    }
    return null;
  }

  function addDraft(kind: Kind) {
    setDrafts((d) => [
      ...d,
      {
        id: `draft-${++draftSeq}`,
        kind,
        name: "",
        amount: 0,
        location: null,
        nights: null,
        roomType: null,
        pickup: null,
        dropoff: null,
        timing: null,
        sortOrder: services.length + d.length,
      },
    ]);
  }

  function markDraftSaved(id: string) {
    setSavedDraftIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  // ── discount / inclusions persistence ──
  function saveBookingMeta(patch: Record<string, unknown>) {
    startMeta(async () => {
      try {
        const res = await fetch(`/api/bookings/${booking.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j.error ?? "Save failed.");
          return;
        }
        toast.success("Saved.");
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  function saveDiscount() {
    saveBookingMeta({
      discountType: discountType || null,
      discountValue: discountValue ? parseFloat(discountValue) : 0,
    });
  }

  function addInclusion() {
    const v = inclusionInput.trim();
    if (!v) return;
    const next = [...inclusions, v];
    setInclusions(next);
    setInclusionInput("");
    saveBookingMeta({ inclusions: next });
  }
  function removeInclusion(i: number) {
    const next = inclusions.filter((_, idx) => idx !== i);
    setInclusions(next);
    saveBookingMeta({ inclusions: next });
  }

  // ── lock services ──
  const [locking, startLock] = useTransition();

  // At least one persisted HOTEL and one TRANSPORT row must exist before locking.
  // A draft counts once its first auto-save has completed (savedDraftIds) — it's
  // genuinely persisted server-side by then, even though it still renders from
  // the `drafts` array until the next full data refetch.
  const hasHotel =
    services.some((s) => s.kind === "HOTEL") ||
    drafts.some((d) => d.kind === "HOTEL" && savedDraftIds.has(d.id));
  const hasTransport =
    services.some((s) => s.kind === "TRANSPORT") ||
    drafts.some((d) => d.kind === "TRANSPORT" && savedDraftIds.has(d.id));
  const canLock = hasHotel && hasTransport;

  // Open the lock flow: block on an over-cap total, then route to the email prompt
  // (when no customer email yet) or straight to the confirm dialog.
  function openLock() {
    if (finance.servicesTotal > booking.amount) {
      toast.error(
        `Services total (${inr(finance.servicesTotal)}) exceeds the booking amount (${inr(booking.amount)}).`,
      );
      return;
    }
    setDialog(email.trim() ? "confirm" : "email");
  }

  // Persist a newly entered customer email, then advance to the confirm step.
  function saveEmailAndContinue(value: string) {
    const next = value.trim();
    startSaveEmail(async () => {
      try {
        const res = await fetch(`/api/bookings/${booking.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestEmail: next }),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(typeof j.error === "string" ? j.error : "Could not save the email.");
          return;
        }
        setEmail(next);
        toast.success("Customer email saved.");
        setDialog("confirm");
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  function performLock() {
    startLock(async () => {
      try {
        const res = await fetch(`/api/bookings/${booking.id}/lock-services`, { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          emailed?: boolean;
          error?: string;
          code?: string;
        };
        if (!res.ok) {
          // Server is authoritative: if it still reports a missing email, route the
          // user back to the email prompt instead of just showing a toast.
          if (j.code === "EMAIL_REQUIRED") {
            toast.error(j.error ?? "A customer email is required.");
            setDialog("email");
            return;
          }
          toast.error(j.error ?? "Failed to lock services.");
          return;
        }
        setLocked(true);
        setDialog(null);
        toast.success(
          j.emailed ? "Services locked. Summary emailed to customer." : "Services locked.",
        );
        router.refresh();
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-bold text-foreground text-sm">Booking Details</h3>
          {canEdit && withinEditWindow ? (
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit Details
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Lock className="w-3.5 h-3.5" /> Editing closed
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-xs">
          <Detail
            label="Customer"
            value={booking.lead?.name ?? booking.customer?.name ?? booking.guestName}
            sub={booking.lead?.phone ?? booking.guestPhone}
          />
          <Detail label="Email" value={email || "Not provided"} />
          <Detail
            label="Source"
            value={
              booking.lead
                ? "Converted lead"
                : booking.tourTitle
                  ? "Website booking"
                  : "Direct booking"
            }
            sub={booking.tourTitle ?? undefined}
          />
          {/* Assignee comes from the originating lead — absent for direct/website bookings. */}
          {booking.lead?.assignedTo && (
            <Detail
              label="Assignee"
              value={booking.lead.assignedTo.name ?? booking.lead.assignedTo.email}
              sub={booking.lead.assignedTo.name ? booking.lead.assignedTo.email : undefined}
            />
          )}
          <Detail label="Order Date" value={fmtDateTime(booking.createdAt)} />
          <Detail
            label="Travel Dates"
            value={formatTravel(booking.travelDate, booking.travelEndDate)}
            sub={`${booking.travellers} traveller${booking.travellers === 1 ? "" : "s"}`}
          />
          {booking.address && <Detail label="Address" value={booking.address} />}
          {booking.requirements && <Detail label="Requirements" value={booking.requirements} />}
          <Detail label="Booking Amount" value={inr(finance.bookingAmount)} strong />
          <Detail label="Paid Amount" value={inr(finance.paidAmount)} strong />
          <Detail label="Balance" value={inr(finance.balance)} strong />
        </div>

        {/* Email is mandatory to lock services (invoice destination). */}
        {!email.trim() && !locked && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-semibold text-amber-700 dark:text-amber-300">
                Customer email required
              </p>
              <p className="text-muted-foreground mt-0.5">
                Add a customer email before locking services — the invoice is emailed to the
                customer.
              </p>
            </div>
            <button
              onClick={() => setDialog("email")}
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg"
            >
              <Mail className="w-3.5 h-3.5" /> Add Email
            </button>
          </div>
        )}
      </div>

      {/* Service sections */}
      {SECTIONS.map((section) => {
        const persisted = services.filter((s) => s.kind === section.kind);
        const sectionDrafts = drafts.filter((s) => s.kind === section.kind);
        const sectionTotal = [...persisted, ...sectionDrafts].reduce((t, s) => t + amountOf(s), 0);
        const Icon = section.icon;
        return (
          <div
            key={section.kind}
            className="bg-card rounded-2xl border border-border shadow-sm p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <Icon className="w-4 h-4" /> {section.title}
              </h3>
              <span className="text-xs text-muted-foreground">
                Total: <span className="font-bold text-foreground">{inr(sectionTotal)}</span>
              </span>
            </div>

            <div className="space-y-2">
              {persisted.length === 0 && sectionDrafts.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No {section.title.toLowerCase()} added.
                </p>
              )}
              {persisted.map((svc) => (
                <ServiceRow
                  key={svc.id}
                  bookingId={booking.id}
                  record={svc}
                  fields={section.fields}
                  locked={locked}
                  canEdit={canEdit}
                  capError={capError}
                  onAmountBlur={setLiveAmount}
                  onRemoved={() => setServices((prev) => prev.filter((x) => x.id !== svc.id))}
                />
              ))}
              {sectionDrafts.map((svc) => (
                <ServiceRow
                  key={svc.id}
                  bookingId={booking.id}
                  record={svc}
                  isDraft
                  fields={section.fields}
                  locked={locked}
                  canEdit={canEdit}
                  capError={capError}
                  onAmountBlur={setLiveAmount}
                  onRemoved={() => setDrafts((prev) => prev.filter((x) => x.id !== svc.id))}
                  onSaved={() => markDraftSaved(svc.id)}
                />
              ))}
            </div>

            {!locked && canEdit && (
              <button
                onClick={() => addDraft(section.kind)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary border border-dashed border-primary/40 px-3 py-1.5 rounded-lg hover:bg-primary/10"
              >
                <Plus className="w-3.5 h-3.5" /> {section.addLabel}
              </button>
            )}
          </div>
        );
      })}

      {/* Inclusions */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
        <h3 className="font-bold text-foreground text-sm mb-3">Inclusions</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {inclusions.length === 0 && (
            <p className="text-xs text-muted-foreground">No inclusions added.</p>
          )}
          {inclusions.map((inc, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs font-medium bg-muted text-foreground px-2.5 py-1 rounded-full"
            >
              {inc}
              {!locked && canEdit && (
                <button
                  onClick={() => removeInclusion(i)}
                  aria-label={`Remove inclusion ${i + 1}`}
                  className="text-muted-foreground hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        {!locked && canEdit && (
          <div className="flex gap-2">
            <input
              value={inclusionInput}
              onChange={(e) => setInclusionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addInclusion();
                }
              }}
              placeholder="e.g. Meals, Cab, Sightseeing…"
              className={inputCls}
            />
            <button
              onClick={addInclusion}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-primary border border-border px-3 py-1.5 rounded-lg hover:bg-primary/10"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        )}
      </div>

      {/* Discount + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
          <h3 className="font-bold text-foreground text-sm mb-3">Discount</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-semibold text-muted-foreground">Type</span>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                disabled={locked || !canEdit}
                className={`${inputCls} mt-1`}
              >
                <option value="">None</option>
                <option value="FLAT">Flat (₹)</option>
                <option value="PERCENT">Percent (%)</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-muted-foreground">Value</span>
              <input
                type="number"
                min={0}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                disabled={locked || !canEdit || !discountType}
                className={`${inputCls} mt-1`}
              />
            </label>
          </div>
          {!locked && canEdit && (
            <button
              onClick={saveDiscount}
              disabled={savingMeta}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary/90 disabled:opacity-50"
            >
              {savingMeta && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save Discount
            </button>
          )}
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
          <h3 className="font-bold text-foreground text-sm mb-3">Price Summary</h3>
          <dl className="space-y-1.5 text-sm">
            <Row label="Total Booking Amount" value={inr(finance.bookingAmount)} />
            <Row label="Services Total" value={inr(finance.servicesTotal)} muted />
            <Row label="Discount" value={`– ${inr(finance.discountAmount)}`} />
            <Row label="Effective Payable" value={inr(finance.effectivePayable)} strong />
            <Row label="Paid Amount" value={inr(finance.paidAmount)} />
            <div className="border-t border-border pt-1.5 mt-1.5">
              <Row label="Net Balance" value={inr(finance.balance)} strong />
            </div>
          </dl>
          {finance.servicesTotal > booking.amount && (
            <p className="mt-2 text-[12px] text-red-500 dark:text-red-400">
              Services total exceeds the booking amount.
            </p>
          )}
        </div>
      </div>

      {/* Payments ledger */}
      <PaymentsCard
        bookingId={booking.id}
        payments={payments}
        gstRates={gstRates}
        balance={finance.balance}
        travelDate={booking.travelDate}
        canEdit={canEdit}
        onAdded={(p) => setPayments((prev) => [...prev, p])}
        onUpdated={(p) => setPayments((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
        onRemoved={(pid) => setPayments((prev) => prev.filter((x) => x.id !== pid))}
      />

      {/* Lock CTA */}
      {!locked ? (
        canEdit && (
          <div className="flex flex-col items-end gap-2">
            {!canLock && (
              <p className="text-xs text-muted-foreground">
                Add at least one
                {!hasHotel && !hasTransport
                  ? " hotel and one cab"
                  : !hasHotel
                    ? " hotel"
                    : " cab"}{" "}
                before locking.
              </p>
            )}
            <button
              onClick={openLock}
              disabled={locking || !canLock}
              className="inline-flex items-center gap-2 text-sm font-bold bg-amber-600 text-white px-5 py-2.5 rounded-xl hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {locking ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
              Lock Services &amp; Email Summary
            </button>
          </div>
        )
      ) : (
        <div className="flex items-center gap-2 justify-end text-xs text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 text-green-600" /> Services are locked. A summary was
          emailed to the customer.
        </div>
      )}

      {dialog && (
        <LockDialog
          mode={dialog}
          initialEmail={email}
          customerName={booking.lead?.name ?? booking.customer?.name ?? booking.guestName}
          savingEmail={savingEmail}
          locking={locking}
          onClose={() => setDialog(null)}
          onSaveEmail={saveEmailAndContinue}
          onConfirm={performLock}
        />
      )}

      {editOpen && (
        <EditDetailsModal
          booking={booking}
          locked={locked}
          canEdit={withinEditWindow}
          isWebsiteBooking={booking.isWebsiteBooking}
          paidAmount={finance.paidAmount}
          servicesTotal={finance.servicesTotal}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Edit booking details ──────────────────────────────────────────────────────
// Correct the guest's contact details and (while services are unlocked) the trip
// dates, traveller count and booking amount. Built primarily for direct/website
// bookings, where these values come straight from the customer's checkout form.
function EditDetailsModal({
  booking,
  locked,
  canEdit,
  isWebsiteBooking,
  paidAmount,
  servicesTotal,
  onClose,
  onSaved,
}: {
  booking: BookingData;
  locked: boolean;
  canEdit: boolean;
  isWebsiteBooking: boolean;
  paidAmount: number;
  servicesTotal: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [guestName, setGuestName] = useState(booking.guestName);
  const [guestPhone, setGuestPhone] = useState(booking.guestPhone);
  const [guestEmail, setGuestEmail] = useState(booking.guestEmail ?? "");
  const [address, setAddress] = useState(booking.address ?? "");
  const [requirements, setRequirements] = useState(booking.requirements ?? "");
  const [travelDate, setTravelDate] = useState(booking.travelDate.slice(0, 10));
  const [travelEndDate, setTravelEndDate] = useState(
    booking.travelEndDate ? booking.travelEndDate.slice(0, 10) : "",
  );
  const [travellers, setTravellers] = useState(String(booking.travellers));
  const [amount, setAmount] = useState(String(booking.amount));
  const [saving, start] = useTransition();

  const tripFieldsEditable = !locked && canEdit;

  // A reduced amount can't fall below what's already paid or the services total.
  const amountFloor = Math.max(paidAmount, servicesTotal);

  function submit() {
    if (guestName.trim().length < 2) return toast.error("Enter the guest's name.");
    if (guestPhone.trim().length < 6) return toast.error("Enter a valid phone number.");
    if (guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      return toast.error("Enter a valid email address.");
    }

    const payload: Record<string, unknown> = {
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      guestEmail: guestEmail.trim() || undefined,
      address: address.trim() || null,
      requirements: requirements.trim() || null,
    };

    if (tripFieldsEditable) {
      if (!travelDate) return toast.error("Choose a travel date.");
      const t = parseInt(travellers, 10);
      if (!t || t < 1) return toast.error("Enter the number of travellers.");
      const amt = parseFloat(amount);
      if (Number.isNaN(amt) || amt < 0) return toast.error("Enter a valid amount.");
      if (amt < amountFloor)
        return toast.error(
          `Amount can't be less than ${inr(amountFloor)} (already paid / services total).`,
        );
      payload.travelDate = travelDate;
      payload.travelEndDate = travelEndDate || null;
      payload.travellers = t;
      payload.amount = amt;
    }

    start(async () => {
      try {
        const res = await fetch(`/api/bookings/${booking.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        if (!res.ok) {
          const msg = typeof j.error === "string" ? j.error : "Could not save the booking details.";
          toast.error(msg);
          return;
        }
        toast.success("Booking details updated.");
        onSaved();
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  const fieldCls =
    "w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-lg rounded-2xl bg-card p-5 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="mb-4 flex items-center justify-between">
          <h4 className="font-display text-base font-bold text-foreground">Edit booking details</h4>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Guest name <span className="text-red-500">*</span>
            </label>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className={fieldCls}
              placeholder="Full name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                className={fieldCls}
                placeholder="+91 …"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className={fieldCls}
                placeholder="customer@example.com"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Address
            </label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={fieldCls}
              placeholder="Billing / correspondence address"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Special requirements
            </label>
            <textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              rows={2}
              className={fieldCls}
              placeholder="Any dietary, accessibility or other requirements…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Start date
              </label>
              <input
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                disabled={!tripFieldsEditable}
                className={fieldCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                End date
              </label>
              <input
                type="date"
                value={travelEndDate}
                onChange={(e) => setTravelEndDate(e.target.value)}
                disabled={!tripFieldsEditable}
                className={fieldCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Travellers
              </label>
              <input
                type="number"
                min={1}
                value={travellers}
                onChange={(e) => setTravellers(e.target.value)}
                disabled={!tripFieldsEditable}
                className={fieldCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Booking amount (₹)
              </label>
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!tripFieldsEditable || isWebsiteBooking}
                className={fieldCls}
              />
            </div>
          </div>
          {isWebsiteBooking && (
            <div className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[12px]">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <p className="text-muted-foreground">
                Online booking — package price was fixed at checkout and cannot be changed.
              </p>
            </div>
          )}
          {!tripFieldsEditable && amountFloor > 0 && locked && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px]">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-muted-foreground">
                Services are locked — travel date, travellers and amount can no longer be changed.
                Contact details remain editable.
              </p>
            </div>
          )}
          {!tripFieldsEditable && !locked && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px]">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-muted-foreground">
                Trip details cannot be changed within 2 days of travel. Contact details remain
                editable.
              </p>
            </div>
          )}
          {tripFieldsEditable && !isWebsiteBooking && amountFloor > 0 && (
            <p className="text-[12px] text-muted-foreground">
              Minimum amount: {inr(amountFloor)} (already paid / services total).
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={submit}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Driver & vehicle section ──────────────────────────────────────────────────
// Appears after services are locked. Staff can add the assigned driver/vehicle
// and optionally email the customer; details remain editable until one day
// before travel, after which the card is read-only. Rendered from the parent
// page (right column, below Payment & Account) rather than here — exported
// for that.
export function DriverSection({
  bookingId,
  travelDate,
  initialDriver,
  canEdit,
}: {
  bookingId: string;
  travelDate: string;
  initialDriver: DriverDetails | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [driver, setDriver] = useState<DriverDetails | null>(initialDriver);
  const [open, setOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const editable = canEditDriver(travelDate) && canEdit;

  const empty: DriverDetails = {
    driverName: "",
    driverPhone: "",
    vehicleNumber: "",
    vehicleName: "",
  };
  const [form, setForm] = useState<DriverDetails>(initialDriver ?? empty);
  const [sendEmail, setSendEmail] = useState(true);

  function openModal() {
    setForm(driver ?? empty);
    setSendEmail(true);
    setOpen(true);
  }

  function submit() {
    if (form.driverName.trim().length < 2) return toast.error("Enter the driver's name.");
    if (!isValidPhone(form.driverPhone.trim(), "IN")) return toast.error(PHONE_MESSAGE);
    if (form.vehicleNumber.trim().length < 4) return toast.error("Enter the vehicle number.");
    if (form.vehicleName.trim().length < 2) return toast.error("Enter the vehicle name.");

    startSave(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/driver`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driverName: form.driverName.trim(),
            driverPhone: form.driverPhone.trim(),
            vehicleNumber: form.vehicleNumber.trim(),
            vehicleName: form.vehicleName.trim(),
            sendEmail,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to save driver details.",
          );
        setDriver({
          driverName: data.driverName,
          driverPhone: data.driverPhone,
          vehicleNumber: data.vehicleNumber,
          vehicleName: data.vehicleName,
        });
        setOpen(false);
        if (data.requestedEmail) {
          toast.success(
            data.emailed
              ? "Driver details saved and emailed to the customer."
              : "Driver details saved (email could not be sent).",
          );
        } else {
          toast.success("Driver details saved.");
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save driver details.");
      }
    });
  }

  const fieldCls =
    "w-full px-2.5 py-2 text-sm border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-bold text-foreground text-sm">
          <Car className="w-4 h-4 text-primary" /> Driver &amp; Vehicle
        </h3>
        {driver
          ? editable && (
              <button
                onClick={openModal}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )
          : editable && (
              <button
                onClick={openModal}
                className="inline-flex items-center gap-1.5 text-sm font-bold bg-primary text-white px-4 py-2 rounded-xl hover:brightness-110"
              >
                <Plus className="w-4 h-4" /> Add Driver
              </button>
            )}
      </div>

      {driver ? (
        <div className="mt-4 grid grid-cols-1 gap-3">
          <DriverFact icon={UserRound} label="Driver" value={driver.driverName} />
          <DriverFact icon={Phone} label="Driver Phone" value={driver.driverPhone} />
          <DriverFact icon={Car} label="Vehicle" value={driver.vehicleName} />
          <DriverFact icon={Car} label="Vehicle Number" value={driver.vehicleNumber} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {editable
            ? "No driver assigned yet. Add the driver and vehicle for this trip."
            : "No driver was assigned, and details can no longer be added (within one day of travel)."}
        </p>
      )}

      {driver && !editable && (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Editing is closed — driver details can only be changed up to one day before travel.
        </p>
      )}

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-display text-base font-bold text-foreground">
                {driver ? "Edit driver details" : "Add driver details"}
              </h4>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Driver name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.driverName}
                  onChange={(e) => setForm({ ...form, driverName: e.target.value })}
                  className={fieldCls}
                  placeholder="e.g. Bashir Ahmad"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Driver phone <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.driverPhone}
                  onChange={(e) => setForm({ ...form, driverPhone: e.target.value })}
                  className={fieldCls}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Vehicle name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.vehicleName}
                  onChange={(e) => setForm({ ...form, vehicleName: e.target.value })}
                  className={fieldCls}
                  placeholder="e.g. Toyota Innova Crysta"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Vehicle number <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.vehicleNumber}
                  onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })}
                  className={fieldCls}
                  placeholder="e.g. JK01AB1234"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={(e) => setSendEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Email these details to the customer
              </label>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={submit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {driver ? "Save changes" : "Add driver"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DriverFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Car;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[12px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}

/**
 * Two-step lock dialog (replaces window.confirm):
 *  - "email":   the booking has no customer email yet — collect one before locking.
 *  - "confirm": email present — confirm the irreversible lock + invoice send.
 */
function LockDialog({
  mode,
  initialEmail,
  customerName,
  savingEmail,
  locking,
  onClose,
  onSaveEmail,
  onConfirm,
}: {
  mode: "email" | "confirm";
  initialEmail: string;
  customerName: string;
  savingEmail: boolean;
  locking: boolean;
  onClose: () => void;
  onSaveEmail: (email: string) => void;
  onConfirm: () => void;
}) {
  const [value, setValue] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    onSaveEmail(v);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl p-5 space-y-4"
      >
        {mode === "email" ? (
          <form onSubmit={submitEmail} className="space-y-4">
            <div>
              <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Customer email
                required
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                The booking invoice is emailed to the customer, so a valid email is required before
                locking services. Add an email for{" "}
                <span className="font-semibold text-foreground">{customerName}</span>.
              </p>
            </div>
            <label className="block">
              <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">
                Customer Email
              </span>
              <input
                type="email"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="customer@example.com"
                className={`${inputCls} mt-1`}
                autoFocus
              />
            </label>
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm font-semibold rounded-xl border border-border text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEmail}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
              >
                {savingEmail && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save &amp; Continue
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="font-display font-bold text-foreground flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400" /> Lock services?
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Services can no longer be edited and a booking summary will be emailed to{" "}
                <span className="font-semibold text-foreground">{initialEmail}</span>. This cannot
                be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 text-sm font-semibold rounded-xl border border-border text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={locking}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {locking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                Lock &amp; Email Summary
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-foreground", strong ? "font-bold text-sm" : "font-semibold")}>
        {value}
      </p>
      {sub && <p className="text-[12px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn("text-muted-foreground", muted && "text-[12px]")}>{label}</dt>
      <dd className={cn("text-foreground", strong ? "font-extrabold" : "font-semibold")}>
        {value}
      </dd>
    </div>
  );
}

interface RowForm {
  name: string;
  location: string;
  nights: string;
  roomType: string;
  pickup: string;
  dropoff: string;
  timing: string;
  amount: string;
}

// Build the API payload + a stable snapshot string from the current form. The
// snapshot lets us skip no-op saves (so blurring an unchanged field is free).
function buildPayload(kind: Kind, sortOrder: number, form: RowForm) {
  return {
    kind,
    name: form.name.trim(),
    amount: form.amount ? parseFloat(form.amount) || 0 : 0,
    location: form.location.trim() || null,
    nights: form.nights === "" ? null : parseInt(form.nights, 10),
    roomType: form.roomType.trim() || null,
    pickup: form.pickup.trim() || null,
    dropoff: form.dropoff.trim() || null,
    timing: form.timing.trim() || null,
    sortOrder,
  };
}

function ServiceRow({
  bookingId,
  record,
  isDraft = false,
  fields,
  locked,
  canEdit,
  capError,
  onAmountBlur,
  onRemoved,
  onSaved,
}: {
  bookingId: string;
  record: Service;
  isDraft?: boolean;
  fields: FieldDef[];
  locked: boolean;
  canEdit: boolean;
  capError: (amount: number, excludeId: string | null) => string | null;
  onAmountBlur: (id: string, amount: number) => void;
  onRemoved: () => void;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<RowForm>({
    name: record.name,
    location: record.location ?? "",
    nights: record.nights != null ? String(record.nights) : "",
    roomType: record.roomType ?? "",
    pickup: record.pickup ?? "",
    dropoff: record.dropoff ?? "",
    timing: record.timing ?? "",
    amount: record.amount ? String(record.amount) : "",
  });
  // The persisted server id for this row. Persisted rows start with it; a draft
  // gets one after its first successful auto-save (and stays in place — no remount).
  const [serverId, setServerId] = useState<string | null>(isDraft ? null : record.id);
  // Snapshot of what was last persisted, so a blur with no real change is a no-op.
  const initialSnapshot = isDraft
    ? ""
    : JSON.stringify(
        buildPayload(record.kind, record.sortOrder, {
          name: record.name,
          location: record.location ?? "",
          nights: record.nights != null ? String(record.nights) : "",
          roomType: record.roomType ?? "",
          pickup: record.pickup ?? "",
          dropoff: record.dropoff ?? "",
          timing: record.timing ?? "",
          amount: record.amount ? String(record.amount) : "",
        }),
      );
  const [savedSnapshot, setSavedSnapshot] = useState<string>(initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const currentSnapshot = JSON.stringify(buildPayload(record.kind, record.sortOrder, form));
  const isClean = !!serverId && currentSnapshot === savedSnapshot;

  // Auto-save the row whenever a field loses focus. No manual Save click needed:
  // a draft is POSTed on its first save and PATCHed thereafter. A name is the one
  // hard requirement (the row can't be persisted without it).
  function autoSave() {
    if (locked || pending || !canEdit) return;
    if (!form.name.trim()) return; // nothing meaningful to persist yet
    const snapshot = JSON.stringify(buildPayload(record.kind, record.sortOrder, form));
    if (snapshot === savedSnapshot) return; // unchanged since last save

    const payload = buildPayload(record.kind, record.sortOrder, form);
    const err = capError(payload.amount, record.id);
    if (err) {
      setError(err);
      toast.error(err);
      return;
    }

    start(async () => {
      try {
        const res = await fetch(
          serverId
            ? `/api/bookings/${bookingId}/services/${serverId}`
            : `/api/bookings/${bookingId}/services`,
          {
            method: serverId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (j as { error?: string }).error ?? "Save failed.";
          setError(msg);
          toast.error(msg);
          return;
        }
        const saved = j as Service;
        if (!serverId && saved.id) {
          setServerId(saved.id);
          onSaved?.();
        }
        setSavedSnapshot(snapshot);
        setError(null);
      } catch {
        setError("An error occurred.");
        toast.error("An error occurred.");
      }
    });
  }

  // If the user kept typing while a save was in flight (auto-save is skipped while
  // pending to avoid a duplicate POST), flush the pending changes once the current
  // save settles — but never after an error (wait for the next blur to retry).
  useEffect(() => {
    if (pending || error || locked) return;
    if (!form.name.trim()) return;
    if (currentSnapshot !== savedSnapshot) autoSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function remove() {
    // A draft that was never persisted is just dropped locally; anything with a
    // server id (persisted row or an auto-saved draft) is deleted server-side.
    if (!serverId) return onRemoved();
    start(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/services/${serverId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j.error ?? "Delete failed.");
          return;
        }
        onRemoved();
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2.5">
      {fields.map((f) => (
        <label
          key={f.key}
          className={cn(
            "block",
            f.key === "amount" || f.key === "nights" ? "w-24" : "flex-1 min-w-[120px]",
          )}
        >
          <span className="text-[12px] font-semibold text-muted-foreground">{f.label}</span>
          <input
            type={f.type}
            value={form[f.key]}
            onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
            onBlur={() => {
              if (f.key === "amount")
                onAmountBlur(record.id, form.amount ? parseFloat(form.amount) || 0 : 0);
              autoSave();
            }}
            disabled={locked || !canEdit}
            className={`${inputCls} mt-0.5`}
          />
        </label>
      ))}
      {!locked && canEdit && (
        <div className="flex items-center gap-1">
          <span
            className="inline-flex items-center justify-center w-8 h-8 shrink-0"
            title={
              pending
                ? "Saving…"
                : error
                  ? error
                  : isClean
                    ? "Saved"
                    : "Unsaved — leave the field to save"
            }
          >
            {pending ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : error ? (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            ) : isClean ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </span>
          <button
            onClick={remove}
            disabled={pending}
            title="Delete"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentsCard({
  bookingId,
  payments,
  gstRates,
  balance,
  travelDate,
  canEdit,
  onAdded,
  onUpdated,
  onRemoved,
}: {
  bookingId: string;
  payments: Payment[];
  gstRates: number[];
  balance: number;
  travelDate: string;
  canEdit: boolean;
  onAdded: (p: Payment) => void;
  onUpdated: (p: Payment) => void;
  onRemoved: (id: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("PARTIAL");
  const [method, setMethod] = useState<string>("Cash");
  const [gstPercent, setGstPercent] = useState<string>("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  // GST is only offered for non-cash methods (server enforces the same rule).
  const gstEligible = !isCashMethod(method);

  // Once the balance is cleared, there is nothing left to collect against —
  // but a refund must still be recordable (money going back out), so this no
  // longer hides the add-payment row entirely, only narrows its Type options
  // to REFUND. See the effect below and the Type <select> further down.
  const fullyPaid = balance <= 0 && payments.length > 0;
  // Mirrors isBookingCompleted (finance.ts) — fullyPaid here is equivalent to
  // paymentStatus === "FULL". A completed booking (fully paid AND the travel
  // date has passed) has nothing left to refund either, so the whole
  // add-payment row — not just its Type options — is hidden below.
  const completed = fullyPaid && new Date(travelDate).getTime() < Date.now();

  // A fully paid booking can only ever add a REFUND row (TOKEN/PARTIAL/FINAL
  // would be rejected server-side) — keep the selected type valid as
  // fullyPaid toggles true.
  useEffect(() => {
    if (fullyPaid) setType("REFUND");
  }, [fullyPaid]);
  const totalReceived = payments
    .filter((p) => p.type !== "REFUND")
    .reduce((t, p) => t + p.amount, 0);
  const refundedTotal = payments
    .filter((p) => p.type === "REFUND")
    .reduce((t, p) => t + p.amount, 0);
  const gstTotal = payments.reduce((t, p) => t + (p.gstAmount ?? 0), 0);

  function add() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount.");
    // A collection can never exceed the remaining balance (server enforces this
    // too). Refunds are exempt — they are not collections against the payable.
    if (type !== "REFUND") {
      if (balance <= 0) return toast.error("This booking is already fully paid.");
      if (amt > balance)
        return toast.error(`Payment cannot exceed the remaining balance (${inr(balance)}).`);
    }
    start(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt,
            type,
            method: method.trim() || null,
            note: note.trim() || null,
            gstPercent: gstEligible && gstPercent ? parseFloat(gstPercent) : null,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error((j as { error?: string }).error ?? "Failed to add payment.");
          return;
        }
        toast.success("Payment recorded.");
        onAdded(j as Payment);
        setAmount("");
        setMethod("Cash");
        setGstPercent("");
        setNote("");
        setType(fullyPaid ? "REFUND" : "PARTIAL");
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <h3 className="font-bold text-foreground text-sm mb-3 flex items-center gap-2">
        <Wallet className="w-4 h-4" /> Payments
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="py-2 pr-3 font-bold">Type</th>
              <th className="py-2 pr-3 font-bold">Method</th>
              <th className="py-2 pr-3 font-bold">GST</th>
              <th className="py-2 pr-3 font-bold">Note</th>
              <th className="py-2 pr-3 font-bold">Date</th>
              <th className="py-2 pr-3 text-right font-bold">Amount</th>
              <th className="py-2 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-muted-foreground">
                  No payments recorded.
                </td>
              </tr>
            ) : (
              payments.map((p) => (
                <PaymentRow
                  key={p.id}
                  bookingId={bookingId}
                  payment={p}
                  gstRates={gstRates}
                  canEdit={canEdit}
                  onUpdated={onUpdated}
                  onRemoved={onRemoved}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {fullyPaid && (
        <div className="mt-4 border-t border-border pt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total Payments Received</span>
            <span className="font-extrabold text-foreground">{inr(totalReceived)}</span>
          </div>
          {gstTotal > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">GST Total (incl. above)</span>
              <span className="font-semibold text-foreground">{inr(gstTotal)}</span>
            </div>
          )}
          {refundedTotal > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Refunds</span>
              <span className="font-semibold text-foreground">– {inr(refundedTotal)}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 pt-1 text-xs font-bold text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            {completed ? "Fully paid — trip completed." : "Fully paid — no further collection due."}
          </div>
        </div>
      )}
      {canEdit && !completed && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="w-24">
            <span className="text-[12px] font-semibold text-muted-foreground">Amount</span>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} mt-0.5`}
            />
          </label>
          <label className="w-24">
            <span className="text-[12px] font-semibold text-muted-foreground">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className={`${inputCls} mt-0.5`}
            >
              {/* A fully paid booking has nothing left to collect — only a
                  refund (money going back out) makes sense at that point;
                  the server rejects TOKEN/PARTIAL/FINAL once balance is 0. */}
              {!fullyPaid && (
                <>
                  <option value="TOKEN">Token</option>
                  <option value="PARTIAL">Partial</option>
                  <option value="FINAL">Final</option>
                </>
              )}
              <option value="REFUND">Refund</option>
            </select>
          </label>
          <label className="w-28">
            <span className="text-[12px] font-semibold text-muted-foreground">Method</span>
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                if (isCashMethod(e.target.value)) setGstPercent("");
              }}
              className={`${inputCls} mt-0.5`}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="w-24">
            <span className="text-[12px] font-semibold text-muted-foreground">GST</span>
            <select
              value={gstPercent}
              onChange={(e) => setGstPercent(e.target.value)}
              disabled={!gstEligible}
              title={gstEligible ? undefined : "GST does not apply to cash payments."}
              className={`${inputCls} mt-0.5`}
            >
              <option value="">No GST</option>
              {gstRates.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 min-w-[120px]">
            <span className="text-[12px] font-semibold text-muted-foreground">Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${inputCls} mt-0.5`}
            />
          </label>
          <button
            onClick={add}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs font-bold bg-primary text-white px-4 py-2 rounded-xl hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}{" "}
            Add Payment
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentRow({
  bookingId,
  payment,
  gstRates,
  canEdit,
  onUpdated,
  onRemoved,
}: {
  bookingId: string;
  payment: Payment;
  gstRates: number[];
  canEdit: boolean;
  onUpdated: (p: Payment) => void;
  onRemoved: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [type, setType] = useState(payment.type);
  const [method, setMethod] = useState<string>(payment.method ?? "Cash");
  const [gstPercent, setGstPercent] = useState<string>(
    payment.gstPercent ? String(payment.gstPercent) : "",
  );
  const [note, setNote] = useState(payment.note ?? "");
  const [pending, start] = useTransition();
  const gstEligible = !isCashMethod(method);
  const date = new Date(payment.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });

  function startEdit() {
    setAmount(String(payment.amount));
    setType(payment.type);
    setMethod(payment.method ?? "Cash");
    setGstPercent(payment.gstPercent ? String(payment.gstPercent) : "");
    setNote(payment.note ?? "");
    setEditing(true);
  }

  function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount.");
    start(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/payments/${payment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amt,
            type,
            method: method.trim() || null,
            note: note.trim() || null,
            gstPercent: gstEligible && gstPercent ? parseFloat(gstPercent) : null,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as Payment & {
          error?: string;
          emailed?: boolean;
        };
        if (!res.ok) {
          toast.error(j.error ?? "Update failed.");
          return;
        }
        toast.success(j.emailed ? "Payment updated. Receipt re-sent." : "Payment updated.");
        onUpdated(j);
        setEditing(false);
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  function del() {
    start(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/payments/${payment.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j.error ?? "Delete failed.");
          return;
        }
        toast.success("Payment deleted.");
        onRemoved(payment.id);
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  if (editing) {
    return (
      <tr>
        <td className="py-2 pr-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={`${inputCls} py-1`}
          >
            <option value="TOKEN">Token</option>
            <option value="PARTIAL">Partial</option>
            <option value="FINAL">Final</option>
            <option value="REFUND">Refund</option>
          </select>
        </td>
        <td className="py-2 pr-2">
          <select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              if (isCashMethod(e.target.value)) setGstPercent("");
            }}
            className={`${inputCls} py-1`}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </td>
        <td className="py-2 pr-2">
          <select
            value={gstPercent}
            onChange={(e) => setGstPercent(e.target.value)}
            disabled={!gstEligible}
            title={gstEligible ? undefined : "GST does not apply to cash payments."}
            className={`${inputCls} py-1`}
          >
            <option value="">No GST</option>
            {gstRates.map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </td>
        <td className="py-2 pr-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${inputCls} py-1`}
          />
        </td>
        <td className="py-2 pr-2 text-muted-foreground whitespace-nowrap">{date}</td>
        <td className="py-2 pr-2">
          <input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputCls} py-1 text-right`}
          />
        </td>
        <td className="py-2">
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={save}
              disabled={pending}
              title="Save"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={pending}
              title="Cancel"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="py-2 pr-3">
        <span className="font-bold text-foreground">{payment.type}</span>
      </td>
      <td className="py-2 pr-3 text-muted-foreground">{payment.method ?? "—"}</td>
      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
        {payment.gstPercent ? `${payment.gstPercent}% · ${inr(payment.gstAmount ?? 0)}` : "—"}
      </td>
      <td className="py-2 pr-3 text-muted-foreground">{payment.note ?? "—"}</td>
      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{date}</td>
      <td className="py-2 pr-3 text-right font-bold text-foreground">{inr(payment.amount)}</td>
      <td className="py-2">
        {canEdit && (
        <div className="flex items-center justify-end gap-1">
          {confirmDel ? (
            <>
              <button
                onClick={del}
                disabled={pending}
                title="Confirm delete"
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setConfirmDel(false)}
                disabled={pending}
                title="Cancel"
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                title="Edit"
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-primary hover:bg-primary/10"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setConfirmDel(true)}
                title="Delete"
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
        )}
      </td>
    </tr>
  );
}
