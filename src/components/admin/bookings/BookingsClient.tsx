"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  ChevronDown,
  User,
  ClipboardList,
  Trash2,
  Loader2,
  AlertTriangle,
  X,
  IndianRupee,
  TrendingUp,
  Wallet,
  Ban,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/admin/ui/TablePagination";
import { StatCard } from "@/components/ui/molecules/stat-card";
import { isBookingCompleted } from "@/lib/bookings/finance";

type BookingStatus = "PENDING" | "CONFIRMED" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
type PaymentStatus = "PENDING" | "PARTIAL" | "FULL";

interface Booking {
  id: string;
  razorpayOrderId: string | null;
  razorpayPayId: string | null;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  balance: number;
  amount: number;
  travelDate: Date | string;
  travellers: number;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string;
  createdAt: Date | string;
  tour: { title: string; slug: string; coverImage: string | null } | null;
  user: { name: string | null; email: string } | null;
  convertedBy: string | null;
}

interface BookingCardStats {
  isAdmin: boolean;
  bookingsCount: { all: number; month: number };
  bookingsTotal: { all: number; month: number };
  cancelledBookings: { all: number; month: number };
  bookingsProfit?: { all: number; month: number };
  myCommission?: { all: number; month: number };
  paidCommission?: { all: number; month: number };
}

interface Props {
  initialBookings: Booking[];
  totalCount: number;
  canDelete: boolean;
  isAdmin: boolean;
  cardStats: BookingCardStats | null;
}

const STATUS_STYLES: Record<BookingStatus, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  CONFIRMED: "bg-green-500/15 text-green-700 dark:text-green-300",
  PAID: "bg-green-500/15 text-green-700 dark:text-green-300",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-300",
  CANCELLED: "bg-muted text-muted-foreground",
  REFUNDED: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PARTIAL: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  FULL: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pending",
  PARTIAL: "Partial",
  FULL: "Full",
};

function isCompleted(b: Booking): boolean {
  return isBookingCompleted(b.paymentStatus, new Date(b.travelDate));
}

// Cancel = nothing paid yet, nothing to give back — a plain status flip.
// Once anything has been collected (PARTIAL or FULL), closing the booking
// out is a Refund instead (see canRefund), since there's money to return.
// Neither ever shows once the booking is completed (fully paid AND the
// travel date has passed) — there's nothing left to do either way.
function canCancel(b: Booking, isAdmin: boolean): boolean {
  return (
    isAdmin &&
    b.paymentStatus === "PENDING" &&
    !isCompleted(b) &&
    b.status !== "CANCELLED" &&
    b.status !== "REFUNDED"
  );
}
// Refund also lands on CANCELLED (not REFUNDED) — a refunded booking IS a
// cancelled one; the payments ledger (not the booking status) is the record
// of how much, if anything, was actually returned.
function canRefund(b: Booking, isAdmin: boolean): boolean {
  return (
    isAdmin &&
    (b.paymentStatus === "PARTIAL" || b.paymentStatus === "FULL") &&
    !isCompleted(b) &&
    b.status !== "CANCELLED" &&
    b.status !== "REFUNDED"
  );
}

function fmtINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

export function BookingsClient({
  initialBookings,
  totalCount,
  canDelete,
  isAdmin,
  cardStats,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [confirmMode, setConfirmMode] = useState<null | "soft" | "permanent">(null);

  // Server-paginated: the admin/bookings list previously capped at the first
  // 100 rows (fetched once, filtered/paginated in the browser), silently
  // hiding anything older. This now calls the already-existing, correctly
  // paginated /api/bookings endpoint for every page/search/filter change —
  // the initial page still renders instantly from the server-fetched props
  // below, no fetch needed on first paint.
  const [bookings, setBookings] = useState(initialBookings);
  const [total, setTotal] = useState(totalCount);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasMounted = useRef(false);

  // Debounce search input — avoids a network round trip on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Any filter change should jump back to page 1, same as the old client-side
  // pagination's auto-clamp when the filtered set shrank.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  async function fetchBookings() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/bookings?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { bookings: Booking[]; total: number };
      setBookings(data.bookings);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Skip the redundant fetch on first mount — initialBookings/totalCount
    // already came from the server render.
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, statusFilter, debouncedSearch]);

  function changePageSize(n: number) {
    setPageSize(n);
    setPage(1);
  }

  function closeModal() {
    if (isPending) return;
    setConfirmMode(null);
    setSelected(null);
  }

  function handleDelete(id: string, permanent: boolean) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/bookings/${id}${permanent ? "?permanent=1" : ""}`, {
          method: "DELETE",
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(j.error ?? "Failed to delete booking.");
          return;
        }
        toast.success(permanent ? "Booking permanently deleted." : "Booking deleted.");
        setConfirmMode(null);
        setSelected(null);
        router.refresh();
        fetchBookings();
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  function handleStatusChange(id: string, status: BookingStatus) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/bookings/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j.error ?? "Failed to update booking status.");
          return;
        }
        toast.success(`Booking marked as ${status.toLowerCase()}.`);
        setSelected(null);
        router.refresh();
        fetchBookings();
      } catch {
        toast.error("Failed to update booking status.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-foreground text-xl">Bookings</h2>
          <p className="text-muted-foreground text-xs mt-0.5">{totalCount} total bookings</p>
        </div>
      </div>

      {cardStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label={cardStats.isAdmin ? "Bookings" : "My Bookings"}
            value={cardStats.bookingsCount.all}
            sub={`${cardStats.bookingsCount.month} this month`}
            icon={User}
            accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          />
          <StatCard
            label="Bookings Total"
            value={fmtINR(cardStats.bookingsTotal.all)}
            sub={`${fmtINR(cardStats.bookingsTotal.month)} this month`}
            icon={IndianRupee}
            accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          {cardStats.isAdmin && cardStats.bookingsProfit && (
            <StatCard
              label="Booking Profit"
              value={fmtINR(cardStats.bookingsProfit.all)}
              sub={`${fmtINR(cardStats.bookingsProfit.month)} this month`}
              icon={TrendingUp}
              accent="bg-purple-500/10 text-purple-600 dark:text-purple-400"
            />
          )}
          <StatCard
            label="Cancelled Bookings"
            value={cardStats.cancelledBookings.all}
            sub={`${cardStats.cancelledBookings.month} this month`}
            icon={Ban}
            accent="bg-red-500/10 text-red-600 dark:text-red-400"
          />
          {!cardStats.isAdmin && (
            <>
              <StatCard
                label="My Commission"
                value={fmtINR(cardStats.myCommission?.all ?? 0)}
                sub={`${fmtINR(cardStats.myCommission?.month ?? 0)} this month · earned, awaiting payout`}
                icon={Wallet}
                accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              />
              <StatCard
                label="Earned Commission"
                value={fmtINR(cardStats.paidCommission?.all ?? 0)}
                sub={`${fmtINR(cardStats.paidCommission?.month ?? 0)} this month · paid out to you`}
                icon={Banknote}
                accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              />
            </>
          )}
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border shadow-sm">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, ref, order ID..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-muted/50"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-4 pr-8 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-muted/50 appearance-none"
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PAID">Paid</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REFUNDED">Refunded</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <p className="text-xs text-muted-foreground self-center shrink-0">{total} results</p>
        </div>

        {/* Table */}
        <div className={cn("overflow-x-auto", loading && "opacity-60 pointer-events-none")}>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-t border-b border-border">
                {[
                  "Ref",
                  "Guest",
                  "Travel Date",
                  "Amount",
                  "Converted By",
                  "Status",
                  "Payment",
                  "Actions",
                ].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No bookings found.
                  </td>
                </tr>
              ) : (
                bookings.map((b) => {
                  const showCancel = canCancel(b, isAdmin);
                  const showRefund = canRefund(b, isAdmin);
                  return (
                    <tr
                      key={b.id}
                      onClick={() => {
                        setConfirmMode(null);
                        setSelected(b);
                      }}
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <span
                          className="font-mono text-[12px] font-semibold text-foreground"
                          title={b.id}
                        >
                          #{b.id.slice(-8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-3 h-3 text-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-xs truncate max-w-[120px]">
                              {b.guestName}
                            </p>
                            <p className="text-[12px] text-muted-foreground truncate max-w-[120px]">
                              {b.guestEmail}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(b.travelDate).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-foreground whitespace-nowrap">
                        {fmtINR(b.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {b.convertedBy ?? "Website"}
                      </td>
                      <td className="px-4 py-3">
                        {isCompleted(b) ? (
                          <span
                            title="Fully paid and the travel date has passed"
                            className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          >
                            COMPLETED
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "text-[12px] font-bold px-2 py-0.5 rounded-full",
                              STATUS_STYLES[b.status],
                            )}
                          >
                            {b.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "text-[12px] font-bold px-2 py-0.5 rounded-full",
                            PAYMENT_STATUS_STYLES[b.paymentStatus],
                          )}
                        >
                          {PAYMENT_STATUS_LABELS[b.paymentStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/admin/bookings/${b.id}/services`}
                            onClick={(e) => e.stopPropagation()}
                            title="Manage services"
                            className="inline-flex items-center gap-1 text-[12px] font-bold px-2 py-0.5 rounded-lg border border-border text-primary hover:bg-primary/10 transition-colors"
                          >
                            <ClipboardList className="w-3 h-3" /> Services
                          </Link>
                          {showCancel && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(b.id, "CANCELLED");
                              }}
                              disabled={isPending}
                              title="Cancel booking (nothing paid yet)"
                              className="text-[12px] font-bold px-2 py-0.5 rounded-lg border border-red-200 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              CANCEL
                            </button>
                          )}
                          {showRefund && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(b.id, "CANCELLED");
                              }}
                              disabled={isPending}
                              title="Refund and cancel (record the actual refund amount on the Services page first)"
                              className="text-[12px] font-bold px-2 py-0.5 rounded-lg border border-purple-200 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors"
                            >
                              REFUND
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          pageCount={pageCount}
          total={total}
          onPage={setPage}
          onPageSize={changePageSize}
          noun="bookings"
        />
      </div>

      {/* Booking detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-card rounded-2xl border border-border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-6 border-b border-border">
              <div>
                <h3 className="font-bold text-foreground text-sm">Booking Detail</h3>
                <p className="text-[12px] text-muted-foreground font-mono mt-0.5">
                  {selected.razorpayOrderId ?? selected.id}
                </p>
              </div>
              <button
                onClick={closeModal}
                disabled={isPending}
                aria-label="Close booking detail"
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Detail grid */}
            <div className="p-6 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground mb-0.5">Guest</p>
                <p className="font-semibold text-foreground">{selected.guestName}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Email</p>
                <p className="font-semibold text-foreground">{selected.guestEmail ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Phone</p>
                <p className="font-semibold text-foreground">{selected.guestPhone}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Tour</p>
                <p className="font-semibold text-foreground">
                  {selected.tour?.title ?? "Custom booking"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Travel Date</p>
                <p className="font-semibold text-foreground">
                  {new Date(selected.travelDate).toLocaleDateString("en-IN")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Travellers</p>
                <p className="font-semibold text-foreground">{selected.travellers}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Amount</p>
                <p className="font-bold text-foreground">{fmtINR(selected.amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Paid</p>
                <p className="font-semibold text-foreground">{fmtINR(selected.paidAmount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Balance</p>
                <p className="font-semibold text-foreground">{fmtINR(selected.balance)}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Payment ID</p>
                <p className="font-mono text-foreground text-[12px]">
                  {selected.razorpayPayId ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Status</p>
                {isCompleted(selected) ? (
                  <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                    COMPLETED
                  </span>
                ) : (
                  <span
                    className={cn(
                      "text-[12px] font-bold px-2 py-0.5 rounded-full",
                      STATUS_STYLES[selected.status],
                    )}
                  >
                    {selected.status}
                  </span>
                )}
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Payment</p>
                <span
                  className={cn(
                    "text-[12px] font-bold px-2 py-0.5 rounded-full",
                    PAYMENT_STATUS_STYLES[selected.paymentStatus],
                  )}
                >
                  {PAYMENT_STATUS_LABELS[selected.paymentStatus]}
                </span>
              </div>
            </div>

            {/* Delete section */}
            {canDelete && (
              <div className="px-6 pb-6 border-t border-border pt-4">
                {confirmMode === null ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground mr-1">
                      Delete booking:
                    </span>
                    <button
                      onClick={() => setConfirmMode("soft")}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Soft Delete
                    </button>
                    <button
                      onClick={() => setConfirmMode("permanent")}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg border border-red-300 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Permanent Delete
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 text-xs">
                      <p className="font-semibold text-red-700 dark:text-red-300">
                        {confirmMode === "permanent"
                          ? "Permanently delete this booking?"
                          : "Soft-delete this booking?"}
                      </p>
                      <p className="text-muted-foreground mt-0.5">
                        {confirmMode === "permanent"
                          ? "This removes the booking and all its payments and services. This cannot be undone."
                          : "The booking is hidden from all listings and reports but retained and can be restored from the database."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleDelete(selected.id, confirmMode === "permanent")}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        {isPending ? "Deleting…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => setConfirmMode(null)}
                        disabled={isPending}
                        className="text-[12px] font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
