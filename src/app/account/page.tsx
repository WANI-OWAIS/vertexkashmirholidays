import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CreditCard, MapPin, ArrowRight, Building2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerBookingWhere } from "@/lib/account/bookingScope";
import { b2bLeadWhere } from "@/lib/b2b/leadScope";
import { B2B_STATUS_LABELS, B2B_STATUS_STYLES, type B2bRequestStatus } from "@/lib/b2b/requestStatus";
import { cn } from "@/lib/utils";
import { NewB2bRequestButton } from "@/components/account/NewB2bRequestButton";

export const metadata: Metadata = { title: "My Account" };
export const dynamic = "force-dynamic";

const B2B_STATUS_COPY: Record<"PENDING" | "ACTIVE" | "SUSPENDED", string> = {
  PENDING:
    "Your application is under review. We'll email your login details as soon as it's approved.",
  ACTIVE: "Your partner account is active — submit requests and track them under My Requests.",
  SUSPENDED: "Your partner account is currently suspended. Contact our B2B team for help.",
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default async function AccountOverviewPage() {
  const session = await auth();
  // AccountLayout already redirects unauthenticated visitors to /login, but
  // this page must not assume that guard always ran first (e.g. a session
  // that expires between the layout and page auth() calls).
  if (!session?.user) {
    redirect("/login");
  }
  const now = new Date();
  // A customer's bookings = linked to their account OR made as a guest with their
  // verified login email.
  const scope = customerBookingWhere(session.user.id, session.user.email);

  const [bookings, payments, totalBookings, agency, requests] = await Promise.all([
    prisma.booking.findMany({
      where: scope,
      orderBy: { travelDate: "asc" },
      take: 3,
      include: { tour: { select: { title: true, slug: true } } },
    }),
    // The actual payment ledger (online + staff-recorded), kept in sync with the
    // Payments tab. Net of refunds.
    prisma.bookingPayment.findMany({
      where: { booking: scope },
      select: { amount: true, type: true },
    }),
    prisma.booking.count({ where: scope }),
    session.user.agencyStatus
      ? prisma.user.findUnique({
          where: { id: session.user.id },
          select: { agencyName: true },
        })
      : Promise.resolve(null),
    session.user.agencyStatus
      ? prisma.lead.findMany({
          // CONVERTED requests are bookings now — see Recent Bookings above.
          where: { ...b2bLeadWhere(session.user.id), status: { not: "CONVERTED" } },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, name: true, days: true, adults: true, children: true, status: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const upcoming = bookings.filter((b) => b.travelDate >= now).length;
  const totalSpent = payments.reduce(
    (sum, p) => sum + (p.type === "REFUND" ? -p.amount : p.amount),
    0,
  );

  const stats = [
    { label: "Total Bookings", value: String(totalBookings), Icon: CalendarDays },
    { label: "Upcoming Trips", value: String(upcoming), Icon: MapPin },
    { label: "Total Spent", value: inr.format(totalSpent), Icon: CreditCard },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">
          Welcome back, {session.user.name ?? "Traveller"} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s a quick look at your trips with us.
        </p>
      </div>

      {session.user.agencyStatus && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3 sm:items-center">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-foreground">
                  {agency?.agencyName ? `${agency.agencyName} — ` : ""}B2B Partner Account
                </p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold",
                    session.user.agencyStatus === "ACTIVE"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : session.user.agencyStatus === "PENDING"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-red-500/15 text-red-700 dark:text-red-300",
                  )}
                >
                  {session.user.agencyStatus}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {B2B_STATUS_COPY[session.user.agencyStatus]}
              </p>
            </div>
          </div>
          {session.user.agencyStatus === "ACTIVE" && (
            <NewB2bRequestButton label="New Package Request" />
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-display font-bold text-foreground">Recent Bookings</h2>
          <Link
            href="/account/bookings"
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {bookings.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            You have no bookings yet.{" "}
            <Link href="/tours" className="font-semibold text-primary hover:underline">
              Browse packages
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {b.tour?.title ?? "Custom booking"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.travelDate.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {" · "}
                    {b.travellers} traveller{b.travellers > 1 ? "s" : ""}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-foreground">
                  {inr.format(b.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {session.user.agencyStatus && (
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-display font-bold text-foreground">Recent Requests</h2>
            <Link
              href="/account/requests"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {requests.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              You haven&apos;t submitted any package requests yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => {
                const status = r.status as B2bRequestStatus;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/account/requests/${r.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.days ? `${r.days} days` : "Days TBD"} · {r.adults}
                          {r.children ? ` + ${r.children} children` : ""} pax
                          {" · "}
                          {r.createdAt.toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold",
                          B2B_STATUS_STYLES[status] ?? "",
                        )}
                      >
                        {B2B_STATUS_LABELS[status] ?? r.status}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
