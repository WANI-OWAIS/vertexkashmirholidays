import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requirePermission("users", "view");
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";
  // Optional role scope (e.g. "CUSTOMER" for the admin/users page, or a
  // comma-separated staff-role list for admin/employees) — no filter when
  // omitted, same as this endpoint's original unscoped behaviour.
  const roleParam = searchParams.get("role")?.trim();
  const roles = roleParam ? (roleParam.split(",").filter(Boolean) as Role[]) : undefined;
  // Soft-deleted rows are excluded by default; includeDeleted=1 shows both,
  // matching the admin list pages' "Show deleted" checkbox semantics.
  const includeDeleted = searchParams.get("includeDeleted") === "1";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const take = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));
  const skip = (page - 1) * take;

  const where: Prisma.UserWhereInput = {
    ...(roles ? { role: { in: roles } } : {}),
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        deletedAt: true,
        createdAt: true,
        lastLoginAt: true,
        _count: { select: { bookings: true, reviews: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, pages: Math.ceil(total / take) });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  // Employees only — staff roles. SUPERADMIN is gated to superadmin callers below.
  role: z.enum(["SUPERADMIN", "ADMIN", "SALES", "EDITOR"]),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  bookingConversionPct: z.coerce.number().min(0).max(100).nullable().optional(),
  designation: z.string().trim().max(80).nullable().optional(),
  employeeCode: z.string().trim().max(40).nullable().optional(),
  monthlySalary: z.coerce.number().min(0).nullable().optional(),
  joiningDate: z.string().trim().nullable().optional(),
  personalEmail: z.string().trim().email("Enter a valid email").nullable().optional().or(z.literal("")),
  personalPhone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
});

/** Create a new staff member (employee) with a password set by the admin. */
export async function POST(req: NextRequest) {
  const session = await requirePermission("users", "create");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }
  const data = parsed.data;

  // Only a SUPERADMIN may create another SUPERADMIN.
  if (data.role === "SUPERADMIN" && session.user?.role !== "SUPERADMIN") {
    return NextResponse.json(
      { error: "Only a Super Admin can create a Super Admin" },
      { status: 403 },
    );
  }

  try {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const created = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ? data.phone : null,
        role: data.role as Role,
        passwordHash,
        // Force the new employee to set their own password on first login.
        mustChangePassword: true,
        bookingConversionPct: data.bookingConversionPct ?? null,
        designation: data.designation ?? null,
        employeeCode: data.employeeCode ?? null,
        monthlySalary: data.monthlySalary ?? null,
        joiningDate: data.joiningDate ? new Date(data.joiningDate) : null,
        personalEmail: data.personalEmail ? data.personalEmail : null,
        personalPhone: data.personalPhone ?? null,
        address: data.address ?? null,
      },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("P2002")) {
      return NextResponse.json(
        { error: "That email or employee ID is already in use" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 });
  }
}
