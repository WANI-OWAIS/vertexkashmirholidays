import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { MAX_VERIFY_ATTEMPTS, cleanupExpiredOtps, verifyOtpHash } from "@/lib/auth/otp";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
import { b2bEmailOtpVerifySchema } from "@/lib/b2b/schema";

export const dynamic = "force-dynamic";

/**
 * Inline email verification, step 2 — verifies the emailed code. Does not
 * create or touch any B2B application record; it proves email ownership and
 * issues a one-time verificationToken (returned once, stored only as a
 * bcrypt hash) that the real application submit (POST /api/auth/b2b-register)
 * must present before it accepts the application. Same shape as the Careers
 * apply-form's verify-otp (src/app/api/careers/apply/verify-otp).
 */
export async function POST(req: NextRequest) {
  try {
    const ipLimit = await rateLimit(`otp-verify:b2b:${clientIp(req)}`, 30, "10 m");
    if (!ipLimit.success) {
      return tooManyRequests(ipLimit, "Too many attempts. Please try again later.");
    }

    const body = await req.json().catch(() => null);
    const parsed = b2bEmailOtpVerifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Validation failed" },
        { status: 400 },
      );
    }
    const { email, code } = parsed.data;

    await cleanupExpiredOtps();

    // Scoped to purpose: B2B_REGISTER so a stray register/reset/careers OTP
    // row for the same email can never be verified here (and vice versa).
    const record = await prisma.emailOtp.findUnique({ where: { email } });
    if (!record || record.purpose !== "B2B_REGISTER") {
      return NextResponse.json(
        { error: "No verification in progress. Please request a new code." },
        { status: 400 },
      );
    }

    if (record.expiresAt < new Date()) {
      await prisma.emailOtp.delete({ where: { email } });
      return NextResponse.json(
        { error: "This code has expired. Please request a new one." },
        { status: 400 },
      );
    }

    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      await prisma.emailOtp.delete({ where: { email } });
      return NextResponse.json(
        { error: "Too many incorrect attempts. Please request a new verification code." },
        { status: 429 },
      );
    }

    const valid = await verifyOtpHash(code, record.codeHash);
    if (!valid) {
      const updated = await prisma.emailOtp.update({
        where: { email },
        data: { attempts: { increment: 1 } },
      });
      const remaining = Math.max(0, MAX_VERIFY_ATTEMPTS - updated.attempts);
      return NextResponse.json(
        {
          error:
            remaining > 0
              ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
              : "Too many incorrect attempts. Please request a new verification code.",
          remaining,
        },
        { status: 400 },
      );
    }

    // Code verified — issue a one-time verification token (shown once, stored
    // only as a bcrypt hash) and burn the code itself so it cannot be reused.
    const verificationToken = randomBytes(32).toString("hex");
    const resetTokenHash = await bcrypt.hash(verificationToken, 12);

    await prisma.emailOtp.update({
      where: { email },
      data: { verifiedAt: new Date(), resetTokenHash },
    });

    return NextResponse.json({ success: true, verificationToken }, { status: 200 });
  } catch (err) {
    console.error("[b2b-register/verify-otp] error:", err);
    return NextResponse.json(
      { error: "Could not verify the code. Please try again." },
      { status: 500 },
    );
  }
}
