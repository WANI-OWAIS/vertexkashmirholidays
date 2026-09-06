import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { randomUUID } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { isStaff } from "@/lib/rbac";
import { isAllowedCustomerEmailDomain } from "@/lib/auth/validation";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { env } from "@/lib/env";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  // Optional Turnstile token (verified only when TURNSTILE_SECRET_KEY is set).
  turnstileToken: z.string().optional(),
});

// Shared by both the redirect-based Google provider (signIn callback below)
// and the One Tap Credentials provider (authorize below) — the exact same
// customer-only / staff-blocked / public-domain rule applies no matter which
// Google surface the user came through.
async function resolveGoogleCustomer(email: string, name?: string | null) {
  if (!isAllowedCustomerEmailDomain(email)) return null;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.deletedAt || isStaff(existing.role)) return null;
    await prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
    return {
      id: existing.id,
      role: existing.role,
      mustChangePassword: existing.mustChangePassword,
      agencyStatus: existing.agencyStatus,
    };
  }

  // First Google sign-in for this email — provision a CUSTOMER account. No
  // password is set yet; the account holder can set one later via the
  // forgot-password flow if they ever want to log in with a password too.
  const created = await prisma.user.create({
    data: {
      name: name ?? email.split("@")[0],
      email,
      passwordHash: await bcrypt.hash(randomUUID(), 12),
      role: "CUSTOMER",
      lastLoginAt: new Date(),
    },
  });
  return {
    id: created.id,
    role: created.role,
    mustChangePassword: created.mustChangePassword,
    agencyStatus: created.agencyStatus,
  };
}

// Google's published signing keys, used to verify One Tap ID tokens
// server-side (jose caches/refreshes this set internally).
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

async function verifyGoogleIdToken(idToken: string) {
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID,
    });
    return payload as { email?: string; email_verified?: boolean; name?: string };
  } catch {
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  callbacks: {
    ...authConfig.callbacks,

    // Google is a customer-only convenience login — never a staff auth path.
    // Credentials sign-in (both the password provider and google-one-tap
    // below) is unaffected — each gates itself inside its own authorize().
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      const email = user.email?.toLowerCase();
      if (!email || profile?.email_verified === false) return false;

      const resolved = await resolveGoogleCustomer(email, user.name);
      if (!resolved) return false;

      user.id = resolved.id;
      user.role = resolved.role;
      user.mustChangePassword = resolved.mustChangePassword;
      user.agencyStatus = resolved.agencyStatus;
      return true;
    },
  },

  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
    }),
    // Google One Tap: the client posts the signed ID token it received from
    // Google's Identity Services script (see GoogleOneTap.tsx); it never goes
    // through the OAuth redirect dance the provider above uses. Modeled as a
    // second Credentials provider so it reuses NextAuth's normal session
    // issuance — the ID token itself is Google's proof of identity, verified
    // here against Google's public keys before we trust it.
    Credentials({
      id: "google-one-tap",
      name: "Google One Tap",
      credentials: { credential: { label: "Credential", type: "text" } },
      async authorize(raw) {
        const credential = typeof raw?.credential === "string" ? raw.credential : null;
        if (!credential) return null;

        const payload = await verifyGoogleIdToken(credential);
        if (!payload) return null;
        const email = payload.email?.toLowerCase();
        if (!email || payload.email_verified === false) return null;

        const resolved = await resolveGoogleCustomer(email, payload.name);
        if (!resolved) return null;

        return {
          id: resolved.id,
          email,
          name: payload.name ?? null,
          role: resolved.role,
          mustChangePassword: resolved.mustChangePassword,
          agencyStatus: resolved.agencyStatus,
        };
      },
    }),
    Credentials({
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        // ── Brute-force throttle + CAPTCHA ──────────────────────────────────
        // All failures below return a generic null (NextAuth surfaces a single
        // "CredentialsSignin") so we never reveal whether the email exists.
        const ip = request ? clientIp(request) : "unknown";
        const email = parsed.data.email.toLowerCase();

        // Backoff: cap attempts per IP and per account within a window. A locked
        // window naturally clears, so this is backoff rather than a hard lock.
        const ipOk = await rateLimit(`login:ip:${ip}`, 20, "10 m");
        const acctOk = await rateLimit(`login:acct:${email}`, 10, "15 m");
        if (!ipOk.success || !acctOk.success) {
          return null;
        }

        // CAPTCHA (enforced only when TURNSTILE_SECRET_KEY is configured).
        const captchaOk = await verifyTurnstile(parsed.data.turnstileToken, ip);
        if (!captchaOk) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: {
            email,
          },
        });

        if (!user) {
          return null;
        }

        // Soft-deleted accounts cannot sign in.
        if (user.deletedAt) {
          return null;
        }

        const validPassword = await bcrypt.compare(parsed.data.password, user.passwordHash);

        if (!validPassword) {
          return null;
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          agencyStatus: user.agencyStatus,
        };
      },
    }),
  ],
});
