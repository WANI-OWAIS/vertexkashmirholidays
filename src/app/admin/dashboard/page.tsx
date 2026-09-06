import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  TrendingUp,
  TrendingDown,
  IndianRupee,
  CalendarDays,
  MessageSquare,
  BarChart3,
  CreditCard,
  Star,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  MapPin,
  FileText,
  ExternalLink,
  Download,
  Settings,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { requireModuleView } from "@/lib/admin/moduleGuard";
import { bookingWhereForUser } from "@/lib/bookings/scope";
import { RevenueChart } from "@/components/admin/RevenueChartLazy";
import { computeBookingFinance, type PaymentStatus } from "@/lib/bookings/finance";

export const metadata: Metadata = { title: "Dashboard — Admin" };
export const dynamic = "force-dynamic";

const PLACEHOLDER =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMGYyNjVjIi8+PC9zdmc+";

function pctChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function fmtINR(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (n >= 1000) return `₹${Math.round(n / 100) * 100}`.replace(/(\d+?)(?=(\d{2})+(?!\d))/, "$1,");
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_STYLES: Record<
  string,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  PAID: {
    label: "Paid",
    className: "bg-green-500/15 text-green-700 dark:text-green-300",
    Icon: CheckCircle2,
  },
  PENDING: {
    label: "Pending",
    className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    Icon: Clock,
  },
  FAILED: {
    label: "Failed",
    className: "bg-red-500/15 text-red-700 dark:text-red-300",
    Icon: XCircle,
  },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground", Icon: XCircle },
  REFUNDED: {
    label: "Refunded",
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    Icon: AlertCircle,
  },
  // CONFIRMED was missing here, so every confirmed booking silently fell
  // through to the PENDING fallback below — a booking can be CONFIRMED
  // (going ahead) independent of how much has actually been paid, see
  // PAYMENT_STATUS_STYLES for the money-received signal shown alongside it.
  CONFIRMED: {
    label: "Confirmed",
    className: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    Icon: CheckCircle2,
  },
};

// Derived "how much has actually been paid" — kept separate from the booking
// lifecycle status above, same as src/lib/bookings/finance.ts's own
// PaymentStatus type (never stored, always computed from the payment ledger).
const PAYMENT_STATUS_STYLES: Record<PaymentStatus, string> = {
  FULL: "bg-green-500/15 text-green-700 dark:text-green-300",
  PARTIAL: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PENDING: "bg-muted text-muted-foreground",
};
const PAYMENT_STATUS_LABELS_SHORT: Record<PaymentStatus, string> = {
  FULL: "Paid in full",
  PARTIAL: "Partially paid",
  PENDING: "Unpaid",
};

const LEAD_STATUS_STYLES: Record<string, string> = {
  NEW: "bg-link/10 text-link",
  CONNECTED: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  NOT_CONNECTED: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  QUALIFIED: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  NEGOTIATION: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ON_HOLD: "bg-muted text-muted-foreground",
  CONVERTED: "bg-green-500/15 text-green-700 dark:text-green-300",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const QUICK_ACTIONS = [
  {
    label: "New Package",
    Icon: Plus,
    href: "/admin/packages/new",
    color: "bg-primary/10 text-primary",
  },
  {
    label: "Add Destination",
    Icon: MapPin,
    href: "/admin/destinations/new",
    color: "bg-link/10 text-link",
  },
  {
    label: "Add Blog Post",
    Icon: FileText,
    href: "/admin/blogs/new",
    color: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
  {
    label: "View Bookings",
    Icon: CalendarDays,
    href: "/admin/bookings",
    color: "bg-accent/10 text-accent",
  },
  { label: "Export Report", Icon: Download, href: "#", color: "bg-muted text-muted-foreground" },
  {
    label: "Site Settings",
    Icon: Settings,
    href: "/admin/settings",
    color: "bg-primary/10 text-foreground",
  },
];

export default async function AdminDashboard() {
  const guard = await requireModuleView("dashboard");
  if (!guard.ok) return guard.page;
  const { role, userId } = guard;
  const isAdmin = role === "SUPERADMIN" || role === "ADMIN";

  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // Admin/Superadmin see org-wide figures; every other role (in practice
  // SALES) only ever sees bookings converted from a lead assigned to them
  // and leads assigned to them — same ownership rule as the Bookings and
  // Leads pages, applied here too so the dashboard isn't an org-wide leak.
  const bookingScope: Prisma.BookingWhereInput = { deletedAt: null, ...bookingWhereForUser(role, userId) };
  // B2B requests (b2bAgentId set) are tracked separately (see /admin/b2b-requests)
  // and excluded from normal-lead dashboard stats.
  const leadScope: Prisma.LeadWhereInput = {
    b2bAgentId: null,
    ...(isAdmin ? {} : { assignedToId: userId }),
  };

  const [
    totalBookings,
    thisMonthBookings,
    lastMonthBookings,
    totalLeads,
    thisMonthLeads,
    lastMonthLeads,
    recentBookingsRaw,
    recentLeads,
    pendingReviews,
    allBookingsForFinance,
  ] = await Promise.all([
    prisma.booking.count({ where: bookingScope }),
    prisma.booking.count({ where: { ...bookingScope, createdAt: { gte: startOfMonth } } }),
    prisma.booking.count({
      where: { ...bookingScope, createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
    }),
    prisma.lead.count({ where: leadScope }),
    prisma.lead.count({ where: { ...leadScope, createdAt: { gte: startOfMonth } } }),
    prisma.lead.count({
      where: { ...leadScope, createdAt: { gte: startOfLastMonth, lt: startOfMonth } },
    }),
    prisma.booking.findMany({
      where: bookingScope,
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        amount: true,
        createdAt: true,
        tour: { select: { title: true, coverImage: true, slug: true } },
        payments: { select: { amount: true, type: true } },
      },
    }),
    prisma.lead.findMany({
      where: leadScope,
      take: 8,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, source: true, startDate: true, status: true },
    }),
    prisma.review.findMany({
      where: { approved: false },
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        rating: true,
        body: true,
        tour: { select: { title: true } },
      },
    }),
    // Revenue must reflect money actually collected, not the lifecycle
    // `status` field — `status: PAID` is set only by the Razorpay
    // webhook/reconcile path (see src/lib/bookings/online-payment.ts) and
    // never by manually-recorded offline/cash payments, so a fully-paid
    // booking can legitimately sit at CONFIRMED forever. Every other
    // booking-money view in this app (admin/bookings list, invoices) already
    // derives the real figure from the payment ledger via
    // computeBookingFinance() — this fetches what that needs for every
    // in-scope booking instead of pre-filtering by status.
    prisma.booking.findMany({
      where: bookingScope,
      select: {
        amount: true,
        createdAt: true,
        tourId: true,
        payments: { select: { amount: true, type: true } },
      },
    }),
  ]);

  // Net amount actually received per booking (collections minus refunds) —
  // discount/services aren't relevant to "money collected" so they're passed
  // empty/null here; see computeBookingFinance's own doc comment.
  const paidAmountOf = (b: { amount: number; payments: { amount: number; type: string | null }[] }) =>
    computeBookingFinance({ amount: b.amount, payments: b.payments, services: [] }).paidAmount;

  const allBookingsFinance = allBookingsForFinance.map((b) => ({ ...b, paidAmount: paidAmountOf(b) }));
  const recentBookings = recentBookingsRaw.map((b) => ({
    ...b,
    paymentStatus: computeBookingFinance({ amount: b.amount, payments: b.payments, services: [] })
      .paymentStatus,
  }));

  // Revenue by month — last 6 months
  const revenueByMonth = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const label =
      d.toLocaleString("en-IN", { month: "short" }) + " '" + String(d.getFullYear()).slice(2);
    const revenue = allBookingsFinance
      .filter((b) => b.createdAt >= d && b.createdAt < nextMonth)
      .reduce((s, b) => s + b.paidAmount, 0);
    return { month: label, revenue };
  });

  // Top tours
  const tourRevMap: Record<string, { revenue: number; count: number }> = {};
  for (const b of allBookingsFinance) {
    if (!b.tourId || b.paidAmount <= 0) continue; // lead-converted bookings have no tour; unpaid ones don't rank
    const e = tourRevMap[b.tourId] ?? { revenue: 0, count: 0 };
    e.revenue += b.paidAmount;
    e.count += 1;
    tourRevMap[b.tourId] = e;
  }
  const topTourIds = Object.entries(tourRevMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([id]) => id);

  const topTourDetails = topTourIds.length
    ? await prisma.tour.findMany({
        where: { id: { in: topTourIds } },
        select: {
          id: true,
          title: true,
          slug: true,
          coverImage: true,
          rating: true,
          reviewCount: true,
        },
      })
    : await prisma.tour.findMany({
        where: { published: true },
        take: 5,
        orderBy: { rating: "desc" },
        select: {
          id: true,
          title: true,
          slug: true,
          coverImage: true,
          rating: true,
          reviewCount: true,
        },
      });

  const topTours = topTourIds.length
    ? topTourIds.map((id) => {
        const detail = topTourDetails.find((d) => d.id === id)!;
        return { ...detail, bookingCount: tourRevMap[id]!.count, revenue: tourRevMap[id]!.revenue };
      })
    : topTourDetails.map((t) => ({ ...t, bookingCount: 0, revenue: 0 }));

  const totalRevenue = allBookingsFinance.reduce((s, b) => s + b.paidAmount, 0);
  const thisMonthRev = allBookingsFinance
    .filter((b) => b.createdAt >= startOfMonth)
    .reduce((s, b) => s + b.paidAmount, 0);
  const lastMonthRev = allBookingsFinance
    .filter((b) => b.createdAt >= startOfLastMonth && b.createdAt < startOfMonth)
    .reduce((s, b) => s + b.paidAmount, 0);
  const paidCount = allBookingsFinance.filter((b) => b.paidAmount > 0).length;
  const conversionRate = totalLeads > 0 ? Math.round((paidCount / totalLeads) * 1000) / 10 : 0;
  const avgBooking = paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0;

  const KPI = [
    {
      label: "Total Revenue",
      value: fmtINR(totalRevenue),
      change: pctChange(thisMonthRev, lastMonthRev),
      sub: "vs last month",
      Icon: IndianRupee,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Total Bookings",
      value: totalBookings.toString(),
      change: pctChange(thisMonthBookings, lastMonthBookings),
      sub: "vs last month",
      Icon: CalendarDays,
      color: "text-link",
      bg: "bg-link/10",
    },
    {
      label: "Total Leads",
      value: totalLeads.toString(),
      change: pctChange(thisMonthLeads, lastMonthLeads),
      sub: "vs last month",
      Icon: MessageSquare,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "Conversion Rate",
      value: `${conversionRate}%`,
      change: null,
      sub: "leads → bookings",
      Icon: BarChart3,
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-500/15",
    },
    {
      label: "Avg Booking",
      value: fmtINR(avgBooking),
      change: null,
      sub: "per paid booking",
      Icon: CreditCard,
      color: "text-foreground",
      bg: "bg-primary/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-extrabold text-foreground text-xl">
            Welcome back, <span className="text-primary">{firstName}</span> 👋
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            {now.toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <Link
          href="/admin/packages/new"
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shadow-sm shadow-primary/25"
        >
          <Plus className="w-3.5 h-3.5" />
          New Package
        </Link>
      </div>

      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {KPI.map(({ label, value, change, sub, Icon, color, bg }) => (
          <div key={label} className="bg-card rounded-2xl border border-border p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className="font-display font-extrabold text-foreground text-xl leading-none mb-1.5">
              {value}
            </p>
            <div className="flex items-center gap-1">
              {change !== null ? (
                <>
                  {change >= 0 ? (
                    <TrendingUp className="w-3 h-3 text-green-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-400" />
                  )}
                  <span
                    className={`text-[12px] font-semibold ${change >= 0 ? "text-green-500" : "text-red-400"}`}
                  >
                    {change >= 0 ? "+" : ""}
                    {change}%
                  </span>
                  <span className="text-[12px] text-muted-foreground">{sub}</span>
                </>
              ) : (
                <span className="text-[12px] text-muted-foreground">{sub}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Revenue chart + Recent Bookings ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        {/* Chart */}
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-bold text-primary uppercase tracking-wider mb-0.5">
                ● Revenue Overview
              </p>
              <p className="font-display font-bold text-foreground text-base">Last 6 Months</p>
            </div>
            <span className="text-xs text-muted-foreground bg-muted border border-border px-3 py-1 rounded-lg">
              {fmtINR(totalRevenue)} total
            </span>
          </div>
          <RevenueChart data={revenueByMonth} />
        </div>

        {/* Recent Bookings */}
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="font-display font-bold text-foreground text-sm">Recent Bookings</p>
            <Link
              href="/admin/bookings"
              className="text-primary text-xs font-semibold hover:underline flex items-center gap-1"
            >
              View all <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {recentBookings.length === 0 ? (
              <p className="text-muted-foreground text-xs py-8 text-center">No bookings yet.</p>
            ) : (
              recentBookings.map((b) => {
                const s = STATUS_STYLES[b.status] ?? STATUS_STYLES.PENDING!;
                return (
                  <div key={b.id} className="flex items-center gap-3">
                    <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0">
                      <Image
                        src={b.tour?.coverImage ?? PLACEHOLDER}
                        alt={b.tour?.title ?? "Booking"}
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate leading-tight">
                        {b.tour?.title ?? "Custom booking"}
                      </p>
                      <p className="text-[12px] text-muted-foreground">{fmtDate(b.createdAt)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-foreground">{fmtINR(b.amount)}</p>
                      <div className="flex items-center justify-end gap-1">
                        <span
                          className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-md ${s.className}`}
                        >
                          {s.label}
                        </span>
                        <span
                          className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-md ${PAYMENT_STATUS_STYLES[b.paymentStatus]}`}
                        >
                          {PAYMENT_STATUS_LABELS_SHORT[b.paymentStatus]}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Recent Leads ──────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="font-display font-bold text-foreground text-sm">Recent Leads</p>
          <Link href="/admin/leads" className="text-xs font-semibold text-primary hover:underline">
            View all ({totalLeads})
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted border-b border-border">
                {["Name", "Phone", "Source", "Travel Date", "Status", "Action"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wide text-[12px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No leads yet.
                  </td>
                </tr>
              ) : (
                recentLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{lead.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.phone}</td>
                    <td className="px-4 py-3">
                      <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-md capitalize">
                        {lead.source.toLowerCase().replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lead.startDate ? fmtDate(lead.startDate) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-md font-semibold text-[12px] ${LEAD_STATUS_STYLES[lead.status] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href="/admin/leads"
                        className="text-primary font-semibold hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Top Tours + Pending Reviews ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Performing Tours */}
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <p className="font-display font-bold text-foreground text-sm">Top Performing Tours</p>
            <Link
              href="/admin/packages"
              className="text-primary text-xs font-semibold hover:underline"
            >
              Manage
            </Link>
          </div>
          <div className="space-y-3">
            {topTours.length === 0 ? (
              <p className="text-muted-foreground text-xs py-6 text-center">No tour data yet.</p>
            ) : (
              topTours.map((tour, i) => (
                <div key={tour.id} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground/60 w-4 shrink-0">
                    {i + 1}
                  </span>
                  <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0">
                    <Image
                      src={tour.coverImage ?? PLACEHOLDER}
                      alt={tour.title ?? ""}
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate leading-tight">
                      {tour.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[12px] text-muted-foreground">
                        {tour.bookingCount} booking{tour.bookingCount !== 1 ? "s" : ""}
                      </span>
                      {(tour.rating ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-[12px] text-yellow-500">
                          <Star className="w-2.5 h-2.5 fill-yellow-400" />
                          {tour.rating?.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs font-bold text-foreground shrink-0">
                    {fmtINR(tour.revenue)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reviews Awaiting Approval */}
        <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <p className="font-display font-bold text-foreground text-sm">
                Reviews Awaiting Approval
              </p>
              {pendingReviews.length > 0 && (
                <span className="bg-accent text-white text-[12px] font-bold px-1.5 py-0.5 rounded-full">
                  {pendingReviews.length}
                </span>
              )}
            </div>
            <Link
              href="/admin/reviews"
              className="text-primary text-xs font-semibold hover:underline"
            >
              Manage
            </Link>
          </div>
          <div className="space-y-3">
            {pendingReviews.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-muted-foreground text-xs">All caught up! No reviews pending.</p>
              </div>
            ) : (
              pendingReviews.map((review) => (
                <div
                  key={review.id}
                  className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0"
                >
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {review.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-foreground">{review.name}</p>
                      <div className="flex items-center gap-0.5">
                        {[...Array(review.rating)].map((_, i) => (
                          <Star key={i} className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                    </div>
                    <p className="text-[12px] text-muted-foreground mb-1 truncate">
                      {review.tour.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {review.body}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
      <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
        <p className="font-display font-bold text-foreground text-sm mb-4">Quick Actions</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map(({ label, Icon, href, color }) => (
            <Link
              key={label}
              href={href}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 text-center"
            >
              <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-foreground leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
