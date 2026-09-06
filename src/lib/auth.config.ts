import type { NextAuthConfig } from "next-auth";
import { isStaff, requiresMfa, type Role, type B2BAgentStatus } from "@/lib/rbac";

export const authConfig = {
  pages: {
    signIn: "/login",
  },

  // Derive the OAuth callback/cookie host from the actual incoming request
  // rather than a static AUTH_URL/NEXTAUTH_URL env var. Vercel auto-enables
  // this in production (hence Google sign-in only ever misbehaved locally) —
  // but this repo's .env also sets NEXTAUTH_URL to the beta domain (it's the
  // fallback base URL for transactional email links in src/lib/mail.ts) while
  // AUTH_URL is localhost, and Auth.js has no principled way to reconcile two
  // conflicting canonical URLs. trustHost sidesteps that entirely for auth.
  trustHost: true,

  session: {
    strategy: "jwt",
  },

  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl;
      const isAdminPath = pathname.startsWith("/admin");
      const isAccountPath = pathname.startsWith("/account");

      // Coarse, edge-safe gating. Fine-grained per-module/action checks happen in
      // server layouts, API routes (requirePermission), and the UI.
      if (!isAdminPath && !isAccountPath) return true;

      const role = auth?.user?.role;

      // Not authenticated → bounce to /login (NextAuth adds callbackUrl).
      if (!auth?.user) return false;

      if (isAdminPath) {
        if (!isStaff(role)) {
          // Logged-in customer trying to reach the admin panel → send to their area.
          return Response.redirect(new URL("/account", nextUrl.origin));
        }
        // SUPERADMIN/ADMIN must clear the TOTP challenge (enroll or verify)
        // before reaching anything else in the admin panel.
        if (auth.user.mfaPending && pathname !== "/admin/mfa") {
          return Response.redirect(new URL("/admin/mfa", nextUrl.origin));
        }
        return true;
      }

      // isAccountPath: any authenticated user may access their account area, but a
      // customer holding a system-issued temp password must set a new one first.
      // Coarse edge gate — the server page + API also enforce this authoritatively.
      if (auth.user.mustChangePassword && pathname !== "/account/change-password") {
        return Response.redirect(new URL("/account/change-password", nextUrl.origin));
      }
      return true;
    },

    jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.mustChangePassword = user.mustChangePassword ?? false;
        // Derived purely from role, not from whether they've enrolled yet —
        // an unenrolled SUPERADMIN/ADMIN is still "pending" (forced to the
        // enroll view of /admin/mfa); an enrolled one is "pending" until they
        // pass the challenge. Both cases start true on every fresh sign-in.
        token.mfaPending = requiresMfa(user.role);
        // Null for every non-B2B-agent user. Carried through purely so
        // capability-gated routes can read it from the session without an
        // extra DB round-trip — never used to block sign-in here.
        token.agencyStatus = user.agencyStatus ?? null;
      }

      // After the customer sets a new password, or staff clear their MFA
      // challenge, the client calls update() so the JWT (and thus the
      // middleware gate) immediately reflects the cleared flag.
      if (trigger === "update" && session && typeof session === "object") {
        const patch = session as { mustChangePassword?: unknown; mfaPending?: unknown };
        if ("mustChangePassword" in patch) {
          token.mustChangePassword = Boolean(patch.mustChangePassword);
        }
        if ("mfaPending" in patch) {
          token.mfaPending = Boolean(patch.mfaPending);
        }
      }

      return token;
    },

    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as Role;
        session.user.id = token.id as string;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.mfaPending = Boolean(token.mfaPending);
        session.user.agencyStatus = (token.agencyStatus as B2BAgentStatus | undefined) ?? null;
      }

      return session;
    },
  },

  providers: [],
} satisfies NextAuthConfig;
