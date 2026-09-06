import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getSiteSettings } from "@/lib/siteSettings";
import { parseGstRates } from "@/lib/payments/gst";
import { computeBookingFinance } from "@/lib/bookings/finance";
import { bookingWhereForUser } from "@/lib/bookings/scope";
import { requireModuleView } from "@/lib/admin/moduleGuard";
import {
  BookingServicesClient,
  DriverSection,
} from "@/components/admin/bookings/BookingServicesClient";
import { BookingItineraryCard } from "@/components/admin/bookings/BookingItineraryCard";
import { BookingAdminPanel } from "@/components/admin/bookings/BookingAdminPanel";

export const metadata: Metadata = { title: "Booking Services — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function parseInclusions(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default async function BookingServicesPage({ params }: PageProps) {
  const { id } = await params;
  const guard = await requireModuleView("bookings");
  if (!guard.ok) return guard.page;
  const { role, userId } = guard;

  const [canEdit, canCreateItinerary] = await Promise.all([
    can(role, "bookings", "edit"),
    can(role, "itinerary", "create"),
  ]);

  const booking = await prisma.booking.findFirst({
    where: { id, deletedAt: null, ...bookingWhereForUser(role, userId) },
    include: {
      tour: { select: { title: true } },
      user: { select: { name: true, email: true, mustChangePassword: true } },
      services: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      payments: { orderBy: { createdAt: "asc" } },
      leads: {
        take: 1,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          endDate: true,
          b2bAgentId: true,
          assignedTo: { select: { name: true, email: true } },
          itinerary: { select: { id: true } },
        },
      },
      // Direct-booking itinerary (lead-converted bookings use the lead's instead).
      itinerary: { select: { id: true, status: true } },
    },
  });
  if (!booking) notFound();

  const lead = booking.leads[0] ?? null;

  const data = {
    id: booking.id,
    amount: booking.amount,
    status: booking.status,
    servicesLocked: booking.servicesLocked,
    createdAt: booking.createdAt.toISOString(),
    discountType: booking.discountType,
    discountValue: booking.discountValue,
    inclusions: parseInclusions(booking.inclusions),
    travelDate: booking.travelDate.toISOString(),
    travelEndDate: booking.travelEndDate ? booking.travelEndDate.toISOString() : null,
    driver: booking.driverAddedAt
      ? {
          driverName: booking.driverName ?? "",
          driverPhone: booking.driverPhone ?? "",
          vehicleNumber: booking.vehicleNumber ?? "",
          vehicleName: booking.vehicleName ?? "",
        }
      : null,
    travellers: booking.travellers,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone,
    address: booking.address,
    requirements: booking.requirements,
    tourTitle: booking.tour?.title ?? null,
    isWebsiteBooking: !!booking.razorpayOrderId,
    customer: booking.user ? { name: booking.user.name, email: booking.user.email } : null,
    lead,
    services: booking.services.map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      amount: s.amount,
      location: s.location,
      nights: s.nights,
      roomType: s.roomType,
      pickup: s.pickup,
      dropoff: s.dropoff,
      timing: s.timing,
      sortOrder: s.sortOrder,
    })),
    payments: booking.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      type: p.type,
      method: p.method,
      reference: p.reference,
      note: p.note,
      gstPercent: p.gstPercent,
      gstAmount: p.gstAmount,
      createdAt: p.createdAt.toISOString(),
    })),
  };

  const settings = await getSiteSettings();
  const gstRates = parseGstRates(settings?.gstRates);

  // Derived financials for the admin payment panel (single source of truth).
  const finance = computeBookingFinance({
    amount: booking.amount,
    discountType: booking.discountType,
    discountValue: booking.discountValue,
    payments: booking.payments,
    services: booking.services,
  });

  return (
    <div className="space-y-5">
      <nav>
        <ol className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <li>
            <Link href="/admin/bookings" className="hover:text-primary transition-colors">
              Bookings
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="w-3 h-3" />
          </li>
          <li className="text-foreground font-medium">
            Services · {booking.id.slice(-8).toUpperCase()}
          </li>
        </ol>
      </nav>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-foreground text-xl">Booking Services</h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            Ref {booking.id.slice(-8).toUpperCase()}
          </p>
        </div>
        {booking.servicesLocked && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            <Lock className="w-4 h-4" /> Services locked
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 items-start">
        {/* Left — 75%: service editor, details, payments, lock CTA */}
        <div className="xl:col-span-3">
          <BookingServicesClient booking={data} gstRates={gstRates} canEdit={canEdit} />
        </div>
        {/* Right — 25%: payment status panel + itinerary card */}
        <div className="xl:col-span-1 space-y-5">
          <BookingItineraryCard
            bookingId={booking.id}
            servicesLocked={booking.servicesLocked}
            isLeadConverted={!!lead}
            isB2bLead={!!lead?.b2bAgentId}
            leadItineraryId={lead?.itinerary?.id ?? null}
            itinerary={booking.itinerary ?? null}
            canCreate={canCreateItinerary}
          />
          <BookingAdminPanel
            bookingId={booking.id}
            paymentOption={booking.paymentOption}
            status={booking.status}
            razorpayOrderId={booking.razorpayOrderId}
            razorpayPayId={booking.razorpayPayId}
            paidAmount={finance.paidAmount}
            balance={finance.balance}
            paymentStatus={finance.paymentStatus}
            customer={
              booking.user
                ? {
                    email: booking.user.email,
                    name: booking.user.name,
                    mustChangePassword: booking.user.mustChangePassword,
                  }
                : null
            }
            canEdit={canEdit}
          />
          {/* Driver & vehicle — only once services are locked. */}
          {booking.servicesLocked && (
            <DriverSection
              bookingId={booking.id}
              travelDate={data.travelDate}
              initialDriver={data.driver}
              canEdit={canEdit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
