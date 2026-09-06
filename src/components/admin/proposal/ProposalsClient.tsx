"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Trash2, Pencil, Copy, FileText } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/atoms/badge";
import type { ProposalSummary, ProposalStatus } from "@/types/proposal";

const STATUSES: ("ALL" | ProposalStatus)[] = ["ALL", "DRAFT", "SENT"];

const STATUS_VARIANT: Record<ProposalStatus, BadgeProps["variant"]> = {
  DRAFT: "default",
  SENT: "warning",
};

interface Props {
  initialItems: ProposalSummary[];
  showOwner: boolean;
  canCreate: boolean;
  canDelete: boolean;
}

export function ProposalsClient({ initialItems, showOwner, canCreate, canDelete }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("ALL");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = initialItems.filter((i) => {
    const matchesStatus = statusFilter === "ALL" || i.status === statusFilter;
    const matchesSearch = search === "" || i.title.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  function remove(item: ProposalSummary) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/proposals/${item.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        toast.success("Proposal deleted.");
        setConfirmDelete(null);
        router.refresh();
      } catch {
        toast.error("Failed to delete.");
      }
    });
  }

  function duplicate(item: ProposalSummary) {
    startTransition(async () => {
      try {
        const full = await fetch(`/api/proposals/${item.id}`).then((r) => r.json());
        const res = await fetch("/api/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: `${item.title} (copy)`, status: "DRAFT", data: full.data }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        toast.success("Proposal duplicated.");
        router.push(`/admin/proposals/${json.id}`);
      } catch {
        toast.error("Failed to duplicate.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-extrabold text-foreground">Proposals</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {initialItems.length} saved {initialItems.length === 1 ? "proposal" : "proposals"}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/admin/proposals/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New Proposal
          </Link>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title…"
              className="w-full rounded-xl border border-border bg-muted/50 py-2 pl-9 pr-4 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as (typeof STATUSES)[number])}
            className="rounded-xl border border-border bg-muted/50 py-2 pl-4 pr-8 text-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          >
            {STATUSES.map((sVal) => (
              <option key={sVal} value={sVal}>
                {sVal === "ALL" ? "All Statuses" : sVal}
              </option>
            ))}
          </select>
        </div>

        <div className="divide-y divide-border border-t border-border">
          {filtered.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No proposals yet.</p>
              {canCreate && (
                <Link
                  href="/admin/proposals/new"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  <Plus className="h-4 w-4" /> Create your first proposal
                </Link>
              )}
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link href={`/admin/proposals/${item.id}`} className="min-w-0 flex-1 group">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-foreground group-hover:text-primary">
                      {item.title}
                    </p>
                    <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {showOwner && item.ownerName ? `${item.ownerName} · ` : ""}
                    Updated{" "}
                    {new Date(item.updatedAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </Link>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Link
                    href={`/admin/proposals/${item.id}`}
                    className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-primary"
                    aria-label="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  {canCreate && (
                    <button
                      onClick={() => duplicate(item)}
                      disabled={isPending}
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                      aria-label="Duplicate"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete &&
                    (confirmDelete === item.id ? (
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => remove(item)}
                          disabled={isPending}
                          className="rounded-lg bg-red-600 px-2 py-1 text-[12px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="rounded-lg border border-border px-2 py-1 text-[12px] font-semibold text-muted-foreground"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(item.id)}
                        className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-red-500"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
