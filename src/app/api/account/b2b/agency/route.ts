import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Self-service completion of the optional agency fields (Website, Reg No,
// GSTIN) only — Travel Company, Contact Person, Phone, Email, Logo and State
// are all required at registration/CRM-creation time, so they're never
// "missing" here and stay admin-only edits. Lets an agent fill in a field
// they skipped, inline from their own Profile page.
const updateSchema = z
  .object({
    agencyWebsite: z.string().trim().max(200).optional(),
    agencyRegistrationNumber: z.string().trim().max(100).optional(),
    agencyGstin: z.string().trim().max(30).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Nothing to update" });

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.agencyStatus === null) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 },
    );
  }

  const data: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) data[key] = value === "" ? null : value;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { agencyWebsite: true, agencyRegistrationNumber: true, agencyGstin: true },
  });

  return NextResponse.json({ agency: updated });
}
