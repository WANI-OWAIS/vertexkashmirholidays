// Single authoritative "can this staff member even open this module" check.
// Call from a module's route-segment layout.tsx so every page under it — list,
// detail, new, edit — is protected without each page needing its own check
// (the historical gap: several admin pages had no view-permission check at
// all, relying only on the sidebar hiding their nav link).

import type { ReactElement } from "react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { MODULES, type ModuleKey, type Role } from "@/lib/rbac";
import { AccessDenied } from "@/components/admin/AccessDenied";

export type ModuleGuardResult =
  | { ok: true; role: Role; userId: string }
  | { ok: false; page: ReactElement };

export async function requireModuleView(module: ModuleKey): Promise<ModuleGuardResult> {
  const session = await auth();
  const role = session?.user?.role as Role | undefined;
  const userId = session?.user?.id as string | undefined;

  if (!role || !userId || !(await can(role, module, "view"))) {
    const label = MODULES.find((m) => m.key === module)?.label ?? module;
    return { ok: false, page: <AccessDenied moduleLabel={label} /> };
  }
  return { ok: true, role, userId };
}

// Sub-resource routes with no MODULES entry of their own — gated by their
// parent feature's permission instead.
const MODULE_PATH_ALIASES: Record<string, ModuleKey> = {
  "/admin/blog-categories": "blogs",
  "/admin/faq-categories": "faqs",
  // B2B Bookings is a filtered view of the same Booking data the main
  // Bookings module manages, not a separate resource — see
  // src/app/admin/b2b-bookings/page.tsx.
  "/admin/b2b-bookings": "bookings",
  // B2B itinerary editor — the href is "/admin/b2b-itineraries", which does
  // not start with the "itinerary" module's own href ("/admin/itinerary"),
  // so it was never resolvable and this route-level guard denied everyone
  // (including SUPERADMIN — resolveModuleForPath returning null makes the
  // admin layout's `allowed` check false regardless of role/permissions).
  // The page itself already gates on the "itinerary" permission; this alias
  // makes the outer layout guard agree instead of contradicting it.
  "/admin/b2b-itineraries": "itinerary",
};

/**
 * Maps the current request path to the module that owns it, so the admin
 * root layout can run the view-permission check exactly once instead of
 * every module folder repeating (and risking a copy-pasted, stale) module
 * key in its own layout.tsx.
 */
export function resolveModuleForPath(pathname: string): ModuleKey | null {
  for (const [prefix, key] of Object.entries(MODULE_PATH_ALIASES)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key;
  }
  const mod = MODULES.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`));
  return mod?.key ?? null;
}
