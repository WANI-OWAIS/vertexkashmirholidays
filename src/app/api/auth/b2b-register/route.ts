import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { B2B_REGISTER_TOKEN_TTL_MS } from "@/lib/auth/otp";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
import { isSameOrigin } from "@/lib/security/origin";
import { b2bRegisterSchema, parseAgencyLogo } from "@/lib/b2b/schema";

export const dynamic = "force-dynamic";

/**
 * Final step of public B2B partner registration: the full nine-field
 * application, gated on a verificationToken proving the email was already
 * confirmed inline (see request-otp/verify-otp in this same directory — the
 * same "verify now, prove it later" shape as the Careers apply form). Creates
 * the User at agencyStatus PENDING with a random, never-shared password —
 * real credentials are only ever emailed once staff activates the account
 * (see PATCH /api/admin/b2b-agents/[id]).
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIp(req);
  const ipLimit = await rateLimit(`b2b-register:submit:${ip}`, 10, "10 m");
  if (!ipLimit.success) {
    return tooManyRequests(ipLimit, "Too many requests. Please try again in a little while.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = b2bRegisterSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return NextResponse.json(
      { error: "Please check the highlighted fields and try again.", fieldErrors },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const agencyLogoUrl = parseAgencyLogo(data.agencyLogoDataUrl);
  if (!agencyLogoUrl) {
    return NextResponse.json(
      {
        error: "Logo must be a PNG image under 500KB.",
        fieldErrors: { agencyLogoDataUrl: ["Invalid logo file."] },
      },
      { status: 400 },
    );
  }

  // Proof of email verification: the OTP row must be B2B_REGISTER-purposed,
  // verified, and the token must match the hash issued at verify-otp time —
  // same shape as the Careers apply form / forgot-password reset step.
  const otpRow = await prisma.emailOtp.findUnique({ where: { email: data.email } });
  if (!otpRow || otpRow.purpose !== "B2B_REGISTER" || !otpRow.verifiedAt || !otpRow.resetTokenHash) {
    return NextResponse.json(
      { error: "Please verify your email again before submitting." },
      { status: 400 },
    );
  }
  if (Date.now() - otpRow.verifiedAt.getTime() > B2B_REGISTER_TOKEN_TTL_MS) {
    await prisma.emailOtp.delete({ where: { email: data.email } });
    return NextResponse.json(
      { error: "Your email verification has expired. Please verify again." },
      { status: 400 },
    );
  }
  const tokenValid = await bcrypt.compare(data.verificationToken, otpRow.resetTokenHash);
  if (!tokenValid) {
    return NextResponse.json(
      { error: "Please verify your email again before submitting." },
      { status: 400 },
    );
  }

  const existingEmail = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingEmail) {
    await prisma.emailOtp.delete({ where: { email: data.email } });
    return NextResponse.json(
      {
        error:
          "An account with this email address already exists. Please sign in instead, or contact our B2B partnerships team if you need help accessing it.",
      },
      { status: 409 },
    );
  }
  const existingPhone = await prisma.user.findFirst({ where: { phone: data.phone } });
  if (existingPhone) {
    return NextResponse.json(
      {
        error:
          "An account with this phone number already exists. Please use a different contact number, or reach out to our B2B partnerships team if you believe this is an error.",
      },
      { status: 409 },
    );
  }

  const placeholderPassword = crypto.randomBytes(9).toString("base64url");
  const passwordHash = await bcrypt.hash(placeholderPassword, 12);

  await prisma.user.create({
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
  });

  await prisma.emailOtp.delete({ where: { email: data.email } });

  return NextResponse.json({ success: true }, { status: 201 });
}
