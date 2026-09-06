// Domain schema for the Hotel Rates module — an internal supplier reference
// (NOT bookable inventory). One row per hotel, one current rate per hotel —
// Sales/Admin always maintain a single season's rate and overwrite it when
// the season changes, rather than keeping a history of past rates. `data`
// is a Json column (see prisma/schema.prisma -> HotelSupplier for why).
// `isActive`, `category`, `recommended`, `lastRateRequestSentAt` are plain
// relational columns (not nested in `data`) since those are exactly the
// fields Sales filters/sorts by.
import { z } from "zod";

// Vertex's internal commercial classification — not the hotel's star rating.
export const HOTEL_CATEGORIES = ["BUDGET", "DELUXE", "PREMIUM", "LUXURY"] as const;
export type HotelCategoryValue = (typeof HOTEL_CATEGORIES)[number];

// Display labels use standard star-rating terminology (Budget/3 Star/4
// Star/5 Star) — the enum keys themselves (BUDGET/DELUXE/PREMIUM/LUXURY)
// are unchanged internally (no migration/data-backfill needed for a label
// change; existing stored rows are just recomputed under the new rule the
// next time each hotel is saved, same as any other rate-driven recompute).
export const HOTEL_CATEGORY_LABELS: Record<HotelCategoryValue, string> = {
  BUDGET: "Budget",
  DELUXE: "3 Star",
  PREMIUM: "4 Star",
  LUXURY: "5 Star",
};

// Display/sort order for category — Budget -> 3 Star -> 4 Star -> 5 Star, cheapest first.
export const CATEGORY_SORT_ORDER: Record<HotelCategoryValue, number> = {
  BUDGET: 0,
  DELUXE: 1,
  PREMIUM: 2,
  LUXURY: 3,
};

// Category is derived from the DELUXE room's MAP net rate (see
// getDeluxeMapRate), not chosen manually — this is Vertex's actual
// commercial classification rule: 0-2,000 Budget, 2,001-3,500 3 Star,
// 3,501-7,000 4 Star, 7,001+ 5 Star. Recomputed every time the rate table is
// saved. A hotel with no Deluxe row (or no MAP figure on it yet) defaults to
// Budget until one is entered.
export function computeCategoryFromMap(deluxeMapNet: number | null | undefined): HotelCategoryValue {
  if (deluxeMapNet == null) return "BUDGET";
  if (deluxeMapNet <= 2000) return "BUDGET";
  if (deluxeMapNet <= 3500) return "DELUXE";
  if (deluxeMapNet <= 7000) return "PREMIUM";
  return "LUXURY";
}

// Initial destination set. Extend this array to add a destination later —
// no migration needed, `destination` is a plain filtered string column.
export const HOTEL_DESTINATIONS = [
  "Srinagar",
  "Pahalgam",
  "Gulmarg / Tangmarg",
  "Houseboats",
  "Sonamarg",
  "Gurez",
  "Leh / Ladakh",
  "Kargil",
  "Katra / Vaishno Devi",
  "Uri / Kaman Setu",
] as const;
export type HotelDestination = (typeof HOTEL_DESTINATIONS)[number];

// Blank string / undefined -> null, string -> number, for optional money and
// numeric-string form fields. Same pattern as the `coord` preprocess in
// src/app/api/destinations/route.ts.
const nonNegativeMoney = z.preprocess(
  (v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v) : v),
  z.number().min(0).nullable(),
);

const dateString = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().nullable(),
);

const nullableText = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().nullable(),
);

// One row of the rate table — "Deluxe", "Super Deluxe", "Extra Bed", etc. are
// all just room-type rows with their own EP/CP/MAP, per the business's actual
// rate-sheet format. No AP column (dropped — the business only quotes off
// EP/CP/MAP now).
export const roomRateRowSchema = z.object({
  roomType: z.string().trim().min(1, "Room type is required").max(60),
  ep: nonNegativeMoney,
  cp: nonNegativeMoney,
  map: nonNegativeMoney,
});
export type RoomRateRow = z.infer<typeof roomRateRowSchema>;

export const EMPTY_ROOM_RATE_ROW: RoomRateRow = { roomType: "", ep: null, cp: null, map: null };

// The rate table for a hotel: a shared validity date + one or more room-type
// rows. `rooms` always has at least 1 row so the editor UI never has to
// handle "no rows" as a distinct empty state.
const newRateShape = z.object({
  validTo: dateString,
  rooms: z.array(roomRateRowSchema).min(1),
});

// Legacy shape (pre room-table redesign): one flat EP/CP/MAP/AP + extraBed
// per hotel. Auto-upgraded to the new `rooms` shape at READ time below, via
// preprocess — so existing hotels never need a database backfill. AP data in
// old records is intentionally dropped (no AP column in the new table); a
// nonzero extraBed becomes its own "Extra Bed" row (mapped into the MAP
// column, since the old field had no meal-plan breakdown of its own).
const legacyRateShape = z.object({
  validTo: dateString,
  mealPlans: z.object({
    EP: nonNegativeMoney,
    CP: nonNegativeMoney,
    MAP: nonNegativeMoney,
    AP: nonNegativeMoney.optional(),
  }),
  extraBed: nonNegativeMoney,
});

function isLegacyRateShape(value: unknown): value is z.infer<typeof legacyRateShape> {
  return !!value && typeof value === "object" && "mealPlans" in value;
}

// Non-null object type — every existing call site (getMinMapRate,
// rateNeedsRefresh, EMPTY_RATE, ...) already expresses "no rate" as
// `HotelRate | null` at the call site, not by making this type itself
// nullable. `rateSchema` below is what's actually nullable, since it's the
// one used directly against the (nullable) stored value.
export type HotelRate = z.infer<typeof newRateShape>;

export const rateSchema = z.preprocess((value) => {
  if (value == null) return null;
  if (!isLegacyRateShape(value)) return value; // already the new shape (or invalid — let the schema reject it)

  const legacy = legacyRateShape.parse(value);
  const rooms: RoomRateRow[] = [];
  const { EP, CP, MAP } = legacy.mealPlans;
  if (EP != null || CP != null || MAP != null) {
    rooms.push({ roomType: "Standard", ep: EP, cp: CP, map: MAP });
  }
  if (legacy.extraBed != null) {
    rooms.push({ roomType: "Extra Bed", ep: null, cp: null, map: legacy.extraBed });
  }
  // A legacy rate object with every field blank (some hotels have one on file
  // from an earlier "Add Rate" click that was never filled in) has nothing to
  // convert — represent it as no rate at all, same as a hotel that never had
  // one. A synthetic empty-roomType row would fail roomRateRowSchema's
  // required-roomType check (real incident: 2 hotels failed to parse here).
  if (rooms.length === 0) return null;
  return { validTo: legacy.validTo, rooms };
}, newRateShape.nullable());

export const EMPTY_RATE: HotelRate = { validTo: null, rooms: [EMPTY_ROOM_RATE_ROW] };

// The cheapest room's MAP rate — drives the "needs a rate request" check and
// the price-sort column (category classification uses getDeluxeMapRate
// instead, below). Null when no room row has a MAP figure yet.
export function getMinMapRate(rate: HotelRate | null | undefined): number | null {
  if (!rate) return null;
  const maps = rate.rooms.map((r) => r.map).filter((m): m is number => m != null);
  return maps.length > 0 ? Math.min(...maps) : null;
}

// The MAP rate for whichever room row is named "Deluxe" (case-insensitive
// substring match, so "Deluxe Room" / "Super Deluxe" etc. all count) — drives
// category classification (see computeCategoryFromMap) and is also shown as
// its own table column, since Deluxe is the room type Sales quotes most
// often. Null when the hotel has no such room row or it has no MAP figure.
export function getDeluxeMapRate(rate: HotelRate | null | undefined): number | null {
  if (!rate) return null;
  const room = rate.rooms.find((r) => r.roomType.toLowerCase().includes("deluxe"));
  return room?.map ?? null;
}

// Meal-plan abbreviation legend, shown at the top of the Hotel Rates page.
export const MEAL_PLAN_LEGEND: { code: "EP" | "CP" | "MAP"; meaning: string }[] = [
  { code: "EP", meaning: "Room only" },
  { code: "CP", meaning: "Room + breakfast" },
  { code: "MAP", meaning: "Room + breakfast + one of lunch/dinner" },
];

export const propertySchema = z.object({
  location: nullableText,
  contactPerson: nullableText,
  phone: nullableText,
  email: nullableText,
  mapUrl: nullableText,
  // One service/amenity per line (e.g. "Central heating\nCentral A/C\nBuffet
  // System"), rendered as a bullet list. Lives in the existing `data` Json
  // blob — no migration needed for a new field here.
  services: nullableText,
});
export type HotelProperty = z.infer<typeof propertySchema>;

export const hotelDataSchema = z.object({
  property: propertySchema,
  rate: rateSchema, // already nullable — see rateSchema's own preprocess/target
  // Google rating text (e.g. "4.7★ / 2,698 reviews") shown in the Rating column.
  rating: nullableText,
});
export type HotelData = z.infer<typeof hotelDataSchema>;

// Extracts the leading number from a free-text rating string (e.g. "4.7★ /
// 2,698 reviews" -> 4.7) for the rating sort. Null when nothing parses.
export function parseRatingValue(rating: string | null | undefined): number | null {
  if (!rating) return null;
  const match = rating.match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export const createHotelSupplierSchema = z.object({
  hotelName: z.string().min(2, "Hotel name is required"),
  destination: z.enum(HOTEL_DESTINATIONS),
  category: z.enum(HOTEL_CATEGORIES),
  isActive: z.boolean().default(true),
  recommended: z.boolean().default(false),
  // Manual tally of bookings sent to this hotel — staff-entered, not derived
  // from any Booking relation (HotelSupplier is a supplier reference, not
  // bookable inventory — see the module comment at the top of this file).
  bookingsCount: z.coerce.number().int().min(0).default(0),
  data: hotelDataSchema,
});
export type CreateHotelSupplierInput = z.infer<typeof createHotelSupplierSchema>;

export const patchHotelSupplierSchema = z.object({
  hotelName: z.string().min(2).optional(),
  destination: z.enum(HOTEL_DESTINATIONS).optional(),
  category: z.enum(HOTEL_CATEGORIES).optional(),
  isActive: z.boolean().optional(),
  recommended: z.boolean().optional(),
  bookingsCount: z.coerce.number().int().min(0).optional(),
  data: hotelDataSchema.optional(),
});
export type PatchHotelSupplierInput = z.infer<typeof patchHotelSupplierSchema>;

// Splits the stored multiline `services` text into the bullet list shown in
// the table — one entry per non-blank line.
export function parseServices(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// True when a hotel is due for a rate-request email: no room has a MAP rate
// on file, no valid-till date on file (can't confirm it's still current), or
// its validity has lapsed. Shared by the client (enables/disables the Send
// button) and the API route (re-checked server-side so a disabled button
// can't be bypassed from devtools).
export function rateNeedsRefresh(rate: HotelRate | null, today?: string): boolean {
  const minMap = getMinMapRate(rate);
  if (minMap == null) return true;
  if (!rate?.validTo) return true;
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  return rate.validTo < todayStr;
}
