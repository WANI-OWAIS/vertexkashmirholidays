"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, isCashMethod } from "@/lib/payments/gst";
import {
  Trash2,
  Clock,
  User,
  ArrowRight,
  MessageSquare,
  Phone,
  Mail,
  Paperclip,
  ChevronDown,
  Loader2,
  Link2,
  FileText,
  Lock,
  Unlock,
  Pencil,
  Eye,
  History,
  Plus,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

// IN_PROGRESS is a real LeadStatus value at the type level (it's a B2B-request
// -only value — see prisma/schema.prisma), included here only so this type
// structurally matches Prisma's Lead.status; this page excludes B2B rows
// (see admin/leads/page.tsx, admin/leads/[id]/page.tsx) so it never actually
// renders in practice.
type LeadStatus =
  | "NEW"
  | "CONNECTED"
  | "NOT_CONNECTED"
  | "QUALIFIED"
  | "NEGOTIATION"
  | "ON_HOLD"
  | "IN_PROGRESS"
  | "CONVERTED"
  | "REJECTED";
type LeadSource = "WEBSITE" | "MANUAL" | "GOOGLE_ADS" | "META_ADS" | "THIRD_PARTY" | "REFERRAL";
type LeadCategory =
  "HONEYMOON_TOUR" | "COUPLE" | "FAMILY_TOUR" | "GROUP_TOUR" | "SKI_TOUR" | "OFFBEAT_TOUR";
type LeadActivityType =
  | "STATUS_CHANGE"
  | "ASSIGNMENT_CHANGE"
  | "NOTE_ADDED"
  | "FOLLOW_UP_SCHEDULED"
  | "ATTACHMENT_ADDED"
  | "CALL_LOGGED"
  | "EMAIL_SENT"
  | "BOOKING_LINKED";

interface Activity {
  id: string;
  type: LeadActivityType;
  note: string | null;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  fromAssigneeId: string | null;
  toAssigneeId: string | null;
  performedByName: string;
  performedAt: Date | string;
}

interface LinkedBooking {
  id: string;
  status: string;
  amount: number;
  travelDate: Date | string;
  guestName: string;
}

interface ByUser {
  name: string | null;
  email: string;
}

interface LeadItinerary {
  id: string;
  title: string;
  status: string;
  locked: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  owner: ByUser | null;
  lastEditedBy: ByUser | null;
  history: { id: string; title: string; editedByName: string; createdAt: Date | string }[];
  _count: { history: number };
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  category: LeadCategory | null;
  adults: number;
  children: number | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  notes: string | null;
  // JSON-string array — currently only ever populated by the B2B registration
  // form's logo (see parseLogoAttachment() in src/app/api/leads/route.ts).
  attachments: string;
  followUpAt: Date | string | null;
  status: LeadStatus;
  locked: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  bookingId: string | null;
  booking: LinkedBooking | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  negotiatedAmount: number | null;
  tokenAmount: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  activities: Activity[];
  itinerary: LeadItinerary | null;
  // Raw attribution signals — what deriveChannel() (src/lib/attribution.server.ts)
  // actually classified `source` from. Shown so staff can self-diagnose an
  // unexpected source (e.g. a stale first-touch cookie carrying an old test
  // gclid) without needing database access.
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  msclkid: string | null;
  landingPage: string | null;
  referrer: string | null;
}

interface StaffUser {
  id: string;
  name: string | null;
  email: string;
}

interface IpDuplicateLead {
  id: string;
  name: string;
  createdAt: Date | string;
}

interface Props {
  lead: Lead;
  staffUsers: StaffUser[];
  canManageItinerary: boolean;
  isAdmin: boolean;
  canManage: boolean;
  gstRates: number[];
  ipDuplicates: IpDuplicateLead[];
}

const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-link/10 text-link",
  CONNECTED: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  NOT_CONNECTED: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  QUALIFIED: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  NEGOTIATION: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ON_HOLD: "bg-muted text-muted-foreground",
  // B2B-request-only value — never actually rendered here (see comment on the
  // LeadStatus type above), present only so this Record type-checks.
  IN_PROGRESS: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  CONVERTED: "bg-green-500/15 text-green-700 dark:text-green-300",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const BOOKING_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  PAID: "bg-green-500/15 text-green-700 dark:text-green-300",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-300",
  CANCELLED: "bg-muted text-muted-foreground",
  REFUNDED: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
};

const ACTIVITY_ICONS: Record<LeadActivityType, LucideIcon> = {
  STATUS_CHANGE: ArrowRight,
  ASSIGNMENT_CHANGE: User,
  NOTE_ADDED: MessageSquare,
  FOLLOW_UP_SCHEDULED: Clock,
  CALL_LOGGED: Phone,
  EMAIL_SENT: Mail,
  ATTACHMENT_ADDED: Paperclip,
  BOOKING_LINKED: Link2,
};

function fmtSource(s: LeadSource) {
  return s.toLowerCase().replace(/_/g, " ");
}

function fmtCategory(c: LeadCategory | null) {
  if (!c) return "—";
  return c.toLowerCase().replace(/_/g, " ");
}

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: Date | string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function activityLabel(a: Activity): string {
  switch (a.type) {
    case "STATUS_CHANGE":
      return `Status: ${a.fromStatus?.replace(/_/g, " ")} → ${a.toStatus?.replace(/_/g, " ")}`;
    case "ASSIGNMENT_CHANGE":
      return a.toAssigneeId ? "Lead assigned" : "Lead unassigned";
    case "NOTE_ADDED":
      return "Note added";
    case "FOLLOW_UP_SCHEDULED":
      return "Follow-up scheduled";
    case "CALL_LOGGED":
      return "Call logged";
    case "EMAIL_SENT":
      return "Email sent";
    case "ATTACHMENT_ADDED":
      return "Attachment added";
    case "BOOKING_LINKED":
      return a.note?.startsWith("Linked") ? "Booking linked" : "Booking unlinked";
  }
}

// Order mirrors deriveChannel()'s own precedence (click IDs first, then UTMs)
// so the field staff most needs to check to explain a classification appears
// first, not alphabetically.
const ATTRIBUTION_DISPLAY_FIELDS: { key: keyof Lead; label: string }[] = [
  { key: "gclid", label: "Google Click ID (gclid)" },
  { key: "gbraid", label: "gbraid" },
  { key: "wbraid", label: "wbraid" },
  { key: "fbclid", label: "Meta Click ID (fbclid)" },
  { key: "msclkid", label: "Microsoft Click ID (msclkid)" },
  { key: "utmSource", label: "UTM Source" },
  { key: "utmMedium", label: "UTM Medium" },
  { key: "utmCampaign", label: "UTM Campaign" },
  { key: "utmTerm", label: "UTM Term" },
  { key: "utmContent", label: "UTM Content" },
  { key: "referrer", label: "Referrer" },
  { key: "landingPage", label: "Landing Page" },
];

interface LeadAttachment {
  label: string;
  dataUrl: string;
}

// Only ever populated today by the B2B registration form's company logo
// (parseLogoAttachment() in src/app/api/leads/route.ts) — tolerant of
// malformed/legacy JSON since this column has no schema-level guarantee.
function parseAttachments(raw: string): LeadAttachment[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is LeadAttachment =>
        !!a && typeof a === "object" && typeof a.label === "string" && typeof a.dataUrl === "string",
    );
  } catch {
    return [];
  }
}

const selectCls =
  "w-full pl-3 pr-8 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-card appearance-none disabled:opacity-60";

export function LeadDetail({
  lead,
  staffUsers,
  canManageItinerary,
  isAdmin,
  canManage,
  gstRates,
  ipDuplicates,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const converted = lead.status === "CONVERTED";
  const locked = lead.locked;
  const itinerary = lead.itinerary;
  const populatedAttribution = ATTRIBUTION_DISPLAY_FIELDS.filter(({ key }) => lead[key]);
  const attachments = parseAttachments(lead.attachments);
  const [showConvert, setShowConvert] = useState(false);
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [assignedToId, setAssignedToId] = useState(lead.assignedToId ?? "");
  const [category, setCategory] = useState(lead.category ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [followUpAt, setFollowUpAt] = useState(
    lead.followUpAt ? new Date(lead.followUpAt).toISOString().slice(0, 16) : "",
  );
  const [bookingInput, setBookingInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Activity timeline is collapsed to the latest 3 entries by default.
  const [showAllActivity, setShowAllActivity] = useState(false);

  // Sync local state when RSC re-delivers fresh props after router.refresh().
  useEffect(() => {
    setStatus(lead.status);
    setAssignedToId(lead.assignedToId ?? "");
    setCategory(lead.category ?? "");
    setNotes(lead.notes ?? "");
    setFollowUpAt(lead.followUpAt ? new Date(lead.followUpAt).toISOString().slice(0, 16) : "");
  }, [lead.status, lead.assignedToId, lead.category, lead.notes, lead.followUpAt]);

  // Clear the booking input when a booking is unlinked.
  useEffect(() => {
    if (!lead.booking) setBookingInput("");
  }, [lead.booking]);

  function patch(payload: Record<string, unknown>) {
    if (locked) {
      toast.error("This lead is locked. Ask an admin to unlock it before editing.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string | Record<string, unknown> };
          const msg = typeof j.error === "string" ? j.error : "Update failed.";
          toast.error(msg);
          return;
        }
        toast.success("Saved.");
        router.refresh();
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  function handleStatusChange(val: LeadStatus) {
    setStatus(val);
    patch({ status: val });
  }

  function handleConvert(
    bookingAmount: number,
    tokenAmount: number,
    paymentMethod: string,
    gstPercent: number | null,
  ) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leads/${lead.id}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingAmount, tokenAmount, paymentMethod, gstPercent }),
        });
        const j = (await res.json().catch(() => ({}))) as { bookingId?: string; error?: string };
        if (!res.ok || !j.bookingId) {
          toast.error(j.error ?? "Conversion failed.");
          return;
        }
        toast.success("Lead converted — booking created.");
        router.push(`/admin/bookings/${j.bookingId}/services`);
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  function handleUnlock() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leads/${lead.id}/unlock`, { method: "POST" });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j.error ?? "Unlock failed.");
          return;
        }
        toast.success("Lead unlocked.");
        router.refresh();
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  function handleAssignChange(val: string) {
    setAssignedToId(val);
    patch({ assignedToId: val || null });
  }

  function handleCategoryChange(val: string) {
    setCategory(val);
    patch({ category: val || null });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(j.error ?? "Failed to delete lead.");
          return;
        }
        toast.success("Lead deleted.");
        router.push("/admin/leads");
        router.refresh();
      } catch {
        toast.error("Failed to delete lead.");
      }
    });
  }

  function handleGenerateItinerary() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leads/${lead.id}/itinerary`, { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!res.ok || !j.id) {
          toast.error(j.error ?? "Failed to create itinerary.");
          return;
        }
        router.push(`/admin/itinerary/${j.id}`);
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-foreground text-xl">{lead.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                "text-[12px] font-bold px-2 py-0.5 rounded-full",
                STATUS_STYLES[status],
              )}
            >
              {status.replace(/_/g, " ")}
            </span>
            {locked && (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold text-amber-600 dark:text-amber-400">
                <Lock className="w-3 h-3" /> Locked
              </span>
            )}
            <span className="text-xs text-muted-foreground">Added {fmtDateTime(lead.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {confirmDelete ? (
            <>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 px-3 py-2 rounded-xl transition-colors"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Confirm Delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-xl border border-border transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              {/* Convert is offered only while the lead is in NEGOTIATION — not for
                  any other status. The booking/token amounts are entered in the modal. */}
              {status === "NEGOTIATION" && !locked && canManage && (
                <button
                  onClick={() => {
                    // Mirror the server rule: itinerary is mandatory before conversion.
                    if (!itinerary) {
                      toast.error("Add an itinerary for this lead before converting.");
                      return;
                    }
                    setShowConvert(true);
                  }}
                  disabled={isPending}
                  title={
                    itinerary ? undefined : "An itinerary is required before converting this lead."
                  }
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 px-3 py-2 rounded-xl transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Convert
                </button>
              )}
              {locked && isAdmin && (
                <button
                  onClick={handleUnlock}
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 px-3 py-2 rounded-xl transition-colors"
                >
                  {isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unlock className="w-3.5 h-3.5" />
                  )}
                  Unlock
                </button>
              )}
              {/* Assignee on an active lead edits; the assignee on a locked lead and
                  any admin get a read-only "View Form" instead. */}
              {canManage && !locked ? (
                <Link
                  href={`/admin/leads/${lead.id}/edit`}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 px-3 py-2 rounded-xl border border-border transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Link>
              ) : canManage || isAdmin ? (
                <Link
                  href={`/admin/leads/${lead.id}/edit`}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 px-3 py-2 rounded-xl border border-border transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Form
                </Link>
              ) : null}
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={converted}
                title={converted ? "Converted leads cannot be deleted." : undefined}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-red-500 hover:bg-red-500/10 px-3 py-2 rounded-xl border border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Locked (converted) lead — read-only notice for everyone. */}
      {locked && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-amber-700 dark:text-amber-300">This lead is locked</p>
            <p className="text-muted-foreground mt-0.5">
              It has been converted to a booking, so its details are read-only.{" "}
              {isAdmin
                ? "Unlock the lead to make changes."
                : "Ask an admin to unlock it before any changes can be made."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        {/* LEFT: details + notes + activity */}
        <div className="space-y-5">
          {/* Lead info grid */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
            <h3 className="font-bold text-foreground text-sm mb-4">Lead Details</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 text-xs">
              <div>
                <p className="text-muted-foreground mb-0.5">Phone</p>
                <a
                  href={`tel:${lead.phone}`}
                  className="font-semibold text-foreground hover:text-primary transition-colors"
                >
                  {lead.phone}
                </a>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Email</p>
                {lead.email ? (
                  <a
                    href={`mailto:${lead.email}`}
                    className="font-semibold text-foreground hover:text-primary transition-colors truncate block max-w-full"
                  >
                    {lead.email}
                  </a>
                ) : (
                  <p className="font-semibold text-foreground">—</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Source</p>
                <p className="font-semibold text-foreground capitalize">{fmtSource(lead.source)}</p>
              </div>
              {lead.ipAddress && (
                <div>
                  <p className="text-muted-foreground mb-0.5">IP Address</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {lead.ipAddress}
                    </span>
                    {ipDuplicates.length === 1 && (
                      <Link
                        href={`/admin/leads/${ipDuplicates[0].id}`}
                        className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[12px] font-bold text-amber-700 dark:text-amber-300 hover:underline"
                      >
                        maybe duplicate
                      </Link>
                    )}
                    {ipDuplicates.length > 1 && (
                      <Link
                        href={`/admin/leads?ip=${encodeURIComponent(lead.ipAddress!)}`}
                        className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[12px] font-bold text-amber-700 dark:text-amber-300 hover:underline"
                      >
                        maybe duplicate ({ipDuplicates.length})
                      </Link>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-muted-foreground mb-0.5">Category</p>
                <p className="font-semibold text-foreground capitalize">
                  {fmtCategory(lead.category)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Adults</p>
                <p className="font-semibold text-foreground">{lead.adults}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Children</p>
                <p className="font-semibold text-foreground">{lead.children ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Travel Start</p>
                <p className="font-semibold text-foreground">{fmtDate(lead.startDate)}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Travel End</p>
                <p className="font-semibold text-foreground">{fmtDate(lead.endDate)}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Assigned To</p>
                <div>
                  <p className="font-semibold text-foreground">{lead.assignedTo?.name ?? "—"}</p>
                  {lead.assignedTo?.email && (
                    <p className="text-[12px] text-muted-foreground">{lead.assignedTo.email}</p>
                  )}
                </div>
              </div>
              {/* Negotiated/token amounts are captured in the Convert modal, so they
                  are not shown here before conversion — only after, once recorded. */}
              {converted && lead.negotiatedAmount != null && (
                <div>
                  <p className="text-muted-foreground mb-0.5">Negotiated Amount</p>
                  <p className="font-semibold text-foreground">
                    ₹{lead.negotiatedAmount.toLocaleString("en-IN")}
                  </p>
                </div>
              )}
              {converted && lead.tokenAmount != null && (
                <div>
                  <p className="text-muted-foreground mb-0.5">Token Amount</p>
                  <p className="font-semibold text-foreground">
                    ₹{lead.tokenAmount.toLocaleString("en-IN")}
                  </p>
                </div>
              )}
              {lead.booking && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-muted-foreground mb-0.5">Linked Booking</p>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/admin/bookings"
                      className="font-mono text-[12px] text-primary hover:underline"
                    >
                      {lead.booking.id}
                    </Link>
                    <span
                      className={cn(
                        "text-[12px] font-bold px-1.5 py-0.5 rounded-full",
                        BOOKING_STATUS_STYLES[lead.booking.status] ??
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {lead.booking.status}
                    </span>
                  </div>
                </div>
              )}
              <div>
                <p className="text-muted-foreground mb-0.5">Follow-up</p>
                {lead.followUpAt ? (
                  <p
                    className={cn(
                      "font-semibold",
                      new Date(lead.followUpAt) < new Date()
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-foreground",
                    )}
                  >
                    {fmtDate(lead.followUpAt)}
                  </p>
                ) : (
                  <p className="font-semibold text-foreground">—</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground mb-0.5">Last Updated</p>
                <p className="font-semibold text-foreground">{fmtDate(lead.updatedAt)}</p>
              </div>
            </div>
          </div>

          {/* Attachments — currently only the B2B registration form's company logo. */}
          {attachments.length > 0 && (
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
              <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                <Paperclip className="w-4 h-4" /> Attachments
              </h3>
              <div className="flex flex-wrap gap-4">
                {attachments.map((a, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element -- tiny (<=5KB) stored data URI, not a remote asset next/image can optimize */}
                    <img
                      src={a.dataUrl}
                      alt={a.label}
                      className="h-12 w-12 rounded-lg border border-border object-contain bg-muted"
                    />
                    <span className="text-xs font-semibold text-foreground">{a.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attribution — the raw signals deriveChannel() classified `source` from. */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
            <h3 className="font-bold text-foreground text-sm mb-4">Attribution</h3>
            {populatedAttribution.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No click ID, UTM, or referrer data captured — this visit had no ad-platform or
                campaign signal, consistent with the &quot;{fmtSource(lead.source)}&quot; source.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
                {populatedAttribution.map(({ key, label }) => (
                  <div key={key} className={key === "landingPage" || key === "referrer" ? "sm:col-span-2" : undefined}>
                    <p className="text-muted-foreground mb-0.5">{label}</p>
                    <p className="font-mono font-semibold text-foreground break-all">
                      {lead[key] as string}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Itinerary */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" /> Itinerary
              </h3>
              {itinerary?.locked && (
                <span className="inline-flex items-center gap-1 text-[12px] font-bold text-amber-600 dark:text-amber-400">
                  <Lock className="w-3 h-3" /> Locked
                </span>
              )}
            </div>

            {itinerary ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground text-sm">{itinerary.title}</p>
                  <span className="text-[12px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {itinerary.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                  <div>
                    <p className="text-muted-foreground mb-0.5">Generated</p>
                    <p className="font-semibold text-foreground">{fmtDate(itinerary.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-0.5">Last updated</p>
                    <p className="font-semibold text-foreground">{fmtDate(itinerary.updatedAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-0.5">Created by</p>
                    <p className="font-semibold text-foreground">{itinerary.owner?.name ?? "—"}</p>
                    {itinerary.owner?.email && (
                      <p className="text-[12px] text-muted-foreground">{itinerary.owner.email}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-0.5">Last updated by</p>
                    <p className="font-semibold text-foreground">
                      {(itinerary.lastEditedBy ?? itinerary.owner)?.name ?? "—"}
                    </p>
                    {(itinerary.lastEditedBy ?? itinerary.owner)?.email && (
                      <p className="text-[12px] text-muted-foreground">
                        {(itinerary.lastEditedBy ?? itinerary.owner)?.email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  {canManageItinerary && !converted && !itinerary.locked ? (
                    <Link
                      href={`/admin/itinerary/${itinerary.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Itinerary
                    </Link>
                  ) : (
                    <Link
                      href={`/admin/itinerary/${itinerary.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold border border-border text-foreground hover:bg-muted px-4 py-2 rounded-xl transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Itinerary
                    </Link>
                  )}
                </div>

                {converted && (
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Final itinerary for the converted lead — locked and
                    no longer editable.
                  </p>
                )}

                {itinerary.history.length > 0 && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5" /> Edit history ({itinerary._count.history})
                    </summary>
                    <ol className="mt-2 space-y-2 border-l border-border pl-3">
                      {itinerary.history.map((h) => (
                        <li key={h.id} className="text-[12px]">
                          <p className="font-semibold text-foreground">
                            {fmtDateTime(h.createdAt)}
                          </p>
                          <p className="text-muted-foreground">by {h.editedByName}</p>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground mb-3">
                  No itinerary yet for this lead.
                </p>
                {canManageItinerary && !converted ? (
                  <button
                    onClick={handleGenerateItinerary}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 text-xs font-bold bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition-colors"
                  >
                    {isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    Generate Itinerary
                  </button>
                ) : (
                  <p className="text-[12px] text-muted-foreground">
                    {converted
                      ? "Lead was converted without an itinerary."
                      : "You don't have permission to manage this lead's itinerary."}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
            <h3 className="font-bold text-foreground text-sm mb-3">Notes</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={!canManage || locked}
              className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition resize-none disabled:opacity-60"
              placeholder={
                canManage ? "Add notes about this lead..." : "Only the assignee can add notes."
              }
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={() => patch({ notes })}
                disabled={isPending || notes === (lead.notes ?? "") || !canManage || locked}
                className="flex items-center gap-1.5 text-xs font-bold bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition-colors"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Notes
              </button>
            </div>
          </div>

          {/* Activity timeline */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
            <h3 className="font-bold text-foreground text-sm mb-4">
              Activity{lead.activities.length > 0 && ` (${lead.activities.length})`}
            </h3>
            {lead.activities.length === 0 ? (
              <p className="text-muted-foreground text-xs py-4 text-center">
                No activity recorded yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {(showAllActivity ? lead.activities : lead.activities.slice(0, 3)).map((a) => {
                  const Icon = ACTIVITY_ICONS[a.type];
                  return (
                    <li key={a.id} className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0 pb-3 border-b border-border last:border-0 last:pb-0">
                        <p className="text-xs font-semibold text-foreground">{activityLabel(a)}</p>
                        {a.note && (
                          <p className="text-[12px] text-muted-foreground mt-0.5">{a.note}</p>
                        )}
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          by {a.performedByName} · {fmtDateTime(a.performedAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {lead.activities.length > 3 && (
              <button
                onClick={() => setShowAllActivity((v) => !v)}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
              >
                {showAllActivity ? "View Less" : `View More (${lead.activities.length - 3} older)`}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT: quick-edit panel */}
        <div className="space-y-4">
          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground text-sm">Update Lead</h3>
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>

            {!canManage && !locked && (
              <p className="text-[12px] text-muted-foreground rounded-lg bg-muted px-2.5 py-2">
                {isAdmin
                  ? "As an admin you can reassign this lead. Status, itinerary, conversion and other updates are handled by its assignee."
                  : "This lead is managed by its assignee."}
              </p>
            )}

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Status
              </label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                  disabled={isPending || locked || !canManage}
                  className={selectCls}
                >
                  <option value="NEW">New</option>
                  <option value="CONNECTED">Connected</option>
                  <option value="NOT_CONNECTED">Not Connected</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="NEGOTIATION">Negotiation</option>
                  <option value="ON_HOLD">On Hold</option>
                  {/* Conversion is a dedicated CTA, not a status choice — only shown when already converted. */}
                  {converted && <option value="CONVERTED">Converted</option>}
                  <option value="REJECTED">Rejected</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Assigned To */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Assigned To
              </label>
              <div className="relative">
                <select
                  value={assignedToId}
                  onChange={(e) => handleAssignChange(e.target.value)}
                  disabled={isPending || !isAdmin || locked}
                  title={
                    locked
                      ? "Unlock the lead before reassigning."
                      : isAdmin
                        ? undefined
                        : "Only an admin can change the assignee."
                  }
                  className={selectCls}
                >
                  <option value="">Unassigned</option>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name ?? u.email} ({u.email})
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Category
              </label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  disabled={isPending || !canManage || locked}
                  className={selectCls}
                >
                  <option value="">— Select —</option>
                  <option value="HONEYMOON_TOUR">Honeymoon</option>
                  <option value="COUPLE">Couple</option>
                  <option value="FAMILY_TOUR">Family</option>
                  <option value="GROUP_TOUR">Group</option>
                  <option value="SKI_TOUR">Ski</option>
                  <option value="OFFBEAT_TOUR">Offbeat</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Booking Amounts — read-only, shown only after conversion when recorded.
              Before conversion these are entered through the Convert modal, so this
              section is intentionally hidden to avoid redundant/confusing entry. */}
          {converted && (lead.negotiatedAmount != null || lead.tokenAmount != null) && (
            <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-3">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> Booking Amounts
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground mb-0.5">Negotiated</p>
                  <p className="font-bold text-foreground">
                    {lead.negotiatedAmount != null
                      ? `₹${lead.negotiatedAmount.toLocaleString("en-IN")}`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Token</p>
                  <p className="font-bold text-foreground">
                    {lead.tokenAmount != null
                      ? `₹${lead.tokenAmount.toLocaleString("en-IN")}`
                      : "—"}
                  </p>
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Locked at conversion. Manage further payments from the booking.
              </p>
            </div>
          )}

          {/* Follow-up */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground text-sm">Follow-up</h3>
              {lead.followUpAt && canManage && !locked && (
                <button
                  onClick={() => {
                    setFollowUpAt("");
                    patch({ followUpAt: null });
                  }}
                  disabled={isPending}
                  className="text-[12px] text-muted-foreground hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              type="datetime-local"
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
              disabled={isPending || !canManage || locked}
              className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-card disabled:opacity-60"
            />
            <button
              onClick={() => patch({ followUpAt: followUpAt || null })}
              disabled={
                isPending ||
                !canManage ||
                locked ||
                followUpAt ===
                  (lead.followUpAt ? new Date(lead.followUpAt).toISOString().slice(0, 16) : "")
              }
              className="w-full flex items-center justify-center gap-1.5 text-xs font-bold bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition-colors"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {followUpAt ? "Set Follow-up" : "Clear Follow-up"}
            </button>
          </div>

          {/* Linked Booking */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground text-sm">Linked Booking</h3>
              {lead.booking && canManage && !locked && (
                <button
                  onClick={() => patch({ bookingId: null })}
                  disabled={isPending}
                  className="text-[12px] text-muted-foreground hover:text-red-500 transition-colors"
                >
                  Unlink
                </button>
              )}
            </div>

            {lead.booking ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] text-muted-foreground">
                    ...{lead.booking.id.slice(-8)}
                  </span>
                  <span
                    className={cn(
                      "text-[12px] font-bold px-2 py-0.5 rounded-full",
                      BOOKING_STATUS_STYLES[lead.booking.status] ??
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {lead.booking.status}
                  </span>
                </div>
                <p className="text-xs font-semibold text-foreground">{lead.booking.guestName}</p>
                <p className="text-[12px] text-muted-foreground">
                  {fmtDate(lead.booking.travelDate)}
                  {" · "}
                  <span className="font-semibold text-foreground">
                    ₹{lead.booking.amount.toLocaleString("en-IN")}
                  </span>
                </p>
                <Link
                  href={`/admin/bookings/${lead.booking.id}/services`}
                  className="block w-full mt-1 text-center text-xs font-bold bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  Manage Booking Services →
                </Link>
              </div>
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground">
                  {canManage
                    ? "Paste a booking ID to link this lead to a booking."
                    : "Only the assignee can link a booking."}
                </p>
                <input
                  type="text"
                  value={bookingInput}
                  onChange={(e) => setBookingInput(e.target.value)}
                  placeholder="Booking ID..."
                  disabled={!canManage || locked}
                  className="w-full px-3 py-2 text-xs font-mono border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition disabled:opacity-60"
                />
                <button
                  onClick={() => patch({ bookingId: bookingInput.trim() })}
                  disabled={isPending || !bookingInput.trim() || !canManage || locked}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-bold bg-primary hover:bg-primary/90 disabled:opacity-50 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Link Booking
                </button>
              </>
            )}
          </div>

          {/* Lead ID */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Lead ID</p>
            <p className="font-mono text-[12px] text-foreground break-all">{lead.id}</p>
          </div>
        </div>
      </div>

      {showConvert && (
        <ConvertModal
          leadName={lead.name}
          defaultBookingAmount={lead.negotiatedAmount}
          defaultTokenAmount={lead.tokenAmount}
          gstRates={gstRates}
          isPending={isPending}
          onClose={() => setShowConvert(false)}
          onConfirm={handleConvert}
        />
      )}
    </div>
  );
}

function ConvertModal({
  leadName,
  defaultBookingAmount,
  defaultTokenAmount,
  gstRates,
  isPending,
  onClose,
  onConfirm,
}: {
  leadName: string;
  defaultBookingAmount: number | null;
  defaultTokenAmount: number | null;
  gstRates: number[];
  isPending: boolean;
  onClose: () => void;
  onConfirm: (
    bookingAmount: number,
    tokenAmount: number,
    paymentMethod: string,
    gstPercent: number | null,
  ) => void;
}) {
  const [bookingAmount, setBookingAmount] = useState(
    defaultBookingAmount != null ? String(defaultBookingAmount) : "",
  );
  const [tokenAmount, setTokenAmount] = useState(
    defaultTokenAmount != null ? String(defaultTokenAmount) : "",
  );
  // Token is usually paid online, so default the mode to a non-cash method.
  const [paymentMethod, setPaymentMethod] = useState<string>("Online");
  const [gstPercent, setGstPercent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const gstEligible = !isCashMethod(paymentMethod);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const b = parseFloat(bookingAmount);
    const t = parseFloat(tokenAmount);
    if (!b || b <= 0) return setError("Enter a valid booking amount.");
    if (!t || t <= 0) return setError("Enter a valid token amount.");
    if (t >= b) return setError("Token amount must be less than the booking amount.");
    setError(null);
    onConfirm(b, t, paymentMethod, gstEligible && gstPercent ? parseFloat(gstPercent) : null);
  }

  const inputCls =
    "w-full px-3 py-2 text-sm border border-border rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md bg-card rounded-2xl border border-border shadow-xl p-5 space-y-4"
      >
        <div>
          <h3 className="font-display font-bold text-foreground">Convert lead</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Convert <span className="font-semibold text-foreground">{leadName}</span> into a
            booking. This locks the lead and its itinerary.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">
              Booking Amount (₹)
            </span>
            <input
              type="number"
              min={0}
              step={1000}
              value={bookingAmount}
              onChange={(e) => setBookingAmount(e.target.value)}
              placeholder="e.g. 45000"
              className={`${inputCls} mt-1`}
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">
              Token / Advance Amount (₹)
            </span>
            <input
              type="number"
              min={0}
              step={1000}
              value={tokenAmount}
              onChange={(e) => setTokenAmount(e.target.value)}
              placeholder="e.g. 9000"
              className={`${inputCls} mt-1`}
            />
            <span className="text-[12px] text-muted-foreground">
              Recorded as the first payment. Must be less than the booking amount.
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">
                Payment Mode
              </span>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  if (isCashMethod(e.target.value)) setGstPercent("");
                }}
                className={`${inputCls} mt-1`}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide">
                GST
              </span>
              <select
                value={gstPercent}
                onChange={(e) => setGstPercent(e.target.value)}
                disabled={!gstEligible}
                title={gstEligible ? undefined : "GST does not apply to cash payments."}
                className={`${inputCls} mt-1`}
              >
                <option value="">No GST</option>
                {gstRates.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!gstEligible && (
            <p className="text-[12px] text-muted-foreground">
              GST applies to non-cash payments only.
            </p>
          )}
        </div>

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
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Convert &amp; Create Booking
          </button>
        </div>
      </form>
    </div>
  );
}
