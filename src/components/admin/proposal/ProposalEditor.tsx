"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { Toolbar } from "./Toolbar";
import { EditableField } from "../itinerary/EditableField";
import { ItineraryIcon } from "../itinerary/icons";
import { DEFAULT_PROPOSAL_DATA } from "./default-data";
import { downloadProposalPdf } from "@/lib/proposal/export-pdf";
import type { PdfTrustContent } from "@/lib/itinerary/pdfTrustContent";
import type { PdfSocialLinks } from "@/lib/pdf/contact";
import { genId, type ListItem, type CancelTier } from "@/types/itinerary";
import {
  type ProposalData,
  type ProposalStatus,
  type ProposalTier,
  type ProposalTierKey,
  TIER_ORDER,
  COMPARISON_DASH,
  COMPARISON_CHECK,
} from "@/types/proposal";

type ListKey = "pay";

interface ProposalEditorProps {
  id?: string;
  initialData: ProposalData;
  initialTitle: string;
  initialStatus: ProposalStatus;
  canSave?: boolean;
  companyAddress?: string;
  trustContent?: PdfTrustContent;
  socialLinks?: PdfSocialLinks;
  apiBasePath?: string;
}

export function ProposalEditor({
  id,
  initialData,
  initialTitle,
  initialStatus,
  canSave = true,
  companyAddress,
  trustContent,
  socialLinks,
  apiBasePath = "/api/proposals",
}: ProposalEditorProps) {
  const router = useRouter();
  const [data, setData] = useState<ProposalData>(initialData);
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState<ProposalStatus>(initialStatus);
  const [isSaving, setSaving] = useState(false);
  const [isExporting, setExporting] = useState(false);

  /* ---------- top-level string fields ---------- */
  const updateField = (field: keyof ProposalData, value: string) =>
    setData((p) => ({ ...p, [field]: value }));

  /* ---------- tiers ---------- */
  const updateTier = (
    key: ProposalTierKey,
    field: "label" | "title" | "priceLabel" | "coverNote" | "description" | "badgeLabel",
    value: string,
  ) => setData((p) => ({ ...p, tiers: { ...p.tiers, [key]: { ...p.tiers[key], [field]: value } } }));

  const addTierTag = (key: ProposalTierKey) =>
    setData((p) => ({
      ...p,
      tiers: { ...p.tiers, [key]: { ...p.tiers[key], tags: [...p.tiers[key].tags, "New tag"] } },
    }));
  const updateTierTag = (key: ProposalTierKey, idx: number, value: string) =>
    setData((p) => ({
      ...p,
      tiers: {
        ...p.tiers,
        [key]: { ...p.tiers[key], tags: p.tiers[key].tags.map((t, i) => (i === idx ? value : t)) },
      },
    }));
  const removeTierTag = (key: ProposalTierKey, idx: number) =>
    setData((p) => ({
      ...p,
      tiers: { ...p.tiers, [key]: { ...p.tiers[key], tags: p.tiers[key].tags.filter((_, i) => i !== idx) } },
    }));

  /* ---------- comparison table ---------- */
  const addComparisonRow = () =>
    setData((p) => ({
      ...p,
      comparisonRows: [
        ...p.comparisonRows,
        { id: genId("cmp"), label: "New row", budget: COMPARISON_DASH, premium: COMPARISON_DASH, luxury: COMPARISON_DASH },
      ],
    }));
  const updateComparisonRow = (
    rowId: string,
    field: "label" | "budget" | "premium" | "luxury",
    value: string,
  ) =>
    setData((p) => ({
      ...p,
      comparisonRows: p.comparisonRows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)),
    }));
  const removeComparisonRow = (rowId: string) =>
    setData((p) => ({ ...p, comparisonRows: p.comparisonRows.filter((r) => r.id !== rowId) }));

  /* ---------- days ---------- */
  const updateDay = (
    dayId: string,
    field: "title" | "dateLabel" | "body" | "stayLabel" | "highlightsLine",
    value: string,
  ) => setData((p) => ({ ...p, days: p.days.map((d) => (d.id === dayId ? { ...d, [field]: value } : d)) }));
  const addDay = () =>
    setData((p) => ({
      ...p,
      days: [
        ...p.days,
        { id: genId("pday"), title: "New Day", dateLabel: "", body: "Describe the day's plan…", stayLabel: "", highlightsLine: "" },
      ],
    }));
  const removeDay = (dayId: string) => setData((p) => ({ ...p, days: p.days.filter((d) => d.id !== dayId) }));

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
  const updateListItemRow = (key: "inc" | "exc", rowId: string, field: "category" | "text", value: string) =>
    setData((p) => ({
      ...p,
      [key]: p[key].map((v) => (v.id === rowId ? { ...v, [field]: value } : v)),
    }));
  const removeListItemRow = (key: "inc" | "exc", rowId: string) =>
    setData((p) => ({ ...p, [key]: p[key].filter((v) => v.id !== rowId) }));

  /* ---------- cancellation tiers (label + charge rows) ---------- */
  const addCancelTier = () =>
    setData((p) => ({ ...p, cancel: [...p.cancel, { id: genId("ct"), label: "", charge: "" }] }));
  const updateCancelTier = (rowId: string, field: "label" | "charge", value: string) =>
    setData((p) => ({
      ...p,
      cancel: p.cancel.map((v) => (v.id === rowId ? { ...v, [field]: value } : v)),
    }));
  const removeCancelTier = (rowId: string) =>
    setData((p) => ({ ...p, cancel: p.cancel.filter((v) => v.id !== rowId) }));

  /* ---------- why choose us (title/subtitle per item, icon fixed — same
     as ItineraryEditor's updateWhyChoose) ---------- */
  const updateWhyChoose = (wid: string, field: "title" | "subtitle", value: string) =>
    setData((p) => ({
      ...p,
      whyChoose: p.whyChoose.map((w) => (w.id === wid ? { ...w, [field]: value } : w)),
    }));

  /* ---------- actions ---------- */
  async function handleSave() {
    if (!title.trim()) {
      toast.error("Please enter a proposal title.");
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
      toast.success("Proposal saved.");
      if (!id && json.id) {
        router.replace(`/admin/proposals/${json.id}`);
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
      const { bytes } = await downloadProposalPdf(data, companyAddress, trustContent, socialLinks);
      const kb = Math.round(bytes / 1024);
      if (bytes > 1024 * 1024) {
        toast.warning(`PDF generated (${(bytes / 1048576).toFixed(2)} MB) — above the 1 MB target.`);
      } else {
        toast.success(`PDF downloaded (${kb} KB).`);
      }
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
    if (confirm("Reset all content to the default proposal? Unsaved changes will be lost.")) {
      setData(DEFAULT_PROPOSAL_DATA);
    }
  }

  const greenHead = "font-serif text-2xl font-bold text-[hsl(156_40%_21%)] dark:text-primary";
  const pageCard =
    "page rounded-xl border border-[hsl(40_14%_87%)] bg-white p-5 shadow-page dark:border-mute/20 dark:bg-card sm:p-8 md:p-12";
  const addBtn =
    "addbtn mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[hsl(156_40%_21%)]/40 px-3 py-1.5 text-xs font-bold text-[hsl(156_40%_21%)] transition hover:bg-[hsl(150_28%_92%)]/60 dark:border-primary/40 dark:text-primary dark:hover:bg-primary/10 no-print";
  const fieldLabel =
    "block text-[11px] font-semibold uppercase tracking-wide text-mute dark:text-muted-foreground mb-1";

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
          {/* Cover */}
          <article className={pageCard}>
            <h2 className={greenHead}>Cover</h2>
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
              <div>
                <label className={fieldLabel}>Quote Number</label>
                <EditableField value={data.quoteNumber} onValueChange={(v) => updateField("quoteNumber", v)} />
              </div>
              <div>
                <label className={fieldLabel}>Duration</label>
                <EditableField value={data.duration} onValueChange={(v) => updateField("duration", v)} />
              </div>
              <div>
                <label className={fieldLabel}>Travel Dates</label>
                <EditableField value={data.travelDates} onValueChange={(v) => updateField("travelDates", v)} />
              </div>
              <div>
                <label className={fieldLabel}>Prepared For</label>
                <EditableField value={data.preparedFor} onValueChange={(v) => updateField("preparedFor", v)} />
              </div>
              <div>
                <label className={fieldLabel}>Travellers</label>
                <EditableField value={data.travelers} onValueChange={(v) => updateField("travelers", v)} />
              </div>
              <div>
                <label className={fieldLabel}>Prepared By</label>
                <EditableField
                  value={data.preparedByName}
                  onValueChange={(v) => updateField("preparedByName", v)}
                  placeholder="Staff name"
                />
              </div>
              <div>
                <label className={fieldLabel}>Prepared By — Phone</label>
                <EditableField
                  value={data.preparedByPhone}
                  onValueChange={(v) => updateField("preparedByPhone", v)}
                  placeholder="+91 ..."
                />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={fieldLabel}>Title</label>
                <EditableField
                  value={data.coverTitle}
                  onValueChange={(v) => updateField("coverTitle", v)}
                  className="text-lg font-bold"
                />
              </div>
              <div>
                <label className={fieldLabel}>Subtitle</label>
                <EditableField
                  value={data.coverSubtitle}
                  onValueChange={(v) => updateField("coverSubtitle", v)}
                  className="text-lg font-bold"
                />
              </div>
            </div>
            <div className="mt-5">
              <label className={fieldLabel}>Intro Paragraph</label>
              <EditableField
                value={data.coverIntro}
                onValueChange={(v) => updateField("coverIntro", v)}
                rows={2}
              />
            </div>
          </article>

          {/* Pricing Tiers */}
          <article className={pageCard}>
            <h2 className={greenHead}>Your Three Options</h2>
            <div className="mt-6 space-y-5">
              {TIER_ORDER.map((key) => {
                const tier: ProposalTier = data.tiers[key];
                return (
                  <div
                    key={key}
                    className="rounded-xl border border-[hsl(40_14%_87%)] p-4 dark:border-mute/20"
                  >
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <label className={fieldLabel}>Label</label>
                        <EditableField value={tier.label} onValueChange={(v) => updateTier(key, "label", v)} />
                      </div>
                      <div>
                        <label className={fieldLabel}>Card Title</label>
                        <EditableField value={tier.title} onValueChange={(v) => updateTier(key, "title", v)} />
                      </div>
                      <div>
                        <label className={fieldLabel}>Price</label>
                        <EditableField
                          value={tier.priceLabel}
                          onValueChange={(v) => updateTier(key, "priceLabel", v)}
                          className="font-bold"
                        />
                      </div>
                      <div>
                        <label className={fieldLabel}>Cover Note</label>
                        <EditableField value={tier.coverNote} onValueChange={(v) => updateTier(key, "coverNote", v)} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className={fieldLabel}>Description</label>
                      <EditableField
                        value={tier.description}
                        onValueChange={(v) => updateTier(key, "description", v)}
                        rows={2}
                      />
                    </div>
                    <div className="mt-3">
                      <label className={fieldLabel}>Badge (e.g. &quot;MOST CHOSEN&quot;, blank = none)</label>
                      <EditableField
                        value={tier.badgeLabel}
                        onValueChange={(v) => updateTier(key, "badgeLabel", v)}
                        placeholder="Blank = no badge"
                        className="max-w-[220px]"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {tier.tags.map((tag, idx) => (
                        <span key={idx} className="group/tag relative">
                          <EditableField
                            value={tag}
                            onValueChange={(v) => updateTierTag(key, idx, v)}
                            className="rounded-full bg-[hsl(150_28%_92%)] px-3 py-1 text-[11px] font-bold text-[hsl(156_40%_21%)] dark:bg-primary/10 dark:text-primary"
                          />
                          <button
                            onClick={() => removeTierTag(key, idx)}
                            aria-label={`Remove tag ${tag}`}
                            className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white group-hover/tag:flex no-print"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <button onClick={() => addTierTag(key)} className={addBtn}>
                        <Plus className="h-2.5 w-2.5" /> tag
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6">
              <label className={fieldLabel}>Mixing Tip (below the option cards)</label>
              <EditableField value={data.tipText} onValueChange={(v) => updateField("tipText", v)} rows={2} />
            </div>
          </article>

          {/* Comparison table */}
          <article className={pageCard}>
            <h2 className={greenHead}>What Actually Differs</h2>
            {/* Static column headings — the rows below have no labels of
                their own on each cell, so this is the only thing telling
                staff which column is which. */}
            <div className="mt-6 hidden grid-cols-4 gap-x-3 px-3 sm:grid">
              <span className={fieldLabel}>Feature</span>
              <span className={fieldLabel}>Budget</span>
              <span className={fieldLabel}>Premium</span>
              <span className={fieldLabel}>Luxury</span>
            </div>
            <div className="mt-2 space-y-3">
              {data.comparisonRows.map((row) => (
                <div
                  key={row.id}
                  className="group relative grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-[hsl(40_14%_87%)] p-3 pr-8 dark:border-mute/20 sm:grid-cols-4"
                >
                  <EditableField
                    value={row.label}
                    onValueChange={(v) => updateComparisonRow(row.id, "label", v)}
                    placeholder="Feature"
                    className="text-sm font-bold sm:col-span-1"
                  />
                  {(["budget", "premium", "luxury"] as const).map((tk) => (
                    <div key={tk} className="flex items-center gap-1">
                      <EditableField
                        value={row[tk]}
                        onValueChange={(v) => updateComparisonRow(row.id, tk, v)}
                        className="min-w-0 flex-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => updateComparisonRow(row.id, tk, COMPARISON_CHECK)}
                        aria-label={`Set ${tk} to included`}
                        className="shrink-0 rounded border border-[hsl(40_14%_87%)] px-1 text-[10px] text-[hsl(156_40%_21%)] no-print"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={() => updateComparisonRow(row.id, tk, COMPARISON_DASH)}
                        aria-label={`Set ${tk} to not included`}
                        className="shrink-0 rounded border border-[hsl(40_14%_87%)] px-1 text-[10px] text-mute no-print"
                      >
                        –
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => removeComparisonRow(row.id)}
                    aria-label={`Remove row ${row.label}`}
                    className="absolute right-2 top-1/2 hidden -translate-y-1/2 text-rose-500 hover:text-rose-600 group-hover:block no-print"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addComparisonRow} className={addBtn}>
              <Plus className="h-3 w-3" /> Add row
            </button>
            <div className="mt-5">
              <label className={fieldLabel}>Footnote</label>
              <EditableField
                value={data.comparisonFootnote}
                onValueChange={(v) => updateField("comparisonFootnote", v)}
                rows={2}
              />
            </div>
          </article>

          {/* Days */}
          <article className={pageCard}>
            <h2 className={greenHead}>Your Six Days</h2>
            <div className="mt-6 space-y-3">
              {data.days.map((day, dayIdx) => (
                <div
                  key={day.id}
                  className="group relative rounded-xl border border-[hsl(40_14%_87%)] p-4 dark:border-mute/20"
                >
                  <button
                    onClick={() => removeDay(day.id)}
                    aria-label={`Remove day ${dayIdx + 1}`}
                    className="absolute -left-2 -top-2 z-20 hidden h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 no-print"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <div className="flex items-baseline gap-3">
                    <span className="shrink-0 font-serif text-xl font-bold text-[#B8D4C4]">
                      {String(dayIdx + 1).padStart(2, "0")}
                    </span>
                    <EditableField
                      value={day.title}
                      onValueChange={(v) => updateDay(day.id, "title", v)}
                      className="min-w-0 flex-1 text-sm font-bold"
                    />
                    <EditableField
                      value={day.dateLabel}
                      onValueChange={(v) => updateDay(day.id, "dateLabel", v)}
                      placeholder="Wed 10 Jun"
                      className="w-24 shrink-0 text-right text-xs text-mute dark:text-muted-foreground"
                    />
                  </div>
                  <EditableField
                    value={day.body}
                    onValueChange={(v) => updateDay(day.id, "body", v)}
                    rows={2}
                    className="mt-2 block text-sm"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <EditableField
                      value={day.stayLabel}
                      onValueChange={(v) => updateDay(day.id, "stayLabel", v)}
                      placeholder="Stay (blank on departure day)"
                      className="text-xs text-mute dark:text-muted-foreground"
                    />
                    <EditableField
                      value={day.highlightsLine}
                      onValueChange={(v) => updateDay(day.id, "highlightsLine", v)}
                      placeholder="Highlights"
                      className="text-xs text-mute dark:text-muted-foreground"
                    />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addDay} className={addBtn}>
              <Plus className="h-3 w-3" /> Add day
            </button>
          </article>

          {/* What's Covered */}
          <article className={pageCard}>
            <h2 className={greenHead}>What&apos;s Covered</h2>
            <div className="mt-8 space-y-10">
              <ListColumn
                title="Included in every option"
                items={data.inc}
                tone="inc"
                onUpdateCategory={(rid, v) => updateListItemRow("inc", rid, "category", v)}
                onUpdateText={(rid, v) => updateListItemRow("inc", rid, "text", v)}
                onRemove={(rid) => removeListItemRow("inc", rid)}
                onAdd={() => addListItemRow("inc")}
                addLabel="Add inclusion"
              />
              <ListColumn
                title="Paid separately"
                items={data.exc}
                tone="exc"
                onUpdateCategory={(rid, v) => updateListItemRow("exc", rid, "category", v)}
                onUpdateText={(rid, v) => updateListItemRow("exc", rid, "text", v)}
                onRemove={(rid) => removeListItemRow("exc", rid)}
                onAdd={() => addListItemRow("exc")}
                addLabel="Add exclusion"
              />
            </div>
            <div className="mt-8">
              <label className={fieldLabel}>Policy Note (snow/road closure)</label>
              <EditableField value={data.policyNote} onValueChange={(v) => updateField("policyNote", v)} rows={2} />
            </div>
          </article>

          {/* Payment & Cancellation — same 3-column card + tier table pattern
              as ItineraryEditor.tsx, same field names. */}
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
                      onValueChange={(v) => updateField("payStep1Title", v)}
                      className="min-w-0 flex-1 text-sm font-bold"
                    />
                  </div>
                  <EditableField
                    value={data.payStep1Desc}
                    onValueChange={(v) => updateField("payStep1Desc", v)}
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
                      onValueChange={(v) => updateField("payStep2Title", v)}
                      className="min-w-0 flex-1 text-sm font-bold"
                    />
                  </div>
                  <EditableField
                    value={data.payStep2Desc}
                    onValueChange={(v) => updateField("payStep2Desc", v)}
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
                    <button onClick={() => addListItem("pay", "New tag")} className={addBtn}>
                      <Plus className="h-2.5 w-2.5" /> tag
                    </button>
                  </div>
                  <EditableField
                    value={data.payNote}
                    onValueChange={(v) => updateField("payNote", v)}
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
                  onClick={() => setData((p) => ({ ...p, cancelNotes: [...p.cancelNotes, "New note"] }))}
                  className={addBtn}
                >
                  <Plus className="h-2.5 w-2.5" /> note
                </button>
              </div>
            </div>
          </article>

          {/* Why Choose Us — editable like the main Itinerary module's "Why
              Choose Vertex" (title/subtitle per item, icon fixed per item). */}
          <article className={pageCard}>
            <h2 className={greenHead}>Why Choose Us</h2>
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
          </article>

          {/* Closing */}
          <article className={pageCard}>
            <h2 className={greenHead}>How to Confirm</h2>
            <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
              {(
                [
                  ["confirmStep1Title", "confirmStep1Desc"],
                  ["confirmStep2Title", "confirmStep2Desc"],
                  ["confirmStep3Title", "confirmStep3Desc"],
                ] as const
              ).map(([titleField, descField], i) => (
                <div key={titleField}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(150_28%_92%)] text-xs font-bold text-[hsl(156_40%_21%)] dark:bg-primary/15 dark:text-primary">
                    {i + 1}
                  </span>
                  <EditableField
                    value={data[titleField]}
                    onValueChange={(v) => updateField(titleField, v)}
                    className="mt-2 text-sm font-bold"
                  />
                  <EditableField
                    value={data[descField]}
                    onValueChange={(v) => updateField(descField, v)}
                    rows={2}
                    className="mt-1 text-xs text-mute dark:text-muted-foreground"
                  />
                </div>
              ))}
            </div>
            <div className="mt-6">
              <label className={fieldLabel}>Hold Note (e.g. &quot;valid for 7 days&quot;)</label>
              <EditableField
                value={data.closingHoldNote}
                onValueChange={(v) => updateField("closingHoldNote", v)}
                rows={2}
              />
            </div>
          </article>
        </div>
      </div>
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
      <h3 className="font-serif text-[22px] font-bold text-[hsl(156_40%_21%)] dark:text-primary">{title}</h3>
      <ul className="mt-5 space-y-3 text-sm text-ink/85 dark:text-muted-foreground">
        {items.map((item) => (
          <li key={item.id} className="group relative flex items-start gap-2.5 pr-6">
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
              <EditableField
                value={item.category}
                onValueChange={(v) => onUpdateCategory(item.id, v)}
                placeholder="Category"
                className="inline-block rounded bg-[#E8F2EB] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#145C3E] dark:bg-primary/10 dark:text-primary"
              />
              <EditableField value={item.text} onValueChange={(v) => onUpdateText(item.id, v)} className="mt-1" />
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
