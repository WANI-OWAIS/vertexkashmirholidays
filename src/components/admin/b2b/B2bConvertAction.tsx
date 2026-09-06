"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ReceiptText } from "lucide-react";
import { PAYMENT_METHODS } from "@/lib/payments/gst";

interface Props {
  leadId: string;
  guestName: string;
  gstRates: number[];
  hasItinerary: boolean;
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-xl bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary";

/**
 * Converts a B2B request into the existing Booking flow
 * (POST /api/admin/b2b-requests/[id]/convert). Total Amount, Token Amount and
 * GST are all required inputs here — unlike the normal lead Convert modal,
 * GST has no "No GST" option: it must be an explicit choice before the
 * request can convert (the server still nulls it out for a cash payment via
 * the same resolveGst() the normal flow uses — this only makes the *input*
 * mandatory, not the business rule).
 */
export function B2bConvertAction({ leadId, guestName, gstRates, hasItinerary }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bookingAmount, setBookingAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Online");
  const [gstPercent, setGstPercent] = useState<string>(String(gstRates[0] ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const b = parseFloat(bookingAmount);
    const t = parseFloat(tokenAmount);
    const g = parseFloat(gstPercent);
    if (!b || b <= 0) return setError("Enter a valid total amount.");
    if (!t || t <= 0) return setError("Enter a valid token amount.");
    if (t >= b) return setError("Token amount must be less than the total amount.");
    if (!gstPercent || Number.isNaN(g)) return setError("Select a GST rate.");
    setError(null);
    setSubmitting(true);

    (async () => {
      try {
        const res = await fetch(`/api/admin/b2b-requests/${leadId}/convert`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingAmount: b, tokenAmount: t, paymentMethod, gstPercent: g }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.bookingId) {
          throw new Error(json.error ?? "Conversion failed.");
        }
        toast.success("Request converted — booking created.");
        router.push(`/admin/bookings/${json.bookingId}/services`);
      } catch (err) {
        setSubmitting(false);
        toast.error(err instanceof Error ? err.message : "Conversion failed.");
      }
    })();
  }

  if (!hasItinerary) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-700"
      >
        <ReceiptText className="h-4 w-4" />
        Convert to Booking
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-xl"
          >
            <div>
              <h3 className="font-display font-bold text-foreground">Convert B2B Request</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Convert <span className="font-semibold text-foreground">{guestName}</span> into a
                booking under the agent&apos;s account. This locks the request and its itinerary.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                  Total Amount (₹) *
                </span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={bookingAmount}
                  onChange={(e) => setBookingAmount(e.target.value)}
                  placeholder="e.g. 55000"
                  className={`${inputCls} mt-1`}
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                  Token / Advance Amount (₹) *
                </span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  placeholder="e.g. 10000"
                  className={`${inputCls} mt-1`}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                    Payment Mode
                  </span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
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
                  <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                    GST *
                  </span>
                  <select
                    value={gstPercent}
                    onChange={(e) => setGstPercent(e.target.value)}
                    className={`${inputCls} mt-1`}
                  >
                    {gstRates.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-[12px] text-muted-foreground">
                GST only applies to non-cash payments — recorded here either way, applied
                automatically based on the payment mode.
              </p>
            </div>

            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Convert &amp; Create Booking
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
