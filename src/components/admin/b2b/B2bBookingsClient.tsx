"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ExternalLink, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePagination } from "@/components/admin/ui/usePagination";
import { TablePagination } from "@/components/admin/ui/TablePagination";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/bookings/finance";

type BookingStatus = "PENDING" | "CONFIRMED" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";

interface BookingRow {
  id: string;
  guestName: string;
  guestPhone: string;
  travelDate: Date | string;
  travellers: number;
  amount: number;
  status: BookingStatus;
  createdAt: Date | string;
  tour: { title: string } | null;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  b2bAgent: { id: string; name: string | null; agencyName: string | null; email: string } | null;
}

interface Props {
  initialBookings: BookingRow[];
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

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function B2bBookingsClient({ initialBookings }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return initialBookings;
    return initialBookings.filter(
      (b) =>
        b.guestName.toLowerCase().includes(q) ||
        (b.b2bAgent?.agencyName ?? "").toLowerCase().includes(q) ||
        (b.b2bAgent?.name ?? "").toLowerCase().includes(q),
    );
  }, [initialBookings, search]);

  const { page, setPage, pageSize, changePageSize, pageCount, total, pageItems } =
    usePagination(filtered);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-extrabold text-foreground text-xl">B2B Bookings</h2>
        <p className="text-muted-foreground text-xs mt-0.5">
          {initialBookings.length} bookings converted from B2B partner requests
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by guest or agency..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-muted/50"
            />
          </div>
          <p className="text-xs text-muted-foreground self-center shrink-0">{filtered.length} results</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-t border-b border-border">
                {["Guest", "Agent", "Package", "Travel Date", "Amount", "Status", "Payment", "Actions"].map(
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
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No B2B bookings found.
                  </td>
                </tr>
              ) : (
                pageItems.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground text-xs">{b.guestName}</p>
                      <p className="text-[12px] text-muted-foreground">{b.guestPhone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Handshake className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate max-w-[160px]">
                            {b.b2bAgent?.agencyName ?? "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                            {b.b2bAgent?.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[160px]">
                      {b.tour?.title ?? "Custom package"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(b.travelDate).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-foreground whitespace-nowrap">
                      {inr.format(b.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold",
                          STATUS_STYLES[b.status],
                        )}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold",
                          PAYMENT_STATUS_STYLES[b.paymentStatus],
                        )}
                      >
                        {PAYMENT_STATUS_LABELS[b.paymentStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/bookings/${b.id}/services`}
                        aria-label={`View booking for ${b.guestName}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
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
    </div>
  );
}
