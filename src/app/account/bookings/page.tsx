import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { computeBookingFinance, isBookingCompleted, PAYMENT_STATUS_LABELS } from "@/lib/bookings/finance";
import { customerBookingWhere } from "@/lib/account/bookingScope";

export const metadata: Metadata = { title: "My Bookings" };
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

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PARTIAL: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  FULL: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export default async function AccountBookingsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const rows = await prisma.booking.findMany({
    where: customerBookingWhere(session.user.id, session.user.email),
    orderBy: { createdAt: "desc" },
    include: {
      tour: { select: { title: true, slug: true, coverImage: true } },
      payments: { select: { amount: true, type: true } },
    },
  });
  const bookings = rows.map((b) => {
    const paymentStatus = computeBookingFinance({
      amount: b.amount,
      discountType: b.discountType,
      discountValue: b.discountValue,
      payments: b.payments,
      services: [],
    }).paymentStatus;
    return { ...b, paymentStatus, completed: isBookingCompleted(paymentStatus, b.travelDate) };
  });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">My Bookings</h1>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          You haven&apos;t booked any trips yet.{" "}
          <Link href="/tours" className="font-semibold text-primary hover:underline">
            Explore packages
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Link
              key={b.id}
              href={`/account/bookings/${b.id}`}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-bold text-foreground">
                    {b.tour?.title ?? "Custom booking"}
                  </span>
                  {b.completed ? (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[12px] font-bold text-emerald-700 dark:text-emerald-300">
                      Completed
                    </span>
                  ) : (
                    <>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold",
                          STATUS_STYLES[b.status],
                        )}
                      >
                        {b.status}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[12px] font-bold",
                          PAYMENT_STATUS_STYLES[b.paymentStatus],
                        )}
                      >
                        {PAYMENT_STATUS_LABELS[b.paymentStatus]}
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Travel date:{" "}
                  {b.travelDate.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {" · "}
                  {b.travellers} traveller{b.travellers > 1 ? "s" : ""}
                  {" · "}
                  Booked{" "}
                  {b.createdAt.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Ref: {b.id.slice(-8).toUpperCase()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-foreground">{inr.format(b.amount)}</p>
                <p className="text-[12px] font-semibold text-primary">View details →</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
