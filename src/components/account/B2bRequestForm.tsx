"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { parsePhoneNumber, type CountryCode } from "libphonenumber-js";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { toE164 } from "@/lib/auth/validation";

const MIN_BUDGET = 20000;

interface FormState {
  guestName: string;
  guestPhone: string;
  days: string;
  pax: string;
  children: string;
  rooms: string;
  budget: string;
  startDate: string;
  endDate: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  guestName: "",
  guestPhone: "",
  days: "",
  pax: "",
  children: "",
  rooms: "",
  budget: "",
  startDate: "",
  endDate: "",
  notes: "",
};

// Splits a stored E.164 number back into country + national parts to pre-fill
// PhoneInput — same approach as BookingForm's parseDefaultPhone.
function parseDefaultPhone(e164: string): { country: CountryCode; national: string } | null {
  try {
    const parsed = parsePhoneNumber(e164);
    return parsed ? { country: parsed.country ?? "IN", national: parsed.nationalNumber } : null;
  } catch {
    return null;
  }
}

interface Props {
  mode: "create" | "edit";
  requestId?: string;
  initial?: Partial<FormState>;
  /** Create mode only — called instead of navigating away, so the caller (a modal) can close itself. */
  onSuccess?: () => void;
}

const inputClass =
  "mt-1.5 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25";

export function B2bRequestForm({ mode, requestId, initial, onSuccess }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, ...initial });
  const initialPhone = initial?.guestPhone ? parseDefaultPhone(initial.guestPhone) : null;
  const [country, setCountry] = useState<CountryCode>(initialPhone?.country ?? "IN");
  const [national, setNational] = useState(initialPhone?.national ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function syncPhone(nextNational: string, nextCountry: CountryCode) {
    setNational(nextNational);
    setCountry(nextCountry);
    const e164 = toE164(nextNational, nextCountry);
    setForm((f) => ({ ...f, guestPhone: e164 ?? nextNational }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.guestPhone) {
      setError("Please enter a valid guest phone number.");
      return;
    }
    if (form.budget && Number(form.budget) < MIN_BUDGET) {
      setError(`Minimum budget is ₹${MIN_BUDGET.toLocaleString("en-IN")}.`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(
        mode === "create" ? "/api/account/b2b/requests" : `/api/account/b2b/requests/${requestId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestName: form.guestName,
            guestPhone: form.guestPhone,
            days: form.days || undefined,
            pax: form.pax || undefined,
            children: form.children || undefined,
            rooms: form.rooms || undefined,
            budget: form.budget || undefined,
            startDate: form.startDate || undefined,
            endDate: form.endDate || undefined,
            notes: form.notes || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const flat = data.error?.fieldErrors ? Object.values(data.error.fieldErrors).flat()[0] : undefined;
        throw new Error(
          typeof data.error === "string" ? data.error : (flat as string) ?? "Something went wrong.",
        );
      }

      if (mode === "create") {
        toast.success(
          "Your package request has been submitted. Our team will review it and get back to you shortly.",
        );
        router.refresh();
        onSuccess?.();
      } else {
        toast.success("Your request has been updated.");
        router.push(`/account/requests/${requestId}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
      {error && (
        <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-4">
          <div>
            <label className="text-xs font-semibold text-foreground" htmlFor="rf-guestName">
              Guest Name *
            </label>
            <input
              id="rf-guestName"
              required
              className={inputClass}
              value={form.guestName}
              onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground" htmlFor="rf-guestPhone">
              Guest Phone *
            </label>
            <PhoneInput
              id="rf-guestPhone"
              country={country}
              onCountryChange={(c) => syncPhone(national, c)}
              value={national}
              onChange={(v) => syncPhone(v, country)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground" htmlFor="rf-days">
                Days
              </label>
              <input
                id="rf-days"
                type="number"
                min={1}
                className={inputClass}
                value={form.days}
                onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground" htmlFor="rf-pax">
                Pax
              </label>
              <input
                id="rf-pax"
                type="number"
                min={1}
                className={inputClass}
                value={form.pax}
                onChange={(e) => setForm((f) => ({ ...f, pax: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground" htmlFor="rf-children">
                Children (5–12y)
              </label>
              <input
                id="rf-children"
                type="number"
                min={0}
                className={inputClass}
                value={form.children}
                onChange={(e) => setForm((f) => ({ ...f, children: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground" htmlFor="rf-rooms">
                Rooms
              </label>
              <input
                id="rf-rooms"
                type="number"
                min={1}
                className={inputClass}
                value={form.rooms}
                onChange={(e) => setForm((f) => ({ ...f, rooms: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground" htmlFor="rf-budget">
                Budget (₹, min 20,000)
              </label>
              <input
                id="rf-budget"
                type="number"
                min={MIN_BUDGET}
                step={1000}
                className={inputClass}
                value={form.budget}
                onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground" htmlFor="rf-startDate">
                Planning From
              </label>
              <input
                id="rf-startDate"
                type="date"
                className={inputClass}
                value={form.startDate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    startDate: e.target.value,
                    endDate: f.endDate && f.endDate < e.target.value ? "" : f.endDate,
                  }))
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground" htmlFor="rf-endDate">
                Planning To
              </label>
              <input
                id="rf-endDate"
                type="date"
                min={form.startDate || undefined}
                disabled={!form.startDate}
                className={inputClass + " disabled:cursor-not-allowed disabled:opacity-60"}
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground" htmlFor="rf-notes">
              Other Requirements
            </label>
            <textarea
              id="rf-notes"
              rows={3}
              className={inputClass}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {mode === "create" ? "Submit Request" : "Save Changes"}
      </button>
    </form>
  );
}
