"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Map, FileText, Plus, ArrowRight, Loader2, Lock } from "lucide-react";

interface BookingItineraryCardProps {
  bookingId: string;
  servicesLocked: boolean;
  isLeadConverted: boolean;
  /** The converted lead is a B2B request — the itinerary lives under the
   *  dedicated B2B editor (/admin/b2b-itineraries), never the normal one:
   *  that route explicitly 404s for a B2B-linked itinerary (see
   *  api/itineraries/[id]/route.ts), and only the B2B editor knows how to
   *  export the agent-branded quotation PDF. */
  isB2bLead: boolean;
  leadItineraryId: string | null;
  itinerary: { id: string; status: string } | null;
  /** Server checks `itinerary:create` (not `bookings:edit`) for this action. */
  canCreate: boolean;
}

// Booking-detail itinerary panel.
//   • Lead-converted booking → links to the lead's finalised (locked) itinerary,
//     read-only. No creation/editing here.
//   • Direct booking → generate / manage the booking's own itinerary; once the
//     booking's services are locked it becomes view-only (history preserved).
export function BookingItineraryCard({
  bookingId,
  servicesLocked,
  isLeadConverted,
  isB2bLead,
  leadItineraryId,
  itinerary,
  canCreate,
}: BookingItineraryCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const res = await fetch(`/api/bookings/${bookingId}/itinerary`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        toast.error(json.error ?? "Could not create the itinerary.");
        return;
      }
      router.push(`/admin/itinerary/${json.id}`);
    });
  }

  const linkClass =
    "mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[14px] font-bold text-primary-foreground transition hover:brightness-110";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="flex items-center gap-2 font-display font-bold text-foreground text-sm">
        <Map className="w-4 h-4 text-primary" /> Itinerary
      </h3>

      {isLeadConverted ? (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This booking was converted from a lead — its itinerary is the lead&apos;s finalised plan
            and is <strong className="text-foreground">read-only</strong>.
          </p>
          {leadItineraryId ? (
            <Link
              href={`${isB2bLead ? "/admin/b2b-itineraries" : "/admin/itinerary"}/${leadItineraryId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              <FileText className="w-4 h-4" /> View Itinerary <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No itinerary was attached to the lead.
            </p>
          )}
        </div>
      ) : itinerary ? (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">
            Status: <span className="font-semibold text-foreground">{itinerary.status}</span>
            {servicesLocked && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Lock className="w-3 h-3" /> View-only (services locked)
              </span>
            )}
          </p>
          <Link
            href={`/admin/itinerary/${itinerary.id}`}
            {...(servicesLocked ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={linkClass}
          >
            <FileText className="w-4 h-4" />
            {servicesLocked ? "View Itinerary" : "Manage Itinerary"}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : servicesLocked ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Services are locked — an itinerary can no longer be created for this booking.
        </p>
      ) : canCreate ? (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Generate a travel itinerary for this booking. You can edit, version and publish it until
            the booking&apos;s services are locked.
          </p>
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-[14px] font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Generate Itinerary
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No itinerary has been created yet.</p>
      )}
    </div>
  );
}
