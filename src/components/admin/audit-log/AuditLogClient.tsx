"use client";

import { Fragment, useState, useTransition } from "react";
import { ChevronDown, History, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/admin/ui/TablePagination";
import type { AuditAction } from "@prisma/client";

export interface AuditLogRow {
  id: string;
  action: AuditAction;
  targetUserId: string | null;
  targetUserName: string | null;
  targetUserEmail: string | null;
  performedById: string | null;
  performedByName: string;
  metadata: unknown;
  createdAt: string | Date;
}

interface Props {
  initialLogs: AuditLogRow[];
  initialTotal: number;
  initialPage: number;
  initialPageSize: number;
}

const ACTION_LABELS: Record<AuditAction, string> = {
  ROLE_CHANGE: "Role Change",
  PERMISSION_EDIT: "Permission Edit",
  USER_SOFT_DELETE: "User Deleted",
  USER_PERMANENT_DELETE: "User Permanently Deleted",
  USER_RESTORE: "User Restored",
  SALARY_PREPARED: "Salary Prepared",
  SALARY_REVIEW: "Salary Moved to Review",
  SALARY_ACKNOWLEDGED: "Salary Acknowledged",
  SALARY_PAID: "Salary Paid",
  SALARY_CORRECTED: "Paid Salary Corrected",
  LEAVE_APPLIED: "Leave Applied",
  LEAVE_APPROVED: "Leave Approved",
  LEAVE_REJECTED: "Leave Rejected",
  B2B_AGENT_STATUS_CHANGE: "B2B Agent Status Change",
};

const ACTION_STYLES: Record<AuditAction, string> = {
  ROLE_CHANGE: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  PERMISSION_EDIT: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  USER_SOFT_DELETE: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  USER_PERMANENT_DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
  USER_RESTORE: "bg-green-500/10 text-green-600 dark:text-green-400",
  SALARY_PREPARED: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  SALARY_REVIEW: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  SALARY_ACKNOWLEDGED: "bg-green-500/10 text-green-600 dark:text-green-400",
  SALARY_PAID: "bg-green-500/10 text-green-600 dark:text-green-400",
  SALARY_CORRECTED: "bg-red-500/10 text-red-600 dark:text-red-400",
  LEAVE_APPLIED: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  LEAVE_APPROVED: "bg-green-500/10 text-green-600 dark:text-green-400",
  LEAVE_REJECTED: "bg-red-500/10 text-red-600 dark:text-red-400",
  B2B_AGENT_STATUS_CHANGE: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
};

const selectCls =
  "pl-3 pr-8 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition bg-muted/50 appearance-none";

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditLogClient({
  initialLogs,
  initialTotal,
  initialPage,
  initialPageSize,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [logs, setLogs] = useState(initialLogs);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPageState] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [actionFilter, setActionFilter] = useState<"ALL" | AuditAction>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Append-only, potentially-unbounded log — unlike bounded entities (leads,
  // bookings) elsewhere in admin, this fetches only the current page from the
  // server on every filter/page change rather than loading everything once.
  function load(next: { page?: number; pageSize?: number; action?: "ALL" | AuditAction }) {
    const nextPage = next.page ?? page;
    const nextPageSize = next.pageSize ?? pageSize;
    const nextAction = next.action ?? actionFilter;

    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(nextPageSize),
    });
    if (nextAction !== "ALL") params.set("action", nextAction);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);

    startTransition(async () => {
      const res = await fetch(`/api/audit-log?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setPageState(nextPage);
      setPageSizeState(nextPageSize);
    });
  }

  function changeAction(next: "ALL" | AuditAction) {
    setActionFilter(next);
    load({ page: 1, action: next });
  }

  function changeDate() {
    load({ page: 1 });
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-extrabold text-foreground text-xl flex items-center gap-2">
          <History className="w-5 h-5 text-primary" /> Audit Log
        </h2>
        <p className="text-muted-foreground text-xs mt-0.5">
          {total} recorded actions · role changes, permission edits, and user
          deletion/restoration
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative">
            <select
              value={actionFilter}
              onChange={(e) => changeAction(e.target.value as "ALL" | AuditAction)}
              className={selectCls}
            >
              <option value="ALL">All Actions</option>
              {(Object.keys(ACTION_LABELS) as AuditAction[]).map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a]}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              onBlur={changeDate}
              className="py-2 px-2.5 text-xs border border-border rounded-xl bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onBlur={changeDate}
              className="py-2 px-2.5 text-xs border border-border rounded-xl bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>

          {isPending && <span className="text-xs text-muted-foreground">Loading…</span>}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted border-t border-b border-border">
                {["When", "Action", "Performed By", "Target", ""].map((h) => (
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
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ShieldAlert className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-sm font-bold text-foreground">No audit entries found</p>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        {actionFilter !== "ALL" || dateFrom || dateTo
                          ? "No rows match your current filters — try clearing a filter or widening the date range."
                          : "Role changes, permission edits, and user deletion/restoration will appear here as they happen."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((row) => {
                  const expanded = expandedId === row.id;
                  return (
                    <Fragment key={row.id}>
                      <tr className="hover:bg-muted/50 transition-colors">
                        <td
                          className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap"
                          title={fmtDate(row.createdAt)}
                        >
                          {fmtDate(row.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "text-[12px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                              ACTION_STYLES[row.action],
                            )}
                          >
                            {ACTION_LABELS[row.action]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-foreground">
                          {row.performedByName}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {row.targetUserName ?? row.targetUserEmail ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {row.metadata != null && (
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : row.id)}
                              className="text-xs font-semibold text-primary hover:underline"
                            >
                              {expanded ? "Hide" : "Details"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={5} className="px-4 pb-3">
                            <pre className="rounded-lg bg-muted p-3 text-[12px] text-muted-foreground overflow-x-auto">
                              {JSON.stringify(row.metadata, null, 2)}
                            </pre>
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
          onPage={(p) => load({ page: p })}
          onPageSize={(size) => load({ page: 1, pageSize: size })}
          noun="entries"
        />
      </div>
    </div>
  );
}
