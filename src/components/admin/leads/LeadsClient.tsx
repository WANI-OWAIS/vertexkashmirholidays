"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  ExternalLink,
  Trash2,
  Pencil,
  Users,
  CalendarClock,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePagination } from "@/components/admin/ui/usePagination";
import { TablePagination } from "@/components/admin/ui/TablePagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/organisms/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/atoms/tooltip";
import { PageHeader } from "@/components/ui/molecules/page-header";
import { AdminSearchInput } from "@/components/ui/molecules/admin-search-input";
import { StatCard } from "@/components/ui/molecules/stat-card";
import { InlineConfirmActions } from "@/components/ui/organisms/inline-confirm-actions";

// IN_PROGRESS is a real LeadStatus value at the type level (B2B-request-only —
// see prisma/schema.prisma), included so this type structurally matches
// Prisma's Lead.status; the query feeding this page excludes B2B rows (see
// admin/leads/page.tsx), so it never actually renders here.
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

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  category: LeadCategory | null;
  adults: number;
  status: LeadStatus;
  startDate: Date | string | null;
  followUpAt: Date | string | null;
  updatedAt: Date | string;
  negotiatedAmount: number | null;
  tokenAmount: number | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  createdAt: Date | string;
}

interface StaffUser {
  id: string;
  name: string | null;
  email: string;
}

interface Stats {
  total: number;
  todayFollowUps: number;
  converted: number;
}

interface Props {
  initialLeads: Lead[];
  totalCount: number;
  staffUsers: StaffUser[];
  stats: Stats;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isAdmin: boolean;
  initialIpFilter?: string;
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

const SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: "Website",
  MANUAL: "Manual",
  GOOGLE_ADS: "Google",
  META_ADS: "Meta",
  THIRD_PARTY: "3rd Party",
  REFERRAL: "Referral",
};

export function LeadsClient({
  initialLeads,
  totalCount,
  staffUsers,
  stats,
  canCreate,
  canEdit,
  canDelete,
  isAdmin,
  initialIpFilter,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState("ALL");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = initialLeads.filter((l) => {
    if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
    if (sourceFilter !== "ALL" && l.source !== sourceFilter) return false;
    if (isAdmin && assigneeFilter !== "ALL") {
      if (assigneeFilter === "UNASSIGNED" && l.assignedTo !== null) return false;
      if (assigneeFilter !== "UNASSIGNED" && l.assignedTo?.id !== assigneeFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (
        !l.name.toLowerCase().includes(q) &&
        !l.phone.includes(q) &&
        !(l.email?.toLowerCase().includes(q) ?? false) &&
        !l.id.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const { page, setPage, pageSize, changePageSize, pageCount, total, pageItems } =
    usePagination(filtered);

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        toast.success("Lead deleted.");
        router.refresh();
      } catch {
        toast.error("Failed to delete lead.");
      } finally {
        setConfirmDelete(null);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="Leads"
        description={`${totalCount} total leads`}
        action={
          canCreate && (
            <Link
              href="/admin/leads/new"
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-primary/25 shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Lead
            </Link>
          )
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Leads"
          value={stats.total}
          icon={Users}
          accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Today's Follow-ups"
          value={stats.todayFollowUps}
          icon={CalendarClock}
          accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
        <StatCard
          label="Converted"
          value={stats.converted}
          icon={TrendingUp}
          accent="bg-green-500/10 text-green-600 dark:text-green-400"
        />
      </div>

      {initialIpFilter && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-2.5 text-xs">
          <span className="font-semibold text-amber-800 dark:text-amber-300">
            Showing leads from IP: <span className="font-mono">{initialIpFilter}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              router.push("/admin/leads");
              router.refresh();
            }}
            className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors font-semibold"
          >
            <X className="w-3.5 h-3.5" /> Clear filter
          </button>
        </div>
      )}

      <div className="bg-card rounded-2xl border border-border shadow-sm">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 p-4">
          <AdminSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, phone, email, ref..."
            className="min-w-[180px]"
          />

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-auto min-w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="NEW">New</SelectItem>
              <SelectItem value="CONNECTED">Connected</SelectItem>
              <SelectItem value="NOT_CONNECTED">Not Connected</SelectItem>
              <SelectItem value="QUALIFIED">Qualified</SelectItem>
              <SelectItem value="NEGOTIATION">Negotiation</SelectItem>
              <SelectItem value="ON_HOLD">On Hold</SelectItem>
              <SelectItem value="CONVERTED">Converted</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-auto min-w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Sources</SelectItem>
              <SelectItem value="WEBSITE">Website</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
              <SelectItem value="GOOGLE_ADS">Google</SelectItem>
              <SelectItem value="META_ADS">Meta</SelectItem>
              <SelectItem value="THIRD_PARTY">3rd Party</SelectItem>
              <SelectItem value="REFERRAL">Referral</SelectItem>
            </SelectContent>
          </Select>

          {isAdmin && (
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="w-auto min-w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Staff</SelectItem>
                <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                {staffUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name ?? u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <p className="text-xs text-muted-foreground self-center shrink-0">
            {filtered.length} results
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-t border-b border-border">
                {["Ref", "Lead", "Assigned To", "Status", "Source", "Last Updated", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-[12px] font-bold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    {search || statusFilter !== "ALL" || sourceFilter !== "ALL"
                      ? "No leads match your filters."
                      : "No leads yet. Create your first one!"}
                  </td>
                </tr>
              ) : (
                pageItems.map((lead) => (
                  <tr
                    key={lead.id}
                    className={cn(
                      "hover:bg-muted/50 transition-colors",
                      confirmDelete === lead.id && "bg-red-500/5",
                    )}
                  >
                    {/* Ref */}
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-[12px] font-semibold text-foreground"
                        title={lead.id}
                      >
                        #{lead.id.slice(-8).toUpperCase()}
                      </span>
                    </td>

                    {/* Lead */}
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-xs truncate max-w-[160px]">
                          {lead.name}
                        </p>
                        <p className="text-[12px] text-muted-foreground">{lead.phone}</p>
                        {lead.email && (
                          <p className="text-[12px] text-muted-foreground truncate max-w-[160px]">
                            {lead.email}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Assigned To — name + email */}
                    <td className="px-4 py-3">
                      {lead.assignedTo ? (
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate max-w-[140px]">
                            {lead.assignedTo.name ?? "—"}
                          </p>
                          <p className="text-[12px] text-muted-foreground truncate max-w-[140px]">
                            {lead.assignedTo.email}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "text-[12px] font-bold px-2 py-0.5 rounded-full",
                          STATUS_STYLES[lead.status],
                        )}
                      >
                        {lead.status.replace(/_/g, " ")}
                      </span>
                    </td>

                    {/* Source */}
                    <td className="px-4 py-3">
                      <span className="text-[12px] bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                        {SOURCE_LABELS[lead.source]}
                      </span>
                    </td>

                    {/* Last Updated */}
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(lead.updatedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <InlineConfirmActions
                        confirming={confirmDelete === lead.id}
                        onConfirm={() => handleDelete(lead.id)}
                        onCancel={() => setConfirmDelete(null)}
                        pending={isPending}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={`/admin/leads/${lead.id}`}
                              aria-label={`View lead detail for ${lead.name}`}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>View detail</TooltipContent>
                        </Tooltip>
                        {canEdit && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Link
                                href={`/admin/leads/${lead.id}/edit`}
                                aria-label={`Edit lead ${lead.name}`}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                        )}
                        {canDelete && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => setConfirmDelete(lead.id)}
                                aria-label={`Delete lead ${lead.name}`}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        )}
                      </InlineConfirmActions>
                    </td>
                  </tr>
                ))
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
          noun="leads"
        />
      </div>
    </div>
  );
}
