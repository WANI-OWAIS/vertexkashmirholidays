import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { b2bRequestAdminCreateSchema } from "@/lib/b2b/requestSchema";

export const dynamic = "force-dynamic";

// CRM (staff-side) B2B request listing + create-on-behalf. Deliberately a
// separate module/route tree from /admin/leads and /api/admin/leads — B2B
// requests (Lead rows with b2bAgentId set) never appear in, or share
// filters/pagination state with, the normal lead workflow.

export async function GET(req: NextRequest) {
  const guard = await requirePermission("b2bRequests", "view");
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const agentId = searchParams.get("agentId")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const take = 20;
  const skip = (page - 1) * take;

  const where: Prisma.LeadWhereInput = { b2bAgentId: { not: null } };
  if (status && status !== "ALL") where.status = status as Prisma.LeadWhereInput["status"];
  if (agentId && agentId !== "ALL") where.b2bAgentId = agentId;

  const [requests, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
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
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({ requests, total, page, pages: Math.ceil(total / take) });
}

/**
 * CRM creates a request on the selected agent's behalf. Any existing B2B
 * agent (any agencyStatus, not just ACTIVE) may be targeted — staff have
 * elevated trust the self-service ACTIVE-only gate doesn't extend to (e.g.
 * logging a request phoned in before an agent's approval finishes).
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("b2bRequests", "create");
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = b2bRequestAdminCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const data = parsed.data;

  const agent = await prisma.user.findUnique({
    where: { id: data.agentId },
    select: { id: true, agencyStatus: true },
  });
  if (!agent || agent.agencyStatus === null) {
    return NextResponse.json({ error: "B2B agent not found" }, { status: 404 });
  }

  const lead = await prisma.lead.create({
    data: {
      name: data.guestName,
      phone: data.guestPhone,
      source: "MANUAL",
      adults: data.pax ?? 1,
      children: data.children,
      days: data.days,
      rooms: data.rooms,
      budget: data.budget,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
      notes: data.notes,
      b2bAgentId: data.agentId,
      createdById: guard.user.id as string,
    },
    select: { id: true, name: true, status: true, createdAt: true },
  });

  return NextResponse.json(lead, { status: 201 });
}
