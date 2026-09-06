import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { computeNetSalary } from "@/lib/salary/compute";
import type { AuditAction } from "@prisma/client";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  monthlySalary: z.coerce.number().min(0).optional(),
  paidDays: z.coerce.number().min(0).optional(),
  absentDays: z.coerce.number().min(0).optional(),
  paidLeaveDays: z.coerce.number().min(0).optional(),
  unpaidLeaveDays: z.coerce.number().min(0).optional(),
  deductions: z.coerce.number().min(0).optional(),
  // Commission itself always comes from BookingCommission — Finance never
  // overwrites it directly, only via this clearly-labelled adjustment field.
  commissionAdjustment: z.coerce.number().optional(),
  status: z.enum(["REVIEW", "PAID"]).optional(),
  paymentReference: z.string().trim().max(120).nullable().optional(),
  // Required when editing a field on an already-PAID record.
  correctionReason: z.string().trim().min(3).max(300).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requirePermission("salary", "edit");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  const existing = await prisma.salaryRecord.findUnique({
    where: { id },
    include: { employee: { select: { id: true, name: true, email: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Salary record not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  const isFieldEdit =
    d.monthlySalary !== undefined ||
    d.paidDays !== undefined ||
    d.absentDays !== undefined ||
    d.paidLeaveDays !== undefined ||
    d.unpaidLeaveDays !== undefined ||
    d.deductions !== undefined ||
    d.commissionAdjustment !== undefined;

  // Once PAID, status is terminal — only a reasoned, logged correction of the
  // underlying fields is allowed, never a silent rewrite or an un-paying.
  if (existing.status === "PAID") {
    if (d.status !== undefined) {
      return NextResponse.json(
        { error: "A paid salary's status cannot be changed." },
        { status: 422 },
      );
    }
    if (isFieldEdit && !d.correctionReason) {
      return NextResponse.json(
        { error: "A reason is required to correct a paid salary record." },
        { status: 422 },
      );
    }
  }

  const performedById = guard.user.id as string;
  const performedByName = (guard.user.name ?? guard.user.email) as string;

  const result = await prisma.$transaction(async (tx) => {
    const monthlySalary = d.monthlySalary ?? existing.monthlySalary;
    const deductions = d.deductions ?? existing.deductions;
    const commissionAdjustment = d.commissionAdjustment ?? existing.commissionAdjustment;
    const netSalary = computeNetSalary({
      monthlySalary,
      commission: existing.commission,
      commissionAdjustment,
      deductions,
    });

    const updated = await tx.salaryRecord.update({
      where: { id },
      data: {
        ...(d.monthlySalary !== undefined ? { monthlySalary: d.monthlySalary } : {}),
        ...(d.paidDays !== undefined ? { paidDays: d.paidDays } : {}),
        ...(d.absentDays !== undefined ? { absentDays: d.absentDays } : {}),
        ...(d.paidLeaveDays !== undefined ? { paidLeaveDays: d.paidLeaveDays } : {}),
        ...(d.unpaidLeaveDays !== undefined ? { unpaidLeaveDays: d.unpaidLeaveDays } : {}),
        ...(d.deductions !== undefined ? { deductions: d.deductions } : {}),
        ...(d.commissionAdjustment !== undefined
          ? { commissionAdjustment: d.commissionAdjustment }
          : {}),
        ...(isFieldEdit ? { netSalary } : {}),
        ...(d.status === "REVIEW" ? { status: "REVIEW" as const } : {}),
        ...(d.status === "PAID"
          ? {
              status: "PAID" as const,
              paidAt: new Date(),
              paidById: performedById,
              paymentReference: d.paymentReference ?? null,
            }
          : {}),
        ...(existing.status === "PAID" && isFieldEdit
          ? { correctedAt: new Date(), correctedById: performedById, correctionReason: d.correctionReason }
          : {}),
      },
    });

    // Marking PAID settles exactly the BookingCommission rows this payroll
    // claimed — completing the EXPECTED -> EARNED -> PAID lifecycle.
    if (d.status === "PAID") {
      await tx.bookingCommission.updateMany({
        where: { salaryRecordId: id, status: "EARNED" },
        data: { status: "PAID", paidAt: new Date(), paidReference: d.paymentReference ?? id },
      });
    }

    const auditAction: AuditAction | null =
      d.status === "PAID"
        ? "SALARY_PAID"
        : d.status === "REVIEW"
          ? "SALARY_REVIEW"
          : existing.status === "PAID" && isFieldEdit
            ? "SALARY_CORRECTED"
            : null;

    if (auditAction) {
      await tx.auditLog.create({
        data: {
          action: auditAction,
          targetUserId: existing.employee.id,
          targetUserName: existing.employee.name,
          targetUserEmail: existing.employee.email,
          performedById,
          performedByName,
          metadata: {
            salaryRecordId: id,
            salaryMonth: existing.salaryMonth,
            ...(auditAction === "SALARY_CORRECTED"
              ? {
                  reason: d.correctionReason,
                  before: {
                    monthlySalary: existing.monthlySalary,
                    paidDays: existing.paidDays,
                    absentDays: existing.absentDays,
                    paidLeaveDays: existing.paidLeaveDays,
                    unpaidLeaveDays: existing.unpaidLeaveDays,
                    deductions: existing.deductions,
                    commissionAdjustment: existing.commissionAdjustment,
                    netSalary: existing.netSalary,
                  },
                  after: {
                    monthlySalary: updated.monthlySalary,
                    paidDays: updated.paidDays,
                    absentDays: updated.absentDays,
                    paidLeaveDays: updated.paidLeaveDays,
                    unpaidLeaveDays: updated.unpaidLeaveDays,
                    deductions: updated.deductions,
                    commissionAdjustment: updated.commissionAdjustment,
                    netSalary: updated.netSalary,
                  },
                }
              : {}),
            ...(auditAction === "SALARY_PAID" ? { paymentReference: d.paymentReference ?? null } : {}),
          },
        },
      });
    }

    return updated;
  });

  return NextResponse.json(result);
}
