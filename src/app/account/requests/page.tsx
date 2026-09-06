import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { b2bLeadWhere } from "@/lib/b2b/leadScope";
import { B2B_STATUS_LABELS, B2B_STATUS_STYLES, type B2bRequestStatus } from "@/lib/b2b/requestStatus";
import { NewB2bRequestButton } from "@/components/account/NewB2bRequestButton";

export const metadata: Metadata = { title: "My Requests" };
export const dynamic = "force-dynamic";

/**
 * A B2B agent's own requests — server-side scoped via b2bLeadWhere(userId),
 * never client-filtered. Visible at any agencyStatus (PENDING/ACTIVE/
 * SUSPENDED): this is read-only history, not a capability — only request
 * *creation* is ACTIVE-gated (see POST /api/account/b2b/requests, Phase 2).
 * A normal customer (agencyStatus null) never sees this page at all.
 *
 * Excludes CONVERTED — once a request becomes a booking it moves to My
 * Bookings (same Booking row, already linked via userId) instead of lingering
 * here too; only NEW/IN_PROGRESS (and REJECTED, if ever set) show as requests.
 */
export default async function AccountRequestsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.agencyStatus === null) {
    redirect("/account");
  }

  const requests = await prisma.lead.findMany({
    where: { ...b2bLeadWhere(session.user.id), status: { not: "CONVERTED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      adults: true,
      children: true,
      days: true,
      startDate: true,
      endDate: true,
      status: true,
      bookingId: true,
      createdAt: true,
      itinerary: { select: { status: true } },
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">My Requests</h1>
        {session.user.agencyStatus === "ACTIVE" && <NewB2bRequestButton label="New Request" />}
      </div>

      {requests.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          You haven&apos;t submitted any B2B requests yet.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const status = r.status as B2bRequestStatus;
            const itineraryReady = !!r.itinerary && r.itinerary.status !== "DRAFT";
            return (
              <Link
                key={r.id}
                href={`/account/requests/${r.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-foreground">{r.name}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold",
                        B2B_STATUS_STYLES[status] ?? "",
                      )}
                    >
                      {B2B_STATUS_LABELS[status] ?? r.status}
                    </span>
                    {itineraryReady && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-bold text-primary">
                        Itinerary ready
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.days ? `${r.days} days` : "Days TBD"} · {r.adults}
                    {r.children ? ` + ${r.children} children` : ""} pax
                    {" · "}
                    Submitted{" "}
                    {r.createdAt.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <p className="text-[12px] font-semibold text-primary">View details →</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
