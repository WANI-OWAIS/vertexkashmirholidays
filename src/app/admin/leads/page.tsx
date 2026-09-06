import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/rbac";
import { LeadsClient } from "@/components/admin/leads/LeadsClient";

export const metadata: Metadata = { title: "Leads — Admin" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ ip?: string }> };

export default async function AdminLeadsPage({ searchParams }: PageProps) {
  const { ip } = await searchParams;
  const ipFilter = ip && /^[\d.:a-fA-F]+$/.test(ip) ? ip : undefined;

  const session = await auth();
  const role = (session?.user?.role ?? "ADMIN") as Role;
  const userId = session?.user?.id ?? "";
  const isAdminOrSuper = role === "SUPERADMIN" || role === "ADMIN";

  // B2B requests (b2bAgentId set) live exclusively under /admin/b2b-requests —
  // excluded here so they never mix into the normal lead workflow/stats.
  const scopeWhere = { b2bAgentId: null, ...(isAdminOrSuper ? {} : { assignedToId: userId }) };
  const ipWhere = ipFilter ? { ipAddress: ipFilter } : {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [leads, staffUsers, total, todayFollowUps, converted, canCreate, canEdit, canDelete] =
    await Promise.all([
      prisma.lead.findMany({
        where: { ...scopeWhere, ...ipWhere },
        orderBy: { updatedAt: "desc" },
        take: ipFilter ? undefined : 200,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          source: true,
          category: true,
          adults: true,
          status: true,
          startDate: true,
          followUpAt: true,
          updatedAt: true,
          negotiatedAmount: true,
          tokenAmount: true,
          assignedToId: true,
          assignedTo: { select: { id: true, name: true, email: true } },
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        where: { role: { in: ["SUPERADMIN", "ADMIN", "SALES"] }, deletedAt: null },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      }),
      prisma.lead.count({ where: scopeWhere }),
      prisma.lead.count({ where: { ...scopeWhere, followUpAt: { gte: today, lt: tomorrow } } }),
      prisma.lead.count({ where: { ...scopeWhere, status: "CONVERTED" } }),
      can(role, "leads", "create"),
      can(role, "leads", "edit"),
      can(role, "leads", "delete"),
    ]);

  const stats = { total, todayFollowUps, converted };

  return (
    <LeadsClient
      initialLeads={leads}
      totalCount={total}
      staffUsers={staffUsers}
      stats={stats}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
      isAdmin={isAdminOrSuper}
      initialIpFilter={ipFilter}
    />
  );
}
