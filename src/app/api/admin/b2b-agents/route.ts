import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { agencyNameField, agencyStateField, parseAgencyLogo } from "@/lib/b2b/schema";

export const dynamic = "force-dynamic";

// CRM (staff-side) B2B agent listing + manual creation — the CUSTOMER-role
// User rows with agencyStatus set, filtered out of the plain /admin/users view.
// See .ai B2B architecture report (Phase 1): no separate B2BAgent table.

export async function GET(req: NextRequest) {
  const guard = await requirePermission("b2bAgents", "view");
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const take = 20;
  const skip = (page - 1) * take;

  const where: Prisma.UserWhereInput = {
    agencyStatus: { not: null },
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { agencyName: { contains: search } },
          ],
        }
      : {}),
  };

  const [agents, total] = await Promise.all([
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
        agencyStatus: true,
        agencyName: true,
        agencyWebsite: true,
        agencyRegistrationNumber: true,
        agencyGstin: true,
        agencyState: true,
        createdAt: true,
        deletedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ agents, total, page, pages: Math.ceil(total / take) });
}

// Same nine fields as the public registration form: Travel Company*, Contact
// Person*, Phone*, Email*, Logo*, Website, Reg No, GSTIN, State*.
const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().min(1, "Phone is required").max(40),
  agencyName: agencyNameField,
  agencyState: agencyStateField,
  agencyLogoDataUrl: z.string().min(1, "Upload a company logo.").max(690_000),
  agencyWebsite: z.string().trim().max(200).optional().or(z.literal("")),
  agencyRegistrationNumber: z.string().trim().max(100).optional().or(z.literal("")),
  agencyGstin: z.string().trim().max(30).optional().or(z.literal("")),
});

/**
 * Staff-initiated B2B agent creation — always starts PENDING, same as public
 * self-registration. No credentials email here: the account gets a random,
 * never-shared password now (the User.passwordHash column requires one) and
 * a real temp password is only ever generated + emailed when staff activates
 * the agent (see PATCH .../[id]) — one single activation flow for both
 * creation paths, not two.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("b2bAgents", "create");
  if (guard instanceof NextResponse) return guard;

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

  const agencyLogoUrl = parseAgencyLogo(data.agencyLogoDataUrl);
  if (!agencyLogoUrl) {
    return NextResponse.json(
      { error: { fieldErrors: { agencyLogoDataUrl: ["Logo must be a PNG image under 500KB."] } } },
      { status: 422 },
    );
  }

  const existingEmail = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingEmail) {
    return NextResponse.json(
      {
        error:
          "An account with this email address already exists. Search for the agent by name or email instead of creating a duplicate.",
      },
      { status: 409 },
    );
  }

  const existingPhone = await prisma.user.findFirst({ where: { phone: data.phone } });
  if (existingPhone) {
    return NextResponse.json(
      {
        error:
          "An account with this phone number already exists. Search for the agent instead of creating a duplicate, or confirm the correct number with the applicant.",
      },
      { status: 409 },
    );
  }

  const placeholderPassword = crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(placeholderPassword, 12);

  const agent = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: "CUSTOMER",
      mustChangePassword: true,
      agencyStatus: "PENDING",
      agencyName: data.agencyName,
      agencyState: data.agencyState,
      agencyLogoUrl,
      agencyWebsite: data.agencyWebsite || undefined,
      agencyRegistrationNumber: data.agencyRegistrationNumber || undefined,
      agencyGstin: data.agencyGstin || undefined,
    },
    select: { id: true, name: true, email: true, agencyStatus: true },
  });

  return NextResponse.json(agent, { status: 201 });
}
