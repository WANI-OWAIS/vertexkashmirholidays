"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  Search,
  Handshake,
  Plus,
  CheckCircle2,
  Ban,
  ChevronDown,
  ClipboardList,
  CalendarCheck2,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePagination } from "@/components/admin/ui/usePagination";
import { TablePagination } from "@/components/admin/ui/TablePagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/organisms/dialog";
import { LogoUploadField } from "@/components/b2b/LogoUploadField";
import { NewB2bRequestForAgentButton } from "./NewB2bRequestForAgentButton";

type AgencyStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

interface AgentRow {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  agencyStatus: AgencyStatus | null;
  agencyName: string | null;
  agencyLogoUrl: string | null;
  agencyWebsite: string | null;
  agencyRegistrationNumber: string | null;
  agencyGstin: string | null;
  agencyState: string | null;
  createdAt: Date | string;
  _count: { b2bRequests: number; bookings: number };
}

interface Props {
  initialAgents: AgentRow[];
}

const STATUS_STYLES: Record<AgencyStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  SUSPENDED: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const inputCls =
  "w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-card";

interface CreateForm {
  name: string;
  email: string;
  phone: string;
  agencyName: string;
  agencyState: string;
  agencyLogoDataUrl: string;
  agencyWebsite: string;
  agencyRegistrationNumber: string;
  agencyGstin: string;
}

const EMPTY_FORM: CreateForm = {
  name: "",
  email: "",
  phone: "",
  agencyName: "",
  agencyState: "",
  agencyLogoDataUrl: "",
  agencyWebsite: "",
  agencyRegistrationNumber: "",
  agencyGstin: "",
};

export function B2bAgentsClient({ initialAgents }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return initialAgents;
    return initialAgents.filter((a) => {
      return (
        (a.name ?? "").toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.agencyName ?? "").toLowerCase().includes(q)
      );
    });
  }, [initialAgents, search]);

  const { page, setPage, pageSize, changePageSize, pageCount, total, pageItems } =
    usePagination(filtered);

  function runAction(label: string, fn: () => Promise<Response>) {
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const message =
            typeof data.error === "string"
              ? data.error
              : data.error?.formErrors?.[0] ?? `${label} failed.`;
          throw new Error(message);
        }
        toast.success(`${label} succeeded.`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : `${label} failed.`);
      }
    });
  }

  function handleApprove(a: AgentRow) {
    runAction("Approval", () =>
      fetch(`/api/admin/b2b-agents/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyStatus: "ACTIVE" }),
      }),
    );
  }

  function handleSuspend(a: AgentRow) {
    if (!confirm(`Suspend B2B access for ${a.agencyName ?? a.name}? They keep their account.`)) return;
    runAction("Suspend", () =>
      fetch(`/api/admin/b2b-agents/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agencyStatus: "SUSPENDED" }),
      }),
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/b2b-agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : data.error?.fieldErrors
                ? Object.values(data.error.fieldErrors).flat()[0] as string
                : "Could not create B2B agent.",
          );
        }
        toast.success("B2B agent created — PENDING approval. Login credentials are emailed once approved.");
        setCreating(false);
        setForm(EMPTY_FORM);
        router.refresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "Could not create B2B agent.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-extrabold text-foreground text-xl">B2B Agents</h2>
          <p className="text-muted-foreground text-xs mt-0.5">{initialAgents.length} agents</p>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_FORM);
            setFormError(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:brightness-110"
        >
          <Plus className="w-3.5 h-3.5" /> New B2B Agent
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 p-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by agency, name or email..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-muted/50"
            />
          </div>
          <p className="text-xs text-muted-foreground self-center shrink-0">{filtered.length} results</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-t border-b border-border">
                {["Agency", "Contact", "Status", "Registered", "Actions"].map((h) => (
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
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    No B2B agents found.
                  </td>
                </tr>
              ) : (
                pageItems.map((a) => {
                  const expanded = expandedId === a.id;
                  return (
                  <Fragment key={a.id}>
                  <tr
                    onClick={() => setExpandedId(expanded ? null : a.id)}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                          <Handshake className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground text-xs">{a.agencyName ?? "—"}</p>
                          {a.agencyGstin && (
                            <p className="text-[11px] text-muted-foreground">GSTIN: {a.agencyGstin}</p>
                          )}
                        </div>
                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform",
                            expanded && "rotate-180",
                          )}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-foreground">{a.name ?? "—"}</p>
                      <p className="text-[12px] text-muted-foreground truncate max-w-[180px]">
                        {a.email}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold",
                          a.agencyStatus ? STATUS_STYLES[a.agencyStatus] : "",
                        )}
                      >
                        {a.agencyStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {(a.agencyStatus === "PENDING" || a.agencyStatus === "SUSPENDED") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(a);
                            }}
                            disabled={isPending}
                            title="Approve"
                            className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {a.agencyStatus === "SUSPENDED" ? "Reactivate" : "Approve"}
                          </button>
                        )}
                        {a.agencyStatus === "ACTIVE" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSuspend(a);
                            }}
                            disabled={isPending}
                            title="Suspend"
                            className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-1 rounded-lg border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                          >
                            <Ban className="w-3.5 h-3.5" /> Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={5} className="bg-muted/20 px-4 py-4">
                        <div className="rounded-2xl border border-border bg-card p-5">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                                {a.agencyLogoUrl ? (
                                  <Image
                                    src={a.agencyLogoUrl}
                                    alt={`${a.agencyName ?? "Agency"} logo`}
                                    fill
                                    sizes="48px"
                                    className="object-contain p-1.5"
                                    unoptimized
                                  />
                                ) : (
                                  <Building2
                                    className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground/50"
                                    strokeWidth={1.5}
                                  />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-foreground">{a.agencyName ?? "—"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {a.name ?? "—"} · {a.email}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/b2b-requests?agent=${a.id}`}
                                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-foreground transition hover:bg-muted"
                              >
                                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                                {a._count.b2bRequests} Requests
                              </Link>
                              <Link
                                href={`/admin/b2b-bookings?agent=${a.id}`}
                                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-foreground transition hover:bg-muted"
                              >
                                <CalendarCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
                                {a._count.bookings} Bookings
                              </Link>
                              <NewB2bRequestForAgentButton
                                agentId={a.id}
                                agentLabel={a.agencyName ?? a.name ?? a.email}
                              />
                            </div>
                          </div>

                          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 text-xs sm:grid-cols-4">
                            <div>
                              <p className="font-semibold text-muted-foreground">Travel Company</p>
                              <p className="mt-0.5 text-foreground">{a.agencyName ?? "—"}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">Contact Person</p>
                              <p className="mt-0.5 text-foreground">{a.name ?? "—"}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">Phone</p>
                              <p className="mt-0.5 text-foreground">{a.phone ?? "—"}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">Email</p>
                              <p className="mt-0.5 truncate text-foreground">{a.email}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">Website</p>
                              <p className="mt-0.5 text-foreground">{a.agencyWebsite ?? "—"}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">Reg No</p>
                              <p className="mt-0.5 text-foreground">{a.agencyRegistrationNumber ?? "—"}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">GSTIN</p>
                              <p className="mt-0.5 text-foreground">{a.agencyGstin ?? "—"}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">State</p>
                              <p className="mt-0.5 text-foreground">{a.agencyState ?? "—"}</p>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
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
          noun="agents"
        />
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New B2B Agent</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            {formError && (
              <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-red-600 dark:text-red-400">
                {formError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Travel Company *</label>
                <input
                  required
                  className={inputCls + " mt-1"}
                  value={form.agencyName}
                  onChange={(e) => setForm((f) => ({ ...f, agencyName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Contact Person *</label>
                <input
                  required
                  className={inputCls + " mt-1"}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Phone *</label>
                <input
                  required
                  className={inputCls + " mt-1"}
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Email *</label>
                <input
                  required
                  type="email"
                  className={inputCls + " mt-1"}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <LogoUploadField
                  onChange={(dataUrl) => setForm((f) => ({ ...f, agencyLogoDataUrl: dataUrl ?? "" }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Website</label>
                <input
                  className={inputCls + " mt-1"}
                  value={form.agencyWebsite}
                  onChange={(e) => setForm((f) => ({ ...f, agencyWebsite: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Reg No.</label>
                <input
                  className={inputCls + " mt-1"}
                  value={form.agencyRegistrationNumber}
                  onChange={(e) => setForm((f) => ({ ...f, agencyRegistrationNumber: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">GSTIN</label>
                <input
                  className={inputCls + " mt-1"}
                  value={form.agencyGstin}
                  onChange={(e) => setForm((f) => ({ ...f, agencyGstin: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">State *</label>
                <input
                  required
                  className={inputCls + " mt-1"}
                  value={form.agencyState}
                  onChange={(e) => setForm((f) => ({ ...f, agencyState: e.target.value }))}
                />
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Starts as PENDING. Login credentials are emailed to the agent once you approve them.
            </p>
            <button
              type="submit"
              disabled={isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Create Agent
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
