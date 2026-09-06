// Shared B2B request status vocabulary — used by the CRM list/detail pages
// and the agent-facing account pages, so the label/color for a given
// LeadStatus never drifts between surfaces. Mirrors the LeadStatus subset a
// b2bAgentId-set Lead can actually hold (see prisma/schema.prisma) — the
// other 5 sales-pipeline-only values never appear on a B2B row.
export type B2bRequestStatus = "NEW" | "IN_PROGRESS" | "CONVERTED" | "REJECTED";

export const B2B_STATUS_LABELS: Record<B2bRequestStatus, string> = {
  NEW: "Pending",
  IN_PROGRESS: "In Progress",
  CONVERTED: "Converted",
  REJECTED: "Rejected",
};

export const B2B_STATUS_STYLES: Record<B2bRequestStatus, string> = {
  NEW: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  IN_PROGRESS: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  CONVERTED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-300",
};
