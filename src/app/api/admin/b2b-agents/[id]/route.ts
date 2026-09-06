import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { sendB2bAgentActivationEmail } from "@/lib/b2b/notify";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// Only these two target states are settable through this route — PENDING is
// exclusively the state a new agent starts in (registration or CRM creation),
// never a transition target. Valid transitions:
//   PENDING   -> ACTIVE
//   ACTIVE    -> SUSPENDED
//   SUSPENDED -> ACTIVE
const patchSchema = z.object({
  agencyStatus: z.enum(["ACTIVE", "SUSPENDED"]),
});

/**
 * Approve (PENDING/SUSPENDED -> ACTIVE) or suspend (ACTIVE -> SUSPENDED) a B2B
 * agent. Never deletes the User — historical Lead/Booking/Payment relationships
 * (once those exist, in a later phase) stay intact regardless of status.
 *
 * Every transition TO ACTIVE is the one point in a B2B agent's lifecycle where
 * real login credentials are generated and emailed — registration (public or
 * CRM-created) never sends a password, only this does, exactly the same
 * temp-password/mustChangePassword convention used for staff-created customer
 * accounts elsewhere in this codebase (see sendCustomerCredentialsEmail).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("b2bAgents", "edit");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing || existing.agencyStatus === null) {
    return NextResponse.json({ error: "B2B agent not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const { agencyStatus } = parsed.data;

  if (agencyStatus === existing.agencyStatus) {
    return NextResponse.json({ error: `Agent is already ${agencyStatus}` }, { status: 422 });
  }
  // SUSPENDED is only reachable from ACTIVE (suspending a PENDING application
  // isn't a real state — reject it with REJECTED-equivalent handling belongs to
  // a later phase alongside B2B requests, not here).
  if (agencyStatus === "SUSPENDED" && existing.agencyStatus !== "ACTIVE") {
    return NextResponse.json(
      { error: "Only an active agent can be suspended" },
      { status: 422 },
    );
  }

  const performedById = guard.user.id as string;
  const performedByName = (guard.user.name ?? guard.user.email) as string;

  // Precomputed outside the transaction — pure CPU-bound hashing, no DB
  // dependency, no reason to hold the transaction open for it.
  const activating = agencyStatus === "ACTIVE";
  const tempPassword = activating ? crypto.randomBytes(9).toString("base64url") : null;
  const passwordHash = tempPassword ? await bcrypt.hash(tempPassword, 12) : null;

  const updated = await prisma.$transaction(async (tx) => {
    const agent = await tx.user.update({
      where: { id },
      data: {
        agencyStatus,
        ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}),
      },
      select: { id: true, name: true, email: true, agencyStatus: true, agencyName: true },
    });
    await tx.auditLog.create({
      data: {
        action: "B2B_AGENT_STATUS_CHANGE",
        targetUserId: id,
        targetUserName: existing.name,
        targetUserEmail: existing.email,
        performedById,
        performedByName,
        metadata: { fromStatus: existing.agencyStatus, toStatus: agencyStatus },
      },
    });
    return agent;
  });

  // Best-effort — never blocks/fails the status change itself.
  if (tempPassword) {
    await sendB2bAgentActivationEmail(
      updated.email,
      updated.name ?? "",
      updated.agencyName ?? updated.name ?? "",
      tempPassword,
    );
  }

  return NextResponse.json(updated);
}
