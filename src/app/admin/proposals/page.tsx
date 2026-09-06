import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ProposalsClient } from "@/components/admin/proposal/ProposalsClient";
import type { ProposalSummary } from "@/types/proposal";

export const metadata: Metadata = { title: "Proposals — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminProposalsPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !(await can(role, "proposals", "view"))) {
    redirect("/admin/dashboard");
  }

  const isAdmin = role === "SUPERADMIN" || role === "ADMIN";

  const items = await prisma.proposalItinerary.findMany({
    where: isAdmin ? {} : { ownerId: session!.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { name: true } },
    },
  });

  const summaries: ProposalSummary[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    status: i.status,
    ownerId: i.ownerId,
    ownerName: i.owner?.name ?? null,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  }));

  const [canCreate, canDelete] = await Promise.all([
    can(role, "proposals", "create"),
    can(role, "proposals", "delete"),
  ]);

  return (
    <ProposalsClient
      initialItems={summaries}
      showOwner={isAdmin}
      canCreate={canCreate}
      canDelete={canDelete}
    />
  );
}
