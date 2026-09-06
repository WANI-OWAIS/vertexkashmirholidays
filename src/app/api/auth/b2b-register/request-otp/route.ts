import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendMail, otpVerificationHtml, otpVerificationText } from "@/lib/mail";
import {
  OTP_TTL_MS,
  OTP_TTL_MINUTES,
  RESEND_COOLDOWN_MS,
  RESEND_COOLDOWN_SECONDS,
  cleanupExpiredOtps,
  generateOtp,
  hashOtp,
} from "@/lib/auth/otp";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/ratelimit";
import { checkBotSignals } from "@/lib/security/formGuard";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { b2bEmailOtpRequestSchema } from "@/lib/b2b/schema";

export const dynamic = "force-dynamic";

/**
 * Inline email verification, step 1 — email only. Fired the moment an agent
 * confirms their email address in the registration form, before the rest of
 * the (long) application is even filled in. Same shape as the Careers
 * apply-form's request-otp (src/app/api/careers/apply/request-otp): no
 * account or application record exists yet, only a pending EmailOtp row
 * (purpose B2B_REGISTER).
 */
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req);
    const ipLimit = await rateLimit(`otp-req:b2b:${ip}`, 10, "10 m");
    if (!ipLimit.success) {
      return tooManyRequests(ipLimit);
    }

    const body = await req.json().catch(() => null);

    const bot = checkBotSignals(body);
    if (!bot.ok) {
      // Bots get a generic success response — no signal that they were caught.
      return NextResponse.json(
        { success: true, cooldown: RESEND_COOLDOWN_SECONDS, ttlMinutes: OTP_TTL_MINUTES },
        { status: 200 },
      );
    }

    const parsed = b2bEmailOtpRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Validation failed" },
        { status: 400 },
      );
    }
    const email = parsed.data.email;

    const captchaOk = await verifyTurnstile(parsed.data.turnstileToken, ip);
    if (!captchaOk) {
      return NextResponse.json(
        { error: "Verification failed. Please refresh and try again." },
        { status: 403 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        {
          error:
            "An account with this email address already exists. Please sign in instead, or contact our B2B partnerships team if you need help accessing it.",
        },
        { status: 409 },
      );
    }

    await cleanupExpiredOtps();

    const pending = await prisma.emailOtp.findUnique({ where: { email } });
    if (pending) {
      const elapsed = Date.now() - pending.lastSentAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return NextResponse.json(
          { error: `Please wait ${retryAfter}s before requesting another code.`, retryAfter },
          { status: 429 },
        );
      }
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

    await prisma.emailOtp.upsert({
      where: { email },
      create: { email, codeHash, purpose: "B2B_REGISTER", expiresAt, lastSentAt: now, attempts: 0 },
      update: { codeHash, purpose: "B2B_REGISTER", expiresAt, lastSentAt: now, attempts: 0 },
    });

    try {
      const result = await sendMail({
        to: email,
        subject: "Your Vertex Kashmir Holidays B2B partner verification code",
        html: otpVerificationHtml({ name: "there", code, ttlMinutes: OTP_TTL_MINUTES }),
        text: otpVerificationText({ name: "there", code, ttlMinutes: OTP_TTL_MINUTES }),
      });
      if (!result.delivered) {
        console.error("[b2b-register/request-otp] email not delivered", {
          email,
          skipped: result.skipped,
          rejected: result.rejected,
        });
        await prisma.emailOtp.delete({ where: { email } }).catch(() => {});
        return NextResponse.json(
          { error: "Could not send the verification code. Please try again." },
          { status: 502 },
        );
      }
    } catch (sendErr) {
      console.error("[b2b-register/request-otp] sendMail threw:", sendErr);
      await prisma.emailOtp.delete({ where: { email } }).catch(() => {});
      return NextResponse.json(
        { error: "Could not send the verification code. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { success: true, cooldown: RESEND_COOLDOWN_SECONDS, ttlMinutes: OTP_TTL_MINUTES },
      { status: 200 },
    );
  } catch (err) {
    console.error("[b2b-register/request-otp] error:", err);
    return NextResponse.json(
      { error: "Could not send the verification code. Please try again." },
      { status: 500 },
    );
  }
}

