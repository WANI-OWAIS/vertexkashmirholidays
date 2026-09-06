"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ChevronDown, Lock, Check, X } from "lucide-react";
import { parsePhoneNumber, type CountryCode } from "libphonenumber-js";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { toE164 } from "@/lib/auth/validation";
import { phoneField } from "@/lib/leads/schema";
import { cn } from "@/lib/utils";

/** Splits a saved E.164 number back into a country + national number to
 * pre-fill the PhoneInput — same helper as BookingForm/B2bRequestForm. */
function parseDefaultPhone(e164: string): { country: CountryCode; national: string } | null {
  try {
    const parsed = parsePhoneNumber(e164);
    return parsed ? { country: parsed.country ?? "IN", national: parsed.nationalNumber } : null;
  } catch {
    return null;
  }
}

// Presentational label only — mirrors the LeadSource enum's values for
// display, not a re-derivation of the channel itself. The actual channel
// always comes from the server's deriveChannel() (see the "Resolve" handler
// below and src/lib/whatsappAttribution.server.ts) — this just turns that
// enum string into something a salesperson reads naturally.
const CHANNEL_LABELS: Record<string, string> = {
  GOOGLE_ADS: "Google Ads",
  META_ADS: "Meta Ads",
  THIRD_PARTY: "Third Party",
  REFERRAL: "Referral",
  WEBSITE: "Website",
  MANUAL: "Manual",
};

type ResolveState = "idle" | "loading" | "resolved" | "error";

// All fields kept as strings so react-hook-form/zod inference is stable.
// Numeric and enum coercion happens in onSubmit before sending to the API.
const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    phone: phoneField,
    email: z.string().email("Enter a valid email").optional().or(z.literal("")),
    source: z.string().optional(),
    category: z.string().optional(),
    adults: z.string().optional(),
    children: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    followUpAt: z.string().optional(),
    assignedToId: z.string().optional(),
    notes: z.string().optional(),
    negotiatedAmount: z.string().optional(),
    tokenAmount: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startDate && data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "Travel end date can't be before the start date.",
      });
    }
  });

type FormData = z.infer<typeof schema>;

interface StaffUser {
  id: string;
  name: string | null;
}

interface Props {
  staffUsers: StaffUser[];
  /** When set, the form edits this lead (PATCH) instead of creating a new one (POST). */
  leadId?: string;
  /** Pre-fill values for edit mode. */
  defaultValues?: Partial<FormData>;
  /** Render all fields read-only (locked lead, or a non-assignee admin viewing). */
  readOnly?: boolean;
  /**
   * Reassign-only mode: every field is locked EXCEPT "Assign To". Used when an
   * admin opens an assigned lead they don't own — they may only reassign it.
   */
  assignOnly?: boolean;
  /** Business notice shown above a locked / reassign-only form (title + explanation). */
  readOnlyNotice?: { title: string; body: string };
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition";

const selectWrapCls = "relative";

const selectCls =
  "w-full pl-3 pr-8 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition appearance-none bg-card";

export function LeadForm({
  staffUsers,
  leadId,
  defaultValues,
  readOnly = false,
  assignOnly = false,
  readOnlyNotice,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isEdit = !!leadId;
  const lockOthers = readOnly || assignOnly;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? { source: "MANUAL", adults: "1" },
  });

  // Phone — country-aware input matching the public LeadForm/BookingForm,
  // defaulting to India. Pre-fills from the lead's saved E.164 number in edit mode.
  const defaultPhoneParsed = defaultValues?.phone ? parseDefaultPhone(defaultValues.phone) : null;
  const [country, setCountry] = useState<CountryCode>(defaultPhoneParsed?.country ?? "IN");
  const [national, setNational] = useState(defaultPhoneParsed?.national ?? "");

  function syncPhone(nextNational: string, nextCountry: CountryCode) {
    setNational(nextNational);
    setCountry(nextCountry);
    const e164 = toE164(nextNational, nextCountry);
    setValue("phone", e164 ?? nextNational, { shouldValidate: true });
  }

  // WhatsApp attribution reference — deliberately kept as separate local
  // state rather than a registered react-hook-form field: it has async
  // "Resolve" behaviour and its own display (badge instead of the Source
  // dropdown) that don't fit the plain-field pattern the rest of this form
  // uses. The server independently re-resolves this same reference at submit
  // time (src/app/api/admin/leads/route.ts) rather than trusting anything
  // computed here — this state only drives what the salesperson sees.
  const [waRef, setWaRef] = useState("");
  const [waState, setWaState] = useState<ResolveState>("idle");
  const [waError, setWaError] = useState<string | null>(null);
  const [waChannel, setWaChannel] = useState<string | null>(null);
  const [waCampaign, setWaCampaign] = useState<string | null>(null);

  function clearResolvedReference() {
    setWaRef("");
    setWaState("idle");
    setWaError(null);
    setWaChannel(null);
    setWaCampaign(null);
  }

  async function handleResolveReference() {
    const ref = waRef.trim();
    if (!ref) return;
    setWaState("loading");
    setWaError(null);
    try {
      const res = await fetch(`/api/admin/leads/attribution/${encodeURIComponent(ref)}`);
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        attribution?: Record<string, string>;
        channel?: string;
      };
      if (!res.ok) {
        setWaState("error");
        setWaError(
          res.status === 404
            ? "Reference not found or expired. Please continue creating the lead manually."
            : (json.error ?? "Could not resolve this reference."),
        );
        return;
      }
      setWaState("resolved");
      setWaChannel(json.channel ?? null);
      setWaCampaign(json.attribution?.utmCampaign ?? null);
    } catch {
      setWaState("error");
      setWaError("Network error. Please try again or continue manually.");
    }
  }

  const startDate = watch("startDate");
  const startReg = register("startDate");

  function onStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    startReg.onChange(e);
    const next = e.target.value;
    const currentEnd = watch("endDate");
    if (next && (!currentEnd || currentEnd < next)) {
      setValue("endDate", next, { shouldValidate: true });
    }
  }

  function onSubmit(data: FormData) {
    startTransition(async () => {
      try {
        const adults = data.adults ? parseInt(data.adults, 10) : 1;
        const children = data.children ? parseInt(data.children, 10) : undefined;
        const empty = isEdit ? null : undefined;
        const negotiated = data.negotiatedAmount ? parseFloat(data.negotiatedAmount) : NaN;
        const token = data.tokenAmount ? parseFloat(data.tokenAmount) : NaN;

        const payload = {
          name: data.name,
          phone: data.phone,
          email: data.email?.trim() ? data.email.trim() : empty,
          source: data.source || "MANUAL",
          category: data.category || empty,
          adults: isNaN(adults) ? 1 : adults,
          children: children !== undefined && !isNaN(children) ? children : empty,
          startDate: data.startDate || empty,
          endDate: data.endDate || empty,
          followUpAt: data.followUpAt || empty,
          assignedToId: data.assignedToId || empty,
          notes: isEdit ? (data.notes ?? "") : data.notes || undefined,
          negotiatedAmount: negotiated > 0 ? negotiated : empty,
          tokenAmount: token > 0 ? token : empty,
          // Only sent once successfully resolved — an unresolved/abandoned
          // reference never reaches the API, same as never having pasted one.
          ...(waState === "resolved" && waRef.trim() ? { whatsappReference: waRef.trim() } : {}),
        };

        const res = await fetch(isEdit ? `/api/leads/${leadId}` : "/api/admin/leads", {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const j = (await res.json()) as { error?: string | { formErrors?: string[] } };
          const msg = typeof j.error === "string" ? j.error : "Save failed.";
          toast.error(msg);
          return;
        }

        toast.success(isEdit ? "Lead updated!" : "Lead created!");
        router.push(isEdit ? `/admin/leads/${leadId}` : "/admin/leads");
        router.refresh();
      } catch {
        toast.error("An error occurred.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Full-width notice banner */}
      {(readOnly || assignOnly) && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-2xl border px-4 py-3",
            assignOnly ? "border-primary/30 bg-primary/10" : "border-amber-500/30 bg-amber-500/10",
          )}
        >
          <Lock
            className={cn(
              "w-4 h-4 shrink-0 mt-0.5",
              assignOnly ? "text-primary" : "text-amber-600 dark:text-amber-400",
            )}
          />
          <div className="text-xs">
            <p
              className={cn(
                "font-semibold",
                assignOnly ? "text-primary" : "text-amber-700 dark:text-amber-300",
              )}
            >
              {readOnlyNotice?.title ?? "This lead is read-only"}
            </p>
            <p className="text-muted-foreground mt-0.5">
              {readOnlyNotice?.body ??
                "It has been converted to a booking, so its details are read-only. An admin must unlock the lead before any changes can be made."}
            </p>
          </div>
        </div>
      )}

      {/* Two-column grid — left: Contact + Trip, right: Source/Notes + Amounts + Assignment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── LEFT COLUMN ── */}
        <fieldset
          disabled={lockOthers}
          className={cn("space-y-6 min-w-0 border-0 m-0 p-0", lockOthers && "opacity-70")}
        >
          {/* Contact Details */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-foreground text-sm">Contact Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Name *
                </label>
                <input {...register("name")} className={inputCls} placeholder="Full name" />
                {errors.name && (
                  <p className="text-[12px] text-red-500 dark:text-red-400 mt-1">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Phone *
                </label>
                <PhoneInput
                  country={country}
                  onCountryChange={(c) => syncPhone(national, c)}
                  value={national}
                  onChange={(v) => syncPhone(v, country)}
                  invalid={!!errors.phone}
                />
                <input type="hidden" {...register("phone")} />
                {errors.phone && (
                  <p className="text-[12px] text-red-500 dark:text-red-400 mt-1">
                    {errors.phone.message}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Email
              </label>
              <input
                {...register("email")}
                type="email"
                className={inputCls}
                placeholder="optional@email.com"
              />
              {errors.email && (
                <p className="text-[12px] text-red-500 dark:text-red-400 mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>
          </div>

          {/* Trip Details */}
          <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-foreground text-sm">Trip Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Travel Start
                </label>
                <input {...startReg} onChange={onStartChange} type="date" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Travel End
                </label>
                <input
                  {...register("endDate")}
                  type="date"
                  min={startDate || undefined}
                  className={inputCls}
                />
                {errors.endDate && (
                  <p className="text-[12px] text-red-500 dark:text-red-400 mt-1">
                    {errors.endDate.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Adults
                </label>
                <input
                  {...register("adults")}
                  type="number"
                  min={1}
                  className={inputCls}
                  placeholder="1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Children
                </label>
                <input
                  {...register("children")}
                  type="number"
                  min={0}
                  className={inputCls}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Follow-up Date &amp; Time
              </label>
              <input {...register("followUpAt")} type="datetime-local" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                Category
              </label>
              <div className={selectWrapCls}>
                <select {...register("category")} className={selectCls}>
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
        </fieldset>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-6">
          <fieldset
            disabled={lockOthers}
            className={cn("space-y-6 min-w-0 border-0 m-0 p-0", lockOthers && "opacity-70")}
          >
            {/* Source & Notes */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4">
              <h3 className="font-bold text-foreground text-sm">Source &amp; Notes</h3>

              {/* WhatsApp attribution reference — new-lead creation only; not
                  every manually-created lead comes through the tracked
                  WhatsApp flow, so this is optional and edit mode skips it. */}
              {!isEdit && (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    WhatsApp Reference
                  </label>
                  {waState === "resolved" ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          Resolved — {waChannel ? (CHANNEL_LABELS[waChannel] ?? waChannel) : "—"}
                          {waCampaign ? ` · ${waCampaign}` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={clearResolvedReference}
                        className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3 h-3" /> Clear
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <input
                          value={waRef}
                          onChange={(e) => {
                            setWaRef(e.target.value);
                            if (waState === "error") {
                              setWaState("idle");
                              setWaError(null);
                            }
                          }}
                          className={cn(inputCls, "flex-1")}
                          placeholder="G-CgVI13IE"
                        />
                        <button
                          type="button"
                          onClick={handleResolveReference}
                          disabled={!waRef.trim() || waState === "loading"}
                          className="shrink-0 flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-xs font-bold text-foreground transition hover:bg-muted disabled:opacity-50"
                        >
                          {waState === "loading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Resolve
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Paste the reference from the customer&apos;s WhatsApp message.
                      </p>
                      {waState === "error" && waError && (
                        <p className="mt-1 text-[12px] text-red-500 dark:text-red-400">{waError}</p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Source
                </label>
                {waState === "resolved" ? (
                  <div className={cn(inputCls, "bg-muted text-muted-foreground")}>
                    {waChannel ? (CHANNEL_LABELS[waChannel] ?? waChannel) : "—"} (from resolved
                    reference)
                  </div>
                ) : (
                  <div className={selectWrapCls}>
                    <select {...register("source")} className={selectCls}>
                      <option value="MANUAL">Manual</option>
                      <option value="WEBSITE">Website</option>
                      <option value="REFERRAL">Referral</option>
                      <option value="GOOGLE_ADS">Google Ads</option>
                      <option value="META_ADS">Meta Ads</option>
                      <option value="THIRD_PARTY">Third Party</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Notes
                </label>
                <textarea
                  {...register("notes")}
                  rows={3}
                  className={`${inputCls} resize-none`}
                  placeholder="Any notes about this lead..."
                />
              </div>
            </div>

            {/* Booking Amounts */}
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4">
              <h3 className="font-bold text-foreground text-sm">Booking Amounts (Optional)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Negotiated Amount (₹)
                  </label>
                  <input
                    {...register("negotiatedAmount")}
                    type="number"
                    min={0}
                    step={1000}
                    className={inputCls}
                    placeholder="e.g. 45000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Token Amount (₹)
                  </label>
                  <input
                    {...register("tokenAmount")}
                    type="number"
                    min={0}
                    step={1000}
                    className={inputCls}
                    placeholder="e.g. 9000"
                  />
                </div>
              </div>
            </div>
          </fieldset>

          {/* Assignment — own fieldset so admin can reassign a lead they don't own */}
          <fieldset
            disabled={readOnly}
            className={cn("min-w-0 border-0 m-0 p-0", readOnly && "opacity-70")}
          >
            <div className="bg-card rounded-2xl border border-border shadow-sm p-6 space-y-4">
              <h3 className="font-bold text-foreground text-sm">Assignment</h3>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Assign To
                </label>
                <div className={selectWrapCls}>
                  <select {...register("assignedToId")} className={selectCls}>
                    <option value="">Unassigned</option>
                    {staffUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.id}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
          </fieldset>
        </div>
      </div>

      {/* CTA — centered below both columns */}
      <div className="flex items-center justify-center gap-3 pt-2">
        {!readOnly && (
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white text-sm font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Lead"}
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push(isEdit ? `/admin/leads/${leadId}` : "/admin/leads")}
          className="text-sm text-muted-foreground hover:text-foreground px-4 py-2.5 rounded-xl border border-border transition-colors"
        >
          {readOnly ? "Back" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
