// Public "verified properties" trust counts — aggregate numbers only, never
// names. HotelSupplier is a private B2B supplier reference table (admin-only
// elsewhere in the app), so these functions must stay count-only wherever
// they're used on the public site.
//
// Both queries are wrapped in unstable_cache because they're read from many
// public pages (the home hero + every destination detail page) — same
// rationale as getSiteSettings() in src/lib/siteSettings.ts. Busted via the
// existing admin "flush cache" action (see src/lib/cache.ts) rather than on
// every individual supplier edit; a 30-minute fallback TTL covers the rest.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// HotelSupplier.destination is free text (not a relation to Destination), so
// a few destinations use a different label in supplier records than the
// Destination page's own name (e.g. "Gulmarg" the destination vs "Gulmarg /
// Tangmarg" the supplier-record destination). Only list the exceptions here —
// every other destination matches by exact name already.
const DESTINATION_SUPPLIER_ALIASES: Record<string, string[]> = {
  gulmarg: ["Gulmarg / Tangmarg"],
  "gurez-valley": ["Gurez"],
  leh: ["Leh / Ladakh"],
};

export const getVerifiedPropertiesCount = unstable_cache(
  () => prisma.hotelSupplier.count({ where: { isActive: true } }),
  ["hotel-supplier-total-count"],
  { revalidate: 1800, tags: ["hotel-supplier-counts"] },
);

export const getVerifiedPropertiesCountForDestination = unstable_cache(
  (destinationSlug: string, destinationName: string) => {
    const names = [destinationName, ...(DESTINATION_SUPPLIER_ALIASES[destinationSlug] ?? [])];
    return prisma.hotelSupplier.count({
      where: { isActive: true, destination: { in: names } },
    });
  },
  ["hotel-supplier-count-by-destination"],
  { revalidate: 1800, tags: ["hotel-supplier-counts"] },
);
