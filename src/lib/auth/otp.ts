// Email-OTP helpers for secure account registration.
//
// The account is only created in `User` AFTER the OTP is verified. Until then a
// pending row lives in `EmailOtp` with the chosen password already bcrypt-hashed
// and the OTP stored as a bcrypt hash (never plaintext). See the API routes
// under src/app/api/auth/register/{request-otp,verify-otp}.

import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Email-domain + password + phone validation now lives in ./validation (it is
// pure and shared with the client form). Re-export the domain helpers here so
// existing server imports keep working.
export {
  ALLOWED_EMAIL_DOMAINS,
  isAllowedEmailDomain,
  PUBLIC_DOMAINS_GENERIC_MESSAGE,
} from "./validation";

// ── Policy constants ─────────────────────────────────────────────────────────

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // registration OTP valid for 10 minutes
export const RESET_OTP_TTL_MS = 5 * 60 * 1000; // password-reset OTP valid for 5 minutes
export const RESEND_COOLDOWN_MS = 60 * 1000; // min 60s between code requests
export const MAX_VERIFY_ATTEMPTS = 5; // wrong-code attempts before lockout

export const OTP_TTL_MINUTES = OTP_TTL_MS / 60_000;
export const RESET_OTP_TTL_MINUTES = RESET_OTP_TTL_MS / 60_000;
export const RESEND_COOLDOWN_SECONDS = RESEND_COOLDOWN_MS / 1_000;

// How long a verified reset session (the resetToken from verify-otp) stays
// usable for the follow-up "set new password" call. Same window as the OTP
// itself — short enough that a stale, verified-but-abandoned session can't
// be used to change a password long after the fact.
export const RESET_TOKEN_TTL_MS = RESET_OTP_TTL_MS;

// Same "verified, proof token issued" shape as RESET, but for the Careers
// apply form (src/components/careers/JobApplyForm.tsx). Given a longer window
// here deliberately: the candidate typically verifies email early in a long
// multi-field form (plus a resume upload), so RESET_TOKEN_TTL_MS's 5 minutes
// would expire before most people finish filling it out.
export const CAREERS_TOKEN_TTL_MS = 30 * 60 * 1000;

// Same "verified, proof token issued" shape, for the public B2B partner
// registration form (src/components/b2b/B2bRegistrationForm.tsx). Same
// reasoning as CAREERS_TOKEN_TTL_MS: the agent verifies their email inline
// early on, then keeps filling in the rest of a multi-field application
// (plus a logo upload) before the real submit — a short window would expire
// before most people finish.
export const B2B_REGISTER_TOKEN_TTL_MS = 30 * 60 * 1000;

// Same "verified, proof token issued" shape, for the public booking checkout
// (src/components/booking/BookingForm.tsx). 30 minutes covers OTP verify →
// reviewing the trip/price → Razorpay checkout, and lines up with the
// abandoned-PENDING-booking cleanup window (STALE_BOOKING_MINUTES in
// src/lib/bookings/cleanup.ts) so a token and its order go stale together.
export const BOOKING_TOKEN_TTL_MS = 30 * 60 * 1000;

// ── OTP generation & hashing ─────────────────────────────────────────────────

/** Cryptographically-secure, zero-padded 6-digit code (000000–999999). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, "0");
}

export function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export function verifyOtpHash(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

/** Best-effort removal of expired pending OTP rows. Called on each request. */
export async function cleanupExpiredOtps(): Promise<void> {
  try {
    await prisma.emailOtp.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch (err) {
    // Cleanup is non-critical — never let it break the request flow.
    console.error("[otp] cleanup failed:", err);
  }
}

// Rate limiting for these OTP routes uses the shared Upstash-backed limiter in
// src/lib/ratelimit.ts (durable across serverless instances), not a
// per-process limiter defined here.
