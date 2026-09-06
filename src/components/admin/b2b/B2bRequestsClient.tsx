"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Plus, ExternalLink, CalendarDays, Users, BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePagination } from "@/components/admin/ui/usePagination";
import { TablePagination } from "@/components/admin/ui/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/organisms/dialog";
import {
  B2B_STATUS_LABELS as STATUS_LABELS,
  B2B_STATUS_STYLES as STATUS_STYLES,
  type B2bRequestStatus,
} from "@/lib/b2b/requestStatus";

interface RequestRow {
  id: string;
  name: string;
  phone: string;
  adults: number;
  children: number | null;
  days: number | null;
  rooms: number | null;
  budget: number | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  status: string;
  createdById: string | null;
  createdAt: Date | string;
  b2bAgent: { id: string; name: string | null; agencyName: string | null; email: string } | null;
}

interface AgentOption {
  id: string;
  name: string | null;
  agencyName: string | null;
  email: string;
  agencyStatus: string | null;
}

interface Props {
  initialRequests: RequestRow[];
  agents: AgentOption[];
  /** Pre-selects the agent filter — set when arriving from a B2B Agents row's "Requests" stat. */
  initialAgentFilter?: string;
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-card";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

interface CreateForm {
  agentId: string;
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

const EMPTY_FORM: CreateForm = {
  agentId: "",
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

export function B2bRequestsClient({ initialRequests, agents, initialAgentFilter }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [agentFilter, setAgentFilter] = useState<string>(initialAgentFilter ?? "ALL");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return initialRequests.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (agentFilter !== "ALL" && r.b2bAgent?.id !== agentFilter) return false;
      return true;
    });
  }, [initialRequests, statusFilter, agentFilter]);

  const { page, setPage, pageSize, changePageSize, pageCount, total, pageItems } =
    usePagination(filtered);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/b2b-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: form.agentId,
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
        setCreating(false);
        setForm(EMPTY_FORM);
        router.refresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Could not create request.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-foreground text-xl">B2B Requests</h2>
          <p className="text-muted-foreground text-xs mt-0.5">{initialRequests.length} requests</p>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setFormError(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:brightness-110"
        >
          <Plus className="w-3.5 h-3.5" /> New Request
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 p-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-xl bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
          >
            <option value="ALL">All statuses</option>
            {/* CONVERTED never appears in this list (see admin/b2b-requests/page.tsx) — it's a booking now, not a request. */}
            {(Object.keys(STATUS_LABELS) as B2bRequestStatus[])
              .filter((s) => s !== "CONVERTED")
              .map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
          </select>
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-xl bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
          >
            <option value="ALL">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.agencyName ?? a.name ?? a.email}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground self-center shrink-0">{filtered.length} results</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-t border-b border-border">
                {["Guest", "Agent", "Trip", "Budget", "Status", "Created", "Origin", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No B2B requests found.
                  </td>
                </tr>
              ) : (
                pageItems.map((r) => {
                  const status = r.status as B2bRequestStatus;
                  return (
                    <tr key={r.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/b2b-requests/${r.id}`}
                          className="font-semibold text-foreground text-xs hover:text-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                        <p className="text-[12px] text-muted-foreground">{r.phone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate max-w-[160px]">
                              {r.b2bAgent?.agencyName ?? "—"}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">
                              {r.b2bAgent?.name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {r.days ? `${r.days}d` : "—"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {r.adults}
                            {r.children ? `+${r.children}c` : ""}
                          </span>
                          {r.rooms ? (
                            <span className="flex items-center gap-1">
                              <BedDouble className="h-3 w-3" />
                              {r.rooms} rm
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-foreground whitespace-nowrap">
                        {r.budget ? inr.format(r.budget) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold",
                            STATUS_STYLES[status] ?? "",
                          )}
                        >
                          {STATUS_LABELS[status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-muted-foreground whitespace-nowrap">
                        {r.createdById ? "CRM staff" : "Agent"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/b2b-requests/${r.id}`}
                          aria-label={`View B2B request for ${r.name}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={page}
          pageSize={pageSize}
          pageCount={pageCount}
          total={total}
          onPage={setPage}
          onPageSize={changePageSize}
          noun="requests"
        />
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New B2B Request</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            {formError && (
              <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}
            <div>
              <label className="text-xs font-semibold text-foreground">B2B Agent *</label>
              <select
                required
                className={inputCls + " mt-1"}
                value={form.agentId}
                onChange={(e) => setForm((f) => ({ ...f, agentId: e.target.value }))}
              >
                <option value="" disabled>
                  Select an agent…
                </option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.agencyName ?? a.name ?? a.email) + ` (${a.agencyStatus})`}
                  </option>
                ))}
              </select>
            </div>
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
                <label className="text-xs font-semibold text-foreground">Budget (₹)</label>
                <input
                  type="number"
                  min={0}
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
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Planning To</label>
                <input
                  type="date"
                  className={inputCls + " mt-1"}
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
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create Request
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
