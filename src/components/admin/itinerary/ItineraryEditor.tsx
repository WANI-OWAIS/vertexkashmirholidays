"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, QrCode } from "lucide-react";
import { Toolbar } from "./Toolbar";
import { ItineraryCover } from "./ItineraryCover";
import { LeadTripSync, LinkItineraryPanel } from "./LeadTripSync";
import { EditableField } from "./EditableField";
import { ImagePicker } from "./ImagePicker";
import { ItineraryIcon } from "./icons";
import { PDF_CONTACT } from "@/lib/pdf/contact";
import { DEFAULT_ITINERARY_DATA } from "./default-data";
import { downloadItineraryPdf, type TokenPaymentLink } from "@/lib/itinerary/export-pdf";
import type { PdfTrustContent } from "@/lib/itinerary/pdfTrustContent";
import type { PdfSocialLinks } from "@/lib/pdf/contact";
import { applyLeadFactsToItinerary, type LeadItinerarySeed } from "@/lib/itinerary/lead-defaults";
import {
  type ItineraryData,
  type ItineraryStatus,
  type ItineraryDay,
  type ListItem,
  type CancelTier,
  type PriceActivityItem,
  DEFAULT_HOTEL_IMAGES,
  genId,
} from "@/types/itinerary";

type ListKey = "pay";

// Must match MAX_HIGHLIGHTS in ItineraryPdf.tsx — that's what the PDF export
// actually renders/truncates to, so the editor enforces the same cap up
// front rather than silently dropping a 5th+ point only at export time.
const MAX_HIGHLIGHTS = 4;

/** Structured lead data for the two-way trip-detail sync (lead-linked itineraries). */
export interface LeadSyncData {
  leadId: string;
  name: string;
  category: string | null;
  adults: number;
  children: number | null;
  startDate: string; // yyyy-mm-dd or ""
  endDate: string; // yyyy-mm-dd or ""
}

interface ItineraryEditorProps {
  id?: string;
  initialData: ItineraryData;
  initialTitle: string;
  initialStatus: ItineraryStatus;
  canSave?: boolean;
  leadSync?: LeadSyncData;
  /** Website-booking itineraries — total cost is fixed at checkout, show as read-only. */
  lockCost?: boolean;
  /** This itinerary is linked to a direct booking — customer name stays in sync with it. */
  isBookingLinked?: boolean;
  /** Resolved Corporate Office (or Registered Office fallback) — see companyOffice.ts. */
  companyAddress?: string;
  /** Real review-rating + Why Choose Vertex copy for the PDF — see pdfTrustContent.ts. */
  trustContent?: PdfTrustContent;
  /** Real Instagram/Facebook/YouTube URLs (SiteSettings) — makes the PDF's social icons clickable. */
  socialLinks?: PdfSocialLinks;
  /**
   * Save/status-bump endpoint prefix — defaults to the generic staff itinerary
   * API. B2B itineraries (see /admin/b2b-itineraries/[id]/page.tsx) pass
   * "/api/admin/b2b-itineraries" instead, since the generic route's
   * resolveItineraryAccess() is assignee-gated and B2B requests have no
   * assignee concept — nothing else about this component changes.
   */
  apiBasePath?: string;
  /**
   * B2B itineraries have no booking/payment concept yet — suppresses the
   * token-Payment-Link QR mint on export rather than relying on it to fail.
   */
  disableTokenPaymentLink?: boolean;
}

export function ItineraryEditor({
  id,
  initialData,
  initialTitle,
  initialStatus,
  canSave = true,
  leadSync,
  isBookingLinked = false,
  lockCost = false,
  companyAddress,
  trustContent,
  socialLinks,
  apiBasePath = "/api/itineraries",
  disableTokenPaymentLink = false,
}: ItineraryEditorProps) {
  const router = useRouter();
  const [data, setData] = useState<ItineraryData>(initialData);
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState<ItineraryStatus>(initialStatus);
  const [isSaving, setSaving] = useState(false);
  const [isExporting, setExporting] = useState(false);

  /* ---------- cover ---------- */
  const updateCover = (field: keyof ItineraryData, value: string) =>
    setData((p) => ({ ...p, [field]: value }));

  /* ---------- lead trip sync (two-way) ---------- */
  // Recompute the lead-derived cover/duration fields live when trip details change.
  const handleLeadFacts = (facts: LeadItinerarySeed) =>
    setData((p) => applyLeadFactsToItinerary(p, facts));

  /* ---------- info bar ---------- */
  const updateInfo = (id: string, field: "label" | "value", value: string) =>
    setData((p) => ({
      ...p,
      info: p.info.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    }));

  /* ---------- days ---------- */
  const updateDay = (dayId: string, updates: Partial<ItineraryDay>) =>
    setData((p) => ({
      ...p,
      days: p.days.map((d) => (d.id === dayId ? { ...d, ...updates } : d)),
    }));

  const addDay = () =>
    setData((p) => ({
      ...p,
      days: [
        ...p.days,
        {
          id: genId("day"),
          title: "New Day",
          body: "Describe the day's plan…",
          image: "/itinerary/srinagar.webp",
          dateLabel: "",
          meta: [
            { id: genId("m"), label: "Meals", value: "Breakfast" },
            { id: genId("m"), label: "Stay", value: "Srinagar" },
          ],
        },
      ],
    }));

  const removeDay = (dayId: string) =>
    setData((p) => ({ ...p, days: p.days.filter((d) => d.id !== dayId) }));

  const addMeta = (dayId: string) =>
    setData((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.id === dayId
          ? { ...d, meta: [...d.meta, { id: genId("m"), label: "Detail", value: "Value" }] }
          : d,
      ),
    }));

  const updateMeta = (dayId: string, metaId: string, field: "label" | "value", value: string) =>
    setData((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.id === dayId
          ? { ...d, meta: d.meta.map((m) => (m.id === metaId ? { ...m, [field]: value } : m)) }
          : d,
      ),
    }));

  const removeMeta = (dayId: string, metaId: string) =>
    setData((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.id === dayId ? { ...d, meta: d.meta.filter((m) => m.id !== metaId) } : d,
      ),
    }));

  /* ---------- highlights (a meta row's value, comma-joined — same convention
     the PDF export reads via MAX_HIGHLIGHTS in ItineraryPdf.tsx) ---------- */
  const parseHighlights = (value: string) =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const addHighlightPoint = (dayId: string, metaId: string, currentValue: string) => {
    const points = parseHighlights(currentValue);
    if (points.length >= MAX_HIGHLIGHTS) return;
    updateMeta(dayId, metaId, "value", [...points, "New highlight"].join(", "));
  };

  const updateHighlightPoint = (
    dayId: string,
    metaId: string,
    currentValue: string,
    index: number,
    value: string,
  ) => {
    const points = parseHighlights(currentValue);
    points[index] = value;
    updateMeta(dayId, metaId, "value", points.join(", "));
  };

  const removeHighlightPoint = (
    dayId: string,
    metaId: string,
    currentValue: string,
    index: number,
  ) => {
    const points = parseHighlights(currentValue).filter((_, i) => i !== index);
    updateMeta(dayId, metaId, "value", points.join(", "));
  };

  /* ---------- hotels ---------- */
  const updateHotel = (
    hid: string,
    field:
      | "destination"
      | "hotelDetails"
      | "nights"
      | "roomType"
      | "rooms"
      | "mealType"
      | "image"
      | "extraBed"
      | "childWithBed"
      | "hotelAlt"
      | "checkIn"
      | "checkOut",
    value: string,
  ) =>
    setData((p) => ({
      ...p,
      hotels: p.hotels.map((h) => (h.id === hid ? { ...h, [field]: value } : h)),
    }));

  const addHotel = () =>
    setData((p) => ({
      ...p,
      hotels: [
        ...p.hotels,
        {
          id: genId("h"),
          destination: "New Destination (1N)",
          hotelDetails: "Hotel name",
          hotelAlt: "or similar category",
          checkIn: "",
          checkOut: "",
          nights: "1",
          roomType: "Double Sharing",
          rooms: "1",
          mealType: "MAP",
          image: DEFAULT_HOTEL_IMAGES[0],
          extraBed: "0",
          childWithBed: "0",
        },
      ],
    }));

  const removeHotel = (hid: string) =>
    setData((p) => ({ ...p, hotels: p.hotels.filter((h) => h.id !== hid) }));

  /* ---------- activities ---------- */
  const updateActivity = (
    aid: string,
    field: "name" | "place" | "time" | "image" | "day",
    value: string,
  ) =>
    setData((p) => ({
      ...p,
      activities: p.activities.map((a) => (a.id === aid ? { ...a, [field]: value } : a)),
    }));

  // Always available regardless of current count — an itinerary can go down
  // to zero activities (section just disappears from the PDF) and still add
  // more afterward.
  const addActivity = () =>
    setData((p) => ({
      ...p,
      activities: [
        ...p.activities,
        {
          id: genId("act"),
          name: "New Activity",
          place: "Destination",
          time: "Duration",
          image: "/itinerary/shikara.webp",
          day: "",
        },
      ],
    }));

  const removeActivity = (aid: string) =>
    setData((p) => ({ ...p, activities: p.activities.filter((a) => a.id !== aid) }));

  /* ---------- optional activities / local taxis (shared priceActivitySchema) ---------- */
  const updatePriceActivity = (
    key: "optionalActivities" | "localTaxis",
    id: string,
    field: "name" | "place" | "day" | "note" | "price",
    value: string,
  ) =>
    setData((p) => ({
      ...p,
      [key]: p[key].map((a) => (a.id === id ? { ...a, [field]: value } : a)),
    }));

  const addPriceActivity = (key: "optionalActivities" | "localTaxis") =>
    setData((p) => ({
      ...p,
      [key]: [
        ...p[key],
        { id: genId("pa"), name: "New Item", place: "", day: "", note: "", price: "" },
      ],
    }));

  const removePriceActivity = (key: "optionalActivities" | "localTaxis", id: string) =>
    setData((p) => ({ ...p, [key]: p[key].filter((a) => a.id !== id) }));

  /* ---------- trust ---------- */
  const updateTrust = (tid: string, field: "title" | "subtitle", value: string) =>
    setData((p) => ({
      ...p,
      trust: p.trust.map((t) => (t.id === tid ? { ...t, [field]: value } : t)),
    }));

  /* ---------- why choose vertex ---------- */
  const updateWhyChoose = (wid: string, field: "title" | "subtitle", value: string) =>
    setData((p) => ({
      ...p,
      whyChoose: p.whyChoose.map((w) => (w.id === wid ? { ...w, [field]: value } : w)),
    }));

  /* ---------- pay tags (plain string[]) ---------- */
  const addListItem = (key: ListKey, item: string) =>
    setData((p) => ({ ...p, [key]: [...p[key], item] }));
  const updateListItem = (key: ListKey, idx: number, value: string) =>
    setData((p) => ({ ...p, [key]: p[key].map((v, i) => (i === idx ? value : v)) }));
  const removeListItem = (key: ListKey, idx: number) =>
    setData((p) => ({ ...p, [key]: p[key].filter((_, i) => i !== idx) }));

  /* ---------- inclusions/exclusions (category + text rows) ---------- */
  const addListItemRow = (key: "inc" | "exc") =>
    setData((p) => ({ ...p, [key]: [...p[key], { id: genId("li"), category: "", text: "" }] }));
  const updateListItemRow = (
    key: "inc" | "exc",
    id: string,
    field: "category" | "text",
    value: string,
  ) =>
    setData((p) => ({
      ...p,
      [key]: p[key].map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    }));
  const removeListItemRow = (key: "inc" | "exc", id: string) =>
    setData((p) => ({ ...p, [key]: p[key].filter((v) => v.id !== id) }));

  /* ---------- cancellation tiers (label + charge rows) ---------- */
  const addCancelTier = () =>
    setData((p) => ({ ...p, cancel: [...p.cancel, { id: genId("ct"), label: "", charge: "" }] }));
  const updateCancelTier = (id: string, field: "label" | "charge", value: string) =>
    setData((p) => ({
      ...p,
      cancel: p.cancel.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    }));
  const removeCancelTier = (id: string) =>
    setData((p) => ({ ...p, cancel: p.cancel.filter((v) => v.id !== id) }));

  /* ---------- actions ---------- */
  async function handleSave() {
    if (!title.trim()) {
      toast.error("Please enter an itinerary title.");
      return;
    }
    setSaving(true);
    try {
      const payload = { title: title.trim(), status, data };
      const res = await fetch(id ? `${apiBasePath}/${id}` : apiBasePath, {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success("Itinerary saved.");
      if (!id && json.id) {
        router.replace(`/admin/itinerary/${json.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      // Resolve (reuse or mint) this itinerary's token Payment Link first —
      // needs a saved itinerary id. An unsaved draft simply exports without a
      // QR (see downloadItineraryPdf) rather than blocking export.
      let tokenPaymentLink: TokenPaymentLink | undefined;
      if (id && !disableTokenPaymentLink) {
        try {
          const res = await fetch(`${apiBasePath}/${id}/token-payment-link`, { method: "POST" });
          const json = await res.json().catch(() => ({}));
          if (res.ok) {
            tokenPaymentLink = { shortUrl: json.shortUrl, amountRupees: json.amountRupees };
          } else {
            toast.warning(json.error ?? "Could not generate the payment QR — exporting without it.");
          }
        } catch {
          toast.warning("Could not generate the payment QR — exporting without it.");
        }
      }

      const { bytes } = await downloadItineraryPdf(
        data,
        companyAddress,
        tokenPaymentLink,
        trustContent,
        socialLinks,
      );
      const kb = Math.round(bytes / 1024);
      if (bytes > 1024 * 1024) {
        toast.warning(
          `PDF generated (${(bytes / 1048576).toFixed(2)} MB) — above the 1 MB target.`,
        );
      } else {
        toast.success(`PDF downloaded (${kb} KB).`);
      }
      // Downloading the PDF means it's being shared with the customer — bump a
      // still-draft itinerary out of DRAFT so it becomes visible in their
      // account (DRAFT is hidden there — see itineraryVisible in
      // account/bookings/[id]/page.tsx). Never downgrades an already
      // SENT/CONFIRMED itinerary.
      if (id && status === "DRAFT") {
        const res = await fetch(`${apiBasePath}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "SENT" }),
        });
        if (res.ok) {
          setStatus("SENT");
          router.refresh();
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF export failed");
    } finally {
      setExporting(false);
    }
  }

  function handleReset() {
    if (confirm("Reset all content to the default itinerary? Unsaved changes will be lost.")) {
      setData(DEFAULT_ITINERARY_DATA);
    }
  }

  const greenHead = "font-serif text-2xl font-bold text-[hsl(156_40%_21%)] dark:text-primary";
  const pageCard =
    "page rounded-xl border border-[hsl(40_14%_87%)] bg-white p-5 shadow-page dark:border-mute/20 dark:bg-card sm:p-8 md:p-12";
  const addBtn =
    "addbtn mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[hsl(156_40%_21%)]/40 px-3 py-1.5 text-xs font-bold text-[hsl(156_40%_21%)] transition hover:bg-[hsl(150_28%_92%)]/60 dark:border-primary/40 dark:text-primary dark:hover:bg-primary/10 no-print";
  const fieldLabel =
    "block text-[11px] font-semibold uppercase tracking-wide text-mute dark:text-muted-foreground mb-1";
  const numberInputCls =
    "w-full rounded-md border border-[hsl(40_14%_87%)] bg-transparent px-2 py-1 text-sm outline-none transition-all focus:bg-muted/30 focus:ring-1 focus:ring-primary/30 dark:border-mute/20 print:border-none print:bg-transparent print:p-0 print:focus:ring-0";
  const iconChipCls =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(150_28%_92%)] text-[hsl(156_40%_21%)] dark:bg-primary/15 dark:text-primary";

  return (
    <div className="pb-8">
      <Toolbar
        title={title}
        onTitleChange={setTitle}
        status={status}
        onStatusChange={setStatus}
        onSave={handleSave}
        onExport={handleExport}
        onReset={handleReset}
        isSaving={isSaving}
        isExporting={isExporting}
        canSave={canSave}
      />

      <div className="px-3 py-7 sm:px-5">
        <div className="mx-auto max-w-[920px] space-y-8">
          {/* Lead trip-detail sync (lead-linked itineraries) — or, for a
              standalone itinerary that hasn't been linked to anything yet,
              a panel to attach it to an existing lead/booking. */}
          {canSave &&
            (leadSync ? (
              <LeadTripSync leadId={leadSync.leadId} initial={leadSync} onFacts={handleLeadFacts} />
            ) : (
              !isBookingLinked && id && <LinkItineraryPanel itineraryId={id} />
            ))}

          {/* Cover */}
          <ItineraryCover
            data={data}
            onUpdate={(field, value) => updateCover(field, value)}
            onImageChange={(src) => updateCover("coverImage", src)}
            readOnlyDerived={!!leadSync}
            nameLocked={leadSync ? "lead" : isBookingLinked ? "booking" : null}
            lockCost={lockCost}
          />

          {/* Destinations + Daily Itinerary */}
          <article className={pageCard}>
            {/* Destinations gets its own full-width card, then every other
                info[] row wraps as its own small card below — same two-row
                shape as the PDF (not one shared strip that a longer
                destinations list or an older itinerary's extra info rows
                could overflow). */}
            <div className="rounded-xl bg-[#F4F8F6] p-4 dark:bg-muted/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7C73] dark:text-muted-foreground">
                Destinations
              </p>
              <EditableField
                value={data.destinations}
                onValueChange={(v) => updateCover("destinations", v)}
                className="mt-1 text-lg font-bold text-[#0F2A1E] dark:text-primary"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              {data.info.map((it) => (
                <div
                  key={it.id}
                  className="min-w-[140px] flex-1 rounded-xl bg-[#F4F8F6] p-4 dark:bg-muted/20"
                >
                  <EditableField
                    value={it.label}
                    onValueChange={(v) => updateInfo(it.id, "label", v)}
                    className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7C73] dark:text-muted-foreground"
                  />
                  <EditableField
                    value={it.value}
                    onValueChange={(v) => updateInfo(it.id, "value", v)}
                    className="mt-1 text-sm font-bold text-[#0F2A1E] dark:text-foreground"
                  />
                </div>
              ))}
            </div>

            <div className="mt-10 flex items-center gap-4">
              <h2 className={greenHead}>Daily Itinerary</h2>
              <span className="h-px flex-1 bg-[hsl(40_14%_87%)] dark:bg-mute/20" />
            </div>

            <div className="mt-7 space-y-4">
              {data.days.map((day, dayIdx) => (
                <div
                  key={day.id}
                  className="dayitem group relative flex flex-col rounded-xl border border-[#DCE7E0] dark:border-mute/20 sm:flex-row sm:items-stretch"
                >
                  <button
                    onClick={() => removeDay(day.id)}
                    aria-label={`Remove day ${dayIdx + 1}`}
                    className="absolute -left-2 -top-2 z-20 hidden h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 no-print"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>

                  {/* Content — matches the PDF's day card: big light numeral +
                      title + date on one line, description, highlight pills,
                      then a meals/stay icon row. No colored header bar or
                      boxed highlights panel anymore — same plain card the
                      PDF now uses. */}
                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex items-baseline gap-3">
                      <div className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="shrink-0 font-serif text-2xl font-bold text-[#B8D4C4]">
                          {String(dayIdx + 1).padStart(2, "0")}
                        </span>
                        <EditableField
                          value={day.title}
                          onValueChange={(v) => updateDay(day.id, { title: v })}
                          className="min-w-0 flex-1 font-serif text-base font-bold text-[#0F2A1E] dark:text-foreground"
                        />
                      </div>
                      <EditableField
                        value={day.dateLabel}
                        onValueChange={(v) => updateDay(day.id, { dateLabel: v })}
                        placeholder="Wed 10 Jun"
                        className="w-24 shrink-0 text-right text-xs text-[#6B7C73] dark:text-muted-foreground"
                      />
                    </div>
                    <EditableField
                      value={day.body}
                      onValueChange={(v) => updateDay(day.id, { body: v })}
                      className="mt-2 block text-sm leading-relaxed text-[#3D4F45] dark:text-muted-foreground"
                      rows={3}
                    />

                    {day.meta
                      .filter((m) => m.label.trim().toLowerCase() === "highlights")
                      .map((m) => {
                        const highlightPoints = parseHighlights(m.value);
                        return (
                          <div key={m.id} className="mt-3 flex flex-wrap items-center gap-2">
                            {highlightPoints.map((point, i) => (
                              <span key={i} className="group/hl relative">
                                <EditableField
                                  value={point}
                                  onValueChange={(v) =>
                                    updateHighlightPoint(day.id, m.id, m.value, i, v)
                                  }
                                  className="rounded-full bg-[#E8F2EB] px-3 py-1 text-xs text-[#145C3E] dark:bg-primary/10 dark:text-primary"
                                />
                                <button
                                  onClick={() => removeHighlightPoint(day.id, m.id, m.value, i)}
                                  aria-label="Remove highlight"
                                  className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white group-hover/hl:flex no-print"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {highlightPoints.length < MAX_HIGHLIGHTS && (
                              <button
                                onClick={() => addHighlightPoint(day.id, m.id, m.value)}
                                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#145C3E]/40 px-2.5 py-1 text-[11px] font-bold text-[#145C3E] dark:border-primary/40 dark:text-primary no-print"
                              >
                                <Plus className="h-2.5 w-2.5" /> point
                              </button>
                            )}
                          </div>
                        );
                      })}

                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#EDF3EF] pt-3 dark:border-mute/20">
                      {day.meta
                        .filter((m) => m.label.trim().toLowerCase() !== "highlights")
                        .map((m) => (
                          <div key={m.id} className="metaitem group/m relative flex items-center gap-1.5">
                            <button
                              onClick={() => removeMeta(day.id, m.id)}
                              className="absolute -left-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white text-xs group-hover/m:flex no-print"
                            >
                              ×
                            </button>
                            <ItineraryIcon
                              icon={m.label.trim().toLowerCase()}
                              className="h-3.5 w-3.5 shrink-0 text-[#145C3E] dark:text-primary"
                            />
                            <EditableField
                              value={m.label}
                              onValueChange={(v) => updateMeta(day.id, m.id, "label", v)}
                              className="w-14 text-[11px] text-[#6B7C73] dark:text-muted-foreground"
                            />
                            <EditableField
                              value={m.value}
                              onValueChange={(v) => updateMeta(day.id, m.id, "value", v)}
                              className="w-auto min-w-[80px] text-xs text-[#0F2A1E] dark:text-foreground"
                            />
                          </div>
                        ))}
                      <button
                        onClick={() => addMeta(day.id)}
                        className="addbtn inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#145C3E]/40 px-2.5 py-1 text-[12px] font-bold text-[#145C3E] transition hover:bg-[#E8F2EB] dark:border-primary/40 dark:text-primary dark:hover:bg-primary/10 no-print"
                      >
                        <Plus className="h-3 w-3" /> detail
                      </button>
                    </div>
                  </div>

                  <div className="relative h-[200px] shrink-0 overflow-hidden rounded-b-xl sm:h-auto sm:w-[150px] sm:rounded-bl-none sm:rounded-r-xl">
                    <ImagePicker
                      value={day.image}
                      onChange={(src) => updateDay(day.id, { image: src })}
                      className="absolute right-2 top-2 z-10"
                      label="Replace"
                    />
                    {/* `absolute inset-0` (not a percentage height on an
                        in-flow child) is what actually makes this match the
                        content column's height exactly — a plain height:100%
                        img is spec'd to resolve as "auto" against a
                        stretched-but-not-explicitly-sized flex item in most
                        browsers, which is what was making this taller than
                        the content. Absolute positioning resolves against
                        the parent's final computed box instead, which is
                        unambiguous. The overflow-hidden + rounded corners
                        live on THIS wrapper (not the outer card) so they
                        don't clip the day's floating remove button, which
                        deliberately sits outside the card's edge. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={day.image}
                      alt={day.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addDay}
              className="addbtn mt-7 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[hsl(156_40%_21%)]/40 px-4 py-2 text-sm font-bold text-[hsl(156_40%_21%)] transition hover:bg-[hsl(150_28%_92%)]/60 dark:border-primary/40 dark:text-primary dark:hover:bg-primary/10 no-print"
            >
              <Plus className="h-4 w-4" /> Add Day
            </button>

            <Footer />
          </article>

          {/* Accommodation */}
          <article className={pageCard}>
            <div className="flex items-center gap-4">
              <h2 className={greenHead}>Accommodation Info</h2>
              <span className="h-px flex-1 bg-[hsl(40_14%_87%)] dark:bg-mute/20" />
            </div>

            <div className="mt-6 space-y-5">
              {data.hotels.map((h, idx) => (
                <div
                  key={h.id}
                  className="group/hotel relative flex flex-col rounded-xl border border-[hsl(40_14%_87%)] dark:border-mute/20 sm:flex-row sm:items-stretch"
                >
                  <button
                    onClick={() => removeHotel(h.id)}
                    aria-label={`Remove hotel row ${idx + 1}`}
                    className="absolute -left-2 -top-2 z-20 hidden h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 transition-opacity group-hover/hotel:flex group-hover/hotel:opacity-100 no-print"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>

                  {/* Content — 60% */}
                  <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:w-[60%] sm:flex-none">
                    <div>
                      <label className={fieldLabel}>Hotel Name</label>
                      <EditableField
                        value={h.hotelDetails}
                        onValueChange={(v) => updateHotel(h.id, "hotelDetails", v)}
                        className="font-semibold"
                      />
                      <EditableField
                        value={h.hotelAlt}
                        onValueChange={(v) => updateHotel(h.id, "hotelAlt", v)}
                        placeholder="or similar category"
                        className="mt-0.5 text-xs text-mute dark:text-muted-foreground"
                      />
                    </div>
                    <div>
                      <label className={fieldLabel}>Location</label>
                      <EditableField
                        value={h.destination}
                        onValueChange={(v) => updateHotel(h.id, "destination", v)}
                      />
                    </div>

                    {/* Check In / Check Out / Nights / No. of Rooms / Room Type / Extra Bed / Child With Bed / Meal Type */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[hsl(40_14%_87%)] pt-3 dark:border-mute/20">
                      <div>
                        <label className={fieldLabel}>Check In</label>
                        <EditableField
                          value={h.checkIn}
                          onValueChange={(v) => updateHotel(h.id, "checkIn", v)}
                          placeholder="Wed 10 Jun"
                        />
                      </div>
                      <div>
                        <label className={fieldLabel}>Check Out</label>
                        <EditableField
                          value={h.checkOut}
                          onValueChange={(v) => updateHotel(h.id, "checkOut", v)}
                          placeholder="Sat 13 Jun"
                        />
                      </div>
                      <div className="flex items-start gap-2">
                        <span className={iconChipCls}>
                          <ItineraryIcon icon="calendar" className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <label className={fieldLabel}>Nights</label>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={h.nights}
                            onChange={(e) => updateHotel(h.id, "nights", e.target.value)}
                            onBlur={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (!e.target.value.trim() || Number.isNaN(n) || n < 1) {
                                updateHotel(h.id, "nights", "1");
                              }
                            }}
                            className={numberInputCls}
                          />
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className={iconChipCls}>
                          <ItineraryIcon icon="home" className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <label className={fieldLabel}>No. of Rooms</label>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={h.rooms}
                            onChange={(e) => updateHotel(h.id, "rooms", e.target.value)}
                            onBlur={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (!e.target.value.trim() || Number.isNaN(n) || n < 1) {
                                updateHotel(h.id, "rooms", "1");
                              }
                            }}
                            className={numberInputCls}
                          />
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className={iconChipCls}>
                          <ItineraryIcon icon="stay" className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <label className={fieldLabel}>Room Type</label>
                          <EditableField
                            value={h.roomType}
                            onValueChange={(v) => updateHotel(h.id, "roomType", v)}
                          />
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className={iconChipCls}>
                          <ItineraryIcon icon="stay" className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <label className={fieldLabel}>Extra Bed</label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={h.extraBed}
                            onChange={(e) => updateHotel(h.id, "extraBed", e.target.value)}
                            onBlur={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (!e.target.value.trim() || Number.isNaN(n) || n < 0) {
                                updateHotel(h.id, "extraBed", "0");
                              }
                            }}
                            className={numberInputCls}
                          />
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className={iconChipCls}>
                          <ItineraryIcon icon="users" className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <label className={fieldLabel}>Child With Bed</label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={h.childWithBed}
                            onChange={(e) => updateHotel(h.id, "childWithBed", e.target.value)}
                            onBlur={(e) => {
                              const n = parseInt(e.target.value, 10);
                              if (!e.target.value.trim() || Number.isNaN(n) || n < 0) {
                                updateHotel(h.id, "childWithBed", "0");
                              }
                            }}
                            className={numberInputCls}
                          />
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className={iconChipCls}>
                          <ItineraryIcon icon="meals" className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <label className={fieldLabel}>Meal Type</label>
                          <EditableField
                            value={h.mealType}
                            onValueChange={(v) => updateHotel(h.id, "mealType", v)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Image — 40%. `absolute inset-0` (not a percentage
                      height on an in-flow child) is what actually matches
                      this to the content column's height — same reasoning
                      as the day card's image above. overflow-hidden +
                      rounded corners live on this wrapper, not the outer
                      card, so they don't clip the floating remove button. */}
                  <div className="relative h-[200px] shrink-0 overflow-hidden rounded-b-xl sm:h-auto sm:w-[40%] sm:rounded-bl-none sm:rounded-r-xl">
                    <ImagePicker
                      value={h.image}
                      onChange={(src) => updateHotel(h.id, "image", src)}
                      className="absolute right-2 top-2 z-10"
                      label="Replace"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={h.image}
                      alt={h.hotelDetails}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button onClick={addHotel} className={addBtn}>
              <Plus className="h-3 w-3" /> Add Hotel
            </button>
            <p className="mt-3 text-[12px] italic text-mute dark:text-muted-foreground">
              *All accommodations are subject to availability at the time of confirmation.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-y-6 rounded-2xl bg-[hsl(40_33%_96%)] px-3 py-6 dark:bg-muted/20 sm:grid-cols-4 sm:px-7">
              {data.trust.map((t, i) => (
                <div
                  key={t.id}
                  className={`flex flex-col items-center px-2 text-center sm:px-3 ${i ? "sm:border-l sm:border-[hsl(40_14%_87%)] dark:sm:border-mute/20" : ""}`}
                >
                  <ItineraryIcon
                    icon={t.icon}
                    className="h-6 w-6 text-[hsl(156_40%_21%)] dark:text-primary"
                  />
                  <EditableField
                    value={t.title}
                    onValueChange={(v) => updateTrust(t.id, "title", v)}
                    className="mt-2 text-center text-xs font-bold"
                  />
                  <EditableField
                    value={t.subtitle}
                    onValueChange={(v) => updateTrust(t.id, "subtitle", v)}
                    className="text-center text-[12px] leading-snug text-mute dark:text-muted-foreground"
                  />
                </div>
              ))}
            </div>

            {/* Included Activities — free add/remove list (unlike Trust
               above, which is a fixed 4). Renders right after the Trust
               strip in the PDF too (before Transportation Info) — omitted
               there entirely once this list is empty, but "Add Activity"
               stays available regardless. */}
            <div className="mt-8">
              <div className="flex items-center gap-4">
                <h3 className="font-serif text-xl font-bold text-[hsl(156_40%_21%)] dark:text-primary">
                  Included Activities
                </h3>
                <span className="h-px flex-1 bg-[hsl(40_14%_87%)] dark:bg-mute/20" />
              </div>
              <div className="mt-4 space-y-3">
                {data.activities.map((a, idx) => (
                  <div
                    key={a.id}
                    className="group flex items-center gap-4 rounded-xl border border-[hsl(40_14%_87%)] p-3 dark:border-mute/20"
                  >
                    <div className="relative w-2/5 shrink-0">
                      <ImagePicker
                        value={a.image}
                        onChange={(src) => updateActivity(a.id, "image", src)}
                        className="absolute -top-1.5 -right-1.5 z-10"
                        label="Replace"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.image || "/itinerary/hero.webp"}
                        alt={a.name}
                        className="h-[130px] w-full rounded-lg object-cover shadow-soft"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <EditableField
                        value={a.name}
                        onValueChange={(v) => updateActivity(a.id, "name", v)}
                        className="text-sm font-bold"
                      />
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-mute dark:text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <ItineraryIcon icon="map-pin" className="h-3.5 w-3.5" />
                          <EditableField
                            value={a.place}
                            onValueChange={(v) => updateActivity(a.id, "place", v)}
                          />
                        </span>
                        <span className="flex items-center gap-1">
                          <ItineraryIcon icon="clock" className="h-3.5 w-3.5" />
                          <EditableField
                            value={a.time}
                            onValueChange={(v) => updateActivity(a.id, "time", v)}
                          />
                        </span>
                        <span className="flex items-center gap-1">
                          <ItineraryIcon icon="calendar" className="h-3.5 w-3.5" />
                          <EditableField
                            value={a.day}
                            onValueChange={(v) => updateActivity(a.id, "day", v)}
                            placeholder="Day 05"
                          />
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeActivity(a.id)}
                      aria-label={`Remove activity ${idx + 1}`}
                      className="shrink-0 text-rose-500 opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100 no-print"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addActivity} className={`${addBtn} mt-3`}>
                <Plus className="h-3 w-3" /> Add Activity
              </button>
            </div>

            {/* "Available on the day" — paid-locally activities, not part of
                the package. Same add/remove-to-zero shape as Included
                Activities above, minus the photo. */}
            <PriceActivitySection
              title="Available on the Day"
              items={data.optionalActivities}
              onUpdate={(id, field, v) => updatePriceActivity("optionalActivities", id, field, v)}
              onRemove={(id) => removePriceActivity("optionalActivities", id)}
              onAdd={() => addPriceActivity("optionalActivities")}
              addLabel="Add Activity"
            />

            <Footer />
          </article>

          {/* Transport + Inclusions/Exclusions */}
          <article className={pageCard}>
            <div className="flex items-center gap-4">
              <h2 className={greenHead}>Transportation Info</h2>
              <span className="h-px flex-1 bg-[hsl(40_14%_87%)] dark:bg-mute/20" />
            </div>
            <div className="mt-6 grid items-center gap-6 sm:grid-cols-[1fr_1.1fr]">
              <div className="flex items-start gap-4">
                <ItineraryIcon
                  icon="car"
                  className="mt-1 h-9 w-9 shrink-0 text-[hsl(156_40%_21%)] dark:text-primary"
                />
                <div className="min-w-0">
                  <EditableField
                    value={data.transportType}
                    onValueChange={(v) => updateCover("transportType", v)}
                    className="text-base font-bold"
                  />
                  <EditableField
                    value={data.transportDesc}
                    onValueChange={(v) => updateCover("transportDesc", v)}
                    className="mt-1 text-sm text-mute dark:text-muted-foreground"
                  />
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-mute dark:text-muted-foreground">
                    <EditableField
                      value={data.transportSeats}
                      onValueChange={(v) => updateCover("transportSeats", v)}
                      placeholder="4 seats"
                    />
                    <EditableField
                      value={data.transportBags}
                      onValueChange={(v) => updateCover("transportBags", v)}
                      placeholder="2 large bags"
                    />
                    <EditableField
                      value={data.transportDays}
                      onValueChange={(v) => updateCover("transportDays", v)}
                      placeholder="Day 01 – 06"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {data.transportTags.map((tag, idx) => (
                      <span key={idx} className="group/tag relative">
                        <EditableField
                          value={tag}
                          onValueChange={(v) =>
                            setData((p) => ({
                              ...p,
                              transportTags: p.transportTags.map((t, i) => (i === idx ? v : t)),
                            }))
                          }
                          className="rounded-full bg-[hsl(150_28%_92%)] px-3 py-1 text-[11px] font-bold text-[hsl(156_40%_21%)] dark:bg-primary/10 dark:text-primary"
                        />
                        <button
                          onClick={() =>
                            setData((p) => ({
                              ...p,
                              transportTags: p.transportTags.filter((_, i) => i !== idx),
                            }))
                          }
                          aria-label={`Remove tag ${tag}`}
                          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white group-hover/tag:flex no-print"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() =>
                        setData((p) => ({ ...p, transportTags: [...p.transportTags, "New tag"] }))
                      }
                      className="addbtn inline-flex items-center gap-1 rounded-full border border-dashed border-[hsl(156_40%_21%)]/40 px-2.5 py-1 text-[11px] font-bold text-[hsl(156_40%_21%)] dark:border-primary/40 dark:text-primary no-print"
                    >
                      <Plus className="h-2.5 w-2.5" /> tag
                    </button>
                  </div>
                </div>
              </div>
              <div className="relative">
                <ImagePicker
                  value={data.transportImage}
                  onChange={(src) => updateCover("transportImage", src)}
                  className="absolute right-2 top-2 z-10"
                  label="Replace"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.transportImage}
                  alt="Vehicle"
                  className="h-[170px] w-full rounded-xl object-cover shadow-soft"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Inclusions/Exclusions — separate full-width row sections
                rather than side-by-side columns, so each reads as its own
                section like every other block on the page. */}
            <div className="mt-11 space-y-10">
              <ListColumn
                title="Package Inclusions"
                items={data.inc}
                tone="inc"
                onUpdateCategory={(id, v) => updateListItemRow("inc", id, "category", v)}
                onUpdateText={(id, v) => updateListItemRow("inc", id, "text", v)}
                onRemove={(id) => removeListItemRow("inc", id)}
                onAdd={() => addListItemRow("inc")}
                addLabel="Add inclusion"
              />
              <ListColumn
                title="Package Exclusions"
                items={data.exc}
                tone="exc"
                onUpdateCategory={(id, v) => updateListItemRow("exc", id, "category", v)}
                onUpdateText={(id, v) => updateListItemRow("exc", id, "text", v)}
                onRemove={(id) => removeListItemRow("exc", id)}
                onAdd={() => addListItemRow("exc")}
                addLabel="Add exclusion"
              />
            </div>

            <Footer />
          </article>

          {/* Payment & Cancellation — Payment card full width (3 columns
              inside: step 1 | step 2 | tags+note, divided by vertical
              rules), then the Cancellation card full width below it — same
              stacked shape as the PDF, not two side-by-side cards. */}
          <article className={pageCard}>
            <h2 className="font-serif text-3xl font-bold text-[hsl(156_40%_21%)] dark:text-primary">
              Payment &amp; Cancellation
            </h2>

            <div className="mt-8 rounded-2xl border border-[hsl(40_14%_87%)] bg-white p-6 shadow-soft dark:border-mute/20 dark:bg-card">
              <h3 className="text-base font-bold">How payment works</h3>
              <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-stretch">
                <div className="sm:min-w-0 sm:flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#145C3E] text-[10px] font-bold text-white">
                      1
                    </span>
                    <EditableField
                      value={data.payStep1Title}
                      onValueChange={(v) => updateCover("payStep1Title", v)}
                      className="min-w-0 flex-1 text-sm font-bold"
                    />
                  </div>
                  <EditableField
                    value={data.payStep1Desc}
                    onValueChange={(v) => updateCover("payStep1Desc", v)}
                    className="ml-7 mt-1 text-xs text-mute dark:text-muted-foreground"
                  />
                </div>

                <div className="hidden w-px shrink-0 bg-[hsl(40_14%_87%)] dark:bg-mute/20 sm:block" />

                <div className="sm:min-w-0 sm:flex-1">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B8D4C4] text-[10px] font-bold text-[#0F3A28]">
                      2
                    </span>
                    <EditableField
                      value={data.payStep2Title}
                      onValueChange={(v) => updateCover("payStep2Title", v)}
                      className="min-w-0 flex-1 text-sm font-bold"
                    />
                  </div>
                  <EditableField
                    value={data.payStep2Desc}
                    onValueChange={(v) => updateCover("payStep2Desc", v)}
                    className="ml-7 mt-1 text-xs text-mute dark:text-muted-foreground"
                  />
                </div>

                <div className="hidden w-px shrink-0 bg-[hsl(40_14%_87%)] dark:bg-mute/20 sm:block" />

                <div className="sm:min-w-0 sm:flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {data.pay.map((tag, idx) => (
                      <span key={idx} className="group/tag relative">
                        <EditableField
                          value={tag}
                          onValueChange={(v) => updateListItem("pay", idx, v)}
                          className="rounded-full bg-[hsl(150_28%_92%)] px-3 py-1 text-[11px] font-bold text-[hsl(156_40%_21%)] dark:bg-primary/10 dark:text-primary"
                        />
                        <button
                          onClick={() => removeListItem("pay", idx)}
                          aria-label={`Remove tag ${tag}`}
                          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white group-hover/tag:flex no-print"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => addListItem("pay", "New tag")}
                      className="addbtn inline-flex items-center gap-1 rounded-full border border-dashed border-[hsl(156_40%_21%)]/40 px-2.5 py-1 text-[11px] font-bold text-[hsl(156_40%_21%)] dark:border-primary/40 dark:text-primary no-print"
                    >
                      <Plus className="h-2.5 w-2.5" /> tag
                    </button>
                  </div>
                  <EditableField
                    value={data.payNote}
                    onValueChange={(v) => updateCover("payNote", v)}
                    className="mt-2 text-[11px] italic text-mute dark:text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6">
              <CancelTierCard
                items={data.cancel}
                onUpdate={updateCancelTier}
                onRemove={removeCancelTier}
                onAdd={addCancelTier}
              />
              {/* Cancellation footnotes — small add/remove text list, same
                  pattern as the pay tags above. */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {data.cancelNotes.map((note, idx) => (
                  <span key={idx} className="group/note relative">
                    <EditableField
                      value={note}
                      onValueChange={(v) =>
                        setData((p) => ({
                          ...p,
                          cancelNotes: p.cancelNotes.map((n, i) => (i === idx ? v : n)),
                        }))
                      }
                      className="rounded-full border border-[hsl(40_14%_87%)] px-3 py-1 text-[11px] text-mute dark:border-mute/20 dark:text-muted-foreground"
                    />
                    <button
                      onClick={() =>
                        setData((p) => ({
                          ...p,
                          cancelNotes: p.cancelNotes.filter((_, i) => i !== idx),
                        }))
                      }
                      aria-label={`Remove note ${note}`}
                      className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white group-hover/note:flex no-print"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  onClick={() =>
                    setData((p) => ({ ...p, cancelNotes: [...p.cancelNotes, "New note"] }))
                  }
                  className="addbtn inline-flex items-center gap-1 rounded-full border border-dashed border-[hsl(156_40%_21%)]/40 px-2.5 py-1 text-[11px] font-bold text-[hsl(156_40%_21%)] dark:border-primary/40 dark:text-primary no-print"
                >
                  <Plus className="h-2.5 w-2.5" /> note
                </button>
              </div>
            </div>
            <Footer />
          </article>

          {/* Why Choose Vertex — editable like Trust above (title/subtitle
             per item); icon is fixed per item (assigned when seeded from
             real WhyChooseItem data), same as Trust's icons aren't
             user-pickable either. Intro line is fixed approved copy, matching
             ItineraryPdf.tsx (not per-itinerary editable). */}
          <article className={pageCard}>
            <h2 className="font-serif text-3xl font-bold text-[hsl(156_40%_21%)] dark:text-primary">
              Why Choose Vertex
            </h2>
            <p className="mt-3 text-sm italic text-mute dark:text-muted-foreground">
              From carefully planned itineraries to reliable local support, we handle the details so
              you can enjoy Kashmir with confidence.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {data.whyChoose.map((w) => (
                <div
                  key={w.id}
                  className="flex gap-3 rounded-xl border border-[hsl(40_14%_87%)] p-4 dark:border-mute/20"
                >
                  <ItineraryIcon
                    icon={w.icon}
                    className="h-6 w-6 shrink-0 text-[hsl(156_40%_21%)] dark:text-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <EditableField
                      value={w.title}
                      onValueChange={(v) => updateWhyChoose(w.id, "title", v)}
                      className="text-sm font-bold"
                    />
                    <EditableField
                      value={w.subtitle}
                      onValueChange={(v) => updateWhyChoose(w.id, "subtitle", v)}
                      className="mt-1 text-[12px] leading-snug text-mute dark:text-muted-foreground"
                    />
                  </div>
                </div>
              ))}
            </div>
            <Footer />
          </article>

          {/* Thank you */}
          <article className="page overflow-hidden rounded-xl border border-[hsl(40_14%_87%)] bg-white shadow-page dark:border-mute/20 dark:bg-card">
            {/* Payment Options — renders above the Thank You block on the PDF's
               closing page (see ItineraryPdf.tsx). This panel depicts the
               PDF's own fixed dark-green brand page — not the admin app's
               light/dark theme — so its background is a literal color, not
               dark:bg-primary (which resolves to gold in this app's dark
               theme and made the panel look like a mismatched grey/tan
               block instead of matching the Thank You panel below it). */}
            <div className="bg-[hsl(158_46%_14%)] p-6 sm:p-8">
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(146_35%_55%)]">
                Payment Options
              </p>
              <div className="mx-auto mt-2 h-[1.5px] w-10 bg-[hsl(146_35%_55%)]" />
              <div className="mt-6 grid items-center gap-6 sm:grid-cols-[1.2fr_1fr]">
                <div className="flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/gateway/payment-partner-dark.webp"
                    alt="Payment partners"
                    className="h-24 w-auto max-w-full object-contain"
                  />
                </div>
                <div className="flex flex-col items-center">
                  {/* No image picker here anymore — the QR is a live,
                     itinerary-specific Razorpay Payment Link (fixed token
                     amount, never a staff-uploaded image), generated fresh
                     each time the PDF is exported. See
                     src/lib/itinerary/tokenPaymentLink.ts. */}
                  <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white p-2 shadow-soft">
                    <QrCode className="h-14 w-14 text-[hsl(158_46%_14%)]/40" />
                  </div>
                  <p className="mt-2 max-w-[160px] text-center text-[11px] text-white/60">
                    Payment QR is generated when you export the PDF
                  </p>
                </div>
              </div>
              {/* Same divider treatment as the PDF's tyDivider (mint, thin,
                 centered) — separates this section from the Thank You block
                 below instead of a background-color seam. */}
              <div className="mx-auto mt-8 h-[2px] w-16 bg-[hsl(146_35%_55%)]" />
            </div>

            <div className="grid sm:grid-cols-[1.6fr_1fr]">
              <div className="p-6 sm:p-10">
                <div className="flex items-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/png/horizontal/vertex-horizontal-light-1600w.png"
                    alt="Vertex Kashmir Holidays"
                    className="h-12 w-auto object-contain dark:hidden"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/png/horizontal/vertex-horizontal-dark-1600w.png"
                    alt="Vertex Kashmir Holidays"
                    className="hidden h-12 w-auto object-contain dark:block"
                  />
                </div>
                <p className="font-serif mt-4 text-xl font-bold text-[hsl(156_40%_21%)] dark:text-primary">
                  {PDF_CONTACT.company}
                </p>
                <p className="text-sm text-mute dark:text-muted-foreground">{PDF_CONTACT.reg}</p>
                <div className="mt-7 space-y-3 text-sm">
                  <p className="flex items-center gap-3">
                    <ItineraryIcon
                      icon="support"
                      className="h-5 w-5 text-[hsl(156_40%_21%)] dark:text-primary"
                    />
                    <span className="font-semibold">{PDF_CONTACT.phone}</span>
                  </p>
                  <p className="flex items-center gap-3">
                    <ItineraryIcon
                      icon="map-pin"
                      className="h-5 w-5 text-[hsl(156_40%_21%)] dark:text-primary"
                    />
                    <span className="font-semibold">{companyAddress ?? PDF_CONTACT.address}</span>
                  </p>
                  <p className="flex items-center gap-3">
                    <ItineraryIcon
                      icon="calendar"
                      className="h-5 w-5 text-[hsl(156_40%_21%)] dark:text-primary"
                    />
                    <span className="font-semibold">{PDF_CONTACT.email}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center bg-[hsl(158_46%_14%)] p-8 text-center text-white sm:p-10">
                <p className="font-script text-4xl leading-none text-[hsl(146_35%_55%)] sm:text-5xl">
                  Thank You!
                </p>
                <p className="mt-4 max-w-[220px] text-sm leading-relaxed text-white/85">
                  We look forward to hosting you in the paradise on earth.
                </p>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="print-foot mt-10 border-t border-[hsl(40_14%_87%)] pt-3 text-center text-[10px] tracking-wide text-mute dark:border-mute/20">
      Vertex Kashmir Holidays · Kashmir Escape Itinerary
    </div>
  );
}

function PriceActivitySection({
  title,
  items,
  onUpdate,
  onRemove,
  onAdd,
  addLabel,
}: {
  title: string;
  items: PriceActivityItem[];
  onUpdate: (id: string, field: "name" | "place" | "day" | "note" | "price", v: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="mt-8">
      <div className="flex items-center gap-4">
        <h3 className="font-serif text-xl font-bold text-[hsl(156_40%_21%)] dark:text-primary">
          {title}
        </h3>
        <span className="h-px flex-1 bg-[hsl(40_14%_87%)] dark:bg-mute/20" />
      </div>
      <div className="mt-4 space-y-3">
        {items.map((a, idx) => (
          <div
            key={a.id}
            className="group relative grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-[hsl(40_14%_87%)] p-3 pr-8 dark:border-mute/20 sm:grid-cols-6"
          >
            <EditableField
              value={a.name}
              onValueChange={(v) => onUpdate(a.id, "name", v)}
              placeholder="Name"
              className="text-sm font-bold sm:col-span-2"
            />
            <EditableField
              value={a.place}
              onValueChange={(v) => onUpdate(a.id, "place", v)}
              placeholder="Place"
              className="text-xs text-mute dark:text-muted-foreground"
            />
            <EditableField
              value={a.day}
              onValueChange={(v) => onUpdate(a.id, "day", v)}
              placeholder="Day 02"
              className="text-xs text-mute dark:text-muted-foreground"
            />
            <EditableField
              value={a.note}
              onValueChange={(v) => onUpdate(a.id, "note", v)}
              placeholder="Note"
              className="text-xs text-mute dark:text-muted-foreground"
            />
            <EditableField
              value={a.price}
              onValueChange={(v) => onUpdate(a.id, "price", v)}
              placeholder="Rs. 840 pp"
              className="text-right text-xs font-bold text-[hsl(156_40%_21%)] dark:text-primary"
            />
            <button
              onClick={() => onRemove(a.id)}
              aria-label={`Remove ${title} row ${idx + 1}`}
              className="absolute right-2 top-1/2 hidden -translate-y-1/2 text-rose-500 hover:text-rose-600 group-hover:block no-print"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={onAdd}
        className="addbtn mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[hsl(156_40%_21%)]/40 px-3 py-1.5 text-xs font-bold text-[hsl(156_40%_21%)] transition hover:bg-[hsl(150_28%_92%)]/60 dark:border-primary/40 dark:text-primary dark:hover:bg-primary/10 no-print"
      >
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    </div>
  );
}

function ListColumn({
  title,
  items,
  tone,
  onUpdateCategory,
  onUpdateText,
  onRemove,
  onAdd,
  addLabel,
}: {
  title: string;
  items: ListItem[];
  tone: "inc" | "exc";
  onUpdateCategory: (id: string, v: string) => void;
  onUpdateText: (id: string, v: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div>
      <h3 className="font-serif text-[22px] font-bold text-[hsl(156_40%_21%)] dark:text-primary">
        {title}
      </h3>
      <ul className="mt-5 space-y-3 text-sm text-ink/85 dark:text-muted-foreground">
        {items.map((item) => (
          <li key={item.id} className="listrow group relative flex items-start gap-2.5 pr-6">
            <span
              className={`mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full text-white ${tone === "inc" ? "bg-[hsl(156_40%_21%)] dark:bg-primary" : "bg-rose-500"}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-2.5 w-2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {tone === "inc" ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              {/* Category is a small, rarely-touched tag (not a prominent
                  blank-looking field) — most rows already come with one
                  filled in from the default content, staff mainly just edit
                  the text below it. */}
              <EditableField
                value={item.category}
                onValueChange={(v) => onUpdateCategory(item.id, v)}
                placeholder="Category"
                className="inline-block rounded bg-[#E8F2EB] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#145C3E] dark:bg-primary/10 dark:text-primary"
              />
              <EditableField
                value={item.text}
                onValueChange={(v) => onUpdateText(item.id, v)}
                className="mt-1"
              />
            </div>
            <button
              onClick={() => onRemove(item.id)}
              aria-label={`Remove item from ${title}`}
              className="absolute right-0 top-0 hidden text-rose-500 group-hover:block no-print"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={onAdd}
        className="addbtn mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[hsl(156_40%_21%)]/40 px-3 py-1.5 text-xs font-bold text-[hsl(156_40%_21%)] transition hover:bg-[hsl(150_28%_92%)]/60 dark:border-primary/40 dark:text-primary dark:hover:bg-primary/10 no-print"
      >
        <Plus className="h-3 w-3" /> {addLabel}
      </button>
    </div>
  );
}

function CancelTierCard({
  items,
  onUpdate,
  onRemove,
  onAdd,
}: {
  items: CancelTier[];
  onUpdate: (id: string, field: "label" | "charge", v: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="policy-card rounded-2xl border border-[hsl(40_14%_87%)] bg-white p-6 shadow-soft dark:border-mute/20 dark:bg-card">
      <h3 className="text-base font-bold">If you need to cancel</h3>
      <p className="mt-1 text-xs text-mute dark:text-muted-foreground">
        Notice is counted from your first travel date. Cancellations must be requested by email.
      </p>
      <div className="mt-4 flex items-center justify-between border-b border-[hsl(40_14%_87%)] pb-2 text-[10px] font-semibold uppercase tracking-wide text-mute dark:border-mute/20 dark:text-muted-foreground">
        <span>Notice before travel</span>
        <span>Charge</span>
      </div>
      <ul className="text-sm leading-relaxed text-ink/80 dark:text-muted-foreground">
        {items.map((item) => {
          const pct = parseFloat(item.charge);
          const high = !Number.isNaN(pct) && pct >= 50;
          return (
            <li
              key={item.id}
              className="group relative flex items-center gap-3 border-b border-[hsl(40_14%_87%)]/60 py-2.5 pr-6 last:border-0 dark:border-mute/10"
            >
              <EditableField
                value={item.label}
                onValueChange={(v) => onUpdate(item.id, "label", v)}
                placeholder="Notice given before travel"
                className="flex-1 text-xs"
              />
              <EditableField
                value={item.charge}
                onValueChange={(v) => onUpdate(item.id, "charge", v)}
                placeholder="Charge"
                className={`w-16 shrink-0 text-right text-sm font-bold ${high ? "text-[#8A5340]" : "text-[#145C3E]"}`}
              />
              <button
                onClick={() => onRemove(item.id)}
                aria-label="Remove cancellation tier"
                className="absolute right-0 top-0 hidden text-rose-500 group-hover:block no-print"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
      <button
        onClick={onAdd}
        className="addbtn mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[hsl(156_40%_21%)]/40 px-3 py-1.5 text-xs font-bold text-[hsl(156_40%_21%)] transition hover:bg-[hsl(150_28%_92%)]/60 dark:border-primary/40 dark:text-primary dark:hover:bg-primary/10 no-print"
      >
        <Plus className="h-3 w-3" /> Add tier
      </button>
    </div>
  );
}
