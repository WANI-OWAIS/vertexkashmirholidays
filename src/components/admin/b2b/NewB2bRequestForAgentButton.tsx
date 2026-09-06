"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/organisms/dialog";

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-card";

interface Form {
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

const EMPTY_FORM: Form = {
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

interface Props {
  agentId: string;
  agentLabel: string;
}

/**
 * Same create form as B2bRequestsClient's "New Request" modal, scoped to one
 * already-known agent (no agent picker) — used from the agency detail panel
 * on the B2B Agents list.
 */
export function NewB2bRequestForAgentButton({ agentId, agentLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/b2b-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
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
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const flat = data.error?.fieldErrors ? Object.values(data.error.fieldErrors).flat()[0] : undefined;
        throw new Error(
          typeof data.error === "string" ? data.error : (flat as string) ?? "Could not create request.",
        );
      }
      toast.success("B2B request created.");
      setOpen(false);
      setForm(EMPTY_FORM);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition hover:brightness-110"
      >
        <Plus className="h-3.5 w-3.5" /> New Request
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Request — {agentLabel}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            {formError && (
              <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Guest Name *</label>
                <input
                  required
                  className={inputCls + " mt-1"}
                  value={form.guestName}
                  onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Guest Phone *</label>
                <input
                  required
                  className={inputCls + " mt-1"}
                  placeholder="+91…"
                  value={form.guestPhone}
                  onChange={(e) => setForm((f) => ({ ...f, guestPhone: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Days</label>
                <input
                  type="number"
                  min={1}
                  className={inputCls + " mt-1"}
                  value={form.days}
                  onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Pax</label>
                <input
                  type="number"
                  min={1}
                  className={inputCls + " mt-1"}
                  value={form.pax}
                  onChange={(e) => setForm((f) => ({ ...f, pax: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Children (5–12y)</label>
                <input
                  type="number"
                  min={0}
                  className={inputCls + " mt-1"}
                  value={form.children}
                  onChange={(e) => setForm((f) => ({ ...f, children: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Rooms</label>
                <input
                  type="number"
                  min={1}
                  className={inputCls + " mt-1"}
                  value={form.rooms}
                  onChange={(e) => setForm((f) => ({ ...f, rooms: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Budget (₹, min 20,000)</label>
                <input
                  type="number"
                  min={20000}
                  step={1000}
                  className={inputCls + " mt-1"}
                  value={form.budget}
                  onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Planning From</label>
                <input
                  type="date"
                  className={inputCls + " mt-1"}
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
                <label className="text-xs font-semibold text-foreground">Planning To</label>
                <input
                  type="date"
                  min={form.startDate || undefined}
                  disabled={!form.startDate}
                  className={inputCls + " mt-1 disabled:cursor-not-allowed disabled:opacity-60"}
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-foreground">Other Requirements</label>
                <textarea
                  className={inputCls + " mt-1"}
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create Request
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
