import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { B2bRequestsClient } from "@/components/admin/b2b/B2bRequestsClient";

export const metadata: Metadata = { title: "B2B Requests — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminB2bRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string }>;
}) {
  const { agent } = await searchParams;
  const [requests, agents] = await Promise.all([
    prisma.lead.findMany({
      // Converted requests are now bookings — see B2B Bookings — so this
      // list only ever holds a request still awaiting/undergoing action.
      where: { b2bAgentId: { not: null }, status: { not: "CONVERTED" } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        phone: true,
        adults: true,
        children: true,
        days: true,
        rooms: true,
        budget: true,
        startDate: true,
        endDate: true,
        status: true,
        createdById: true,
        createdAt: true,
        b2bAgent: { select: { id: true, name: true, agencyName: true, email: true } },
      },
    }),
    prisma.user.findMany({
      where: { agencyStatus: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, agencyName: true, email: true, agencyStatus: true },
    }),
  ]);

  return <B2bRequestsClient initialRequests={requests} agents={agents} initialAgentFilter={agent} />;
}
