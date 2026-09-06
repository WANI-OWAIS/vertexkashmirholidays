import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { B2bAgentsClient } from "@/components/admin/b2b/B2bAgentsClient";

export const metadata: Metadata = { title: "B2B Agents — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminB2bAgentsPage() {
  const agents = await prisma.user.findMany({
    where: { agencyStatus: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      agencyStatus: true,
      agencyName: true,
      agencyLogoUrl: true,
      agencyWebsite: true,
      agencyRegistrationNumber: true,
      agencyGstin: true,
      agencyState: true,
      createdAt: true,
      _count: {
        select: {
          b2bRequests: true,
          bookings: { where: { deletedAt: null } },
        },
      },
    },
  });

  return <B2bAgentsClient initialAgents={agents} />;
}
