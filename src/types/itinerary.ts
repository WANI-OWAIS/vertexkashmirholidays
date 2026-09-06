import { z } from "zod";

/**
 * Single source of truth for the itinerary document shape.
 * Every repeatable row carries a stable `id` so React keys and immutable
 * updates are reliable. The same zod schema validates on the client (editor)
 * and on the server (API), so persisted JSON can never drift from the type.
 */

export const metaSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
});

export const daySchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  image: z.string(), // path under /itinerary/*.webp, an /uploads/* path, or a full URL
  meta: z.array(metaSchema),
  // e.g. "Wed 10 Jun" — shown beside the day title. Defaulted so itineraries
  // saved before this field existed still parse as blank.
  dateLabel: z.string().default(""),
});

/**
 * Fallback hotel/room photos — declared here (above the schemas) so both
 * `hotelSchema`'s per-hotel `image` and `itineraryDataSchema`'s `hotelImages`
 * default can use it: an itinerary saved before either field existed gets
 * real, exportable image paths the moment it's next loaded, not just a
 * visual-only fallback that silently exports as empty until someone manually
 * replaces a slot. Also used as DEFAULT_ITINERARY_DATA's starting images.
 */
export const DEFAULT_HOTEL_IMAGES = [
  "/itinerary/srinagar.webp",
  "/itinerary/gulmarg.webp",
  "/itinerary/pahalgam.webp",
];

export const hotelSchema = z.object({
  id: z.string(),
  destination: z.string(),
  hotelDetails: z.string(),
  nights: z.string(),
  roomType: z.string(),
  // Defaulted so itineraries saved before these fields existed still parse —
  // same reasoning as itineraryDataSchema's `hotelImages` default below.
  // `rooms` is also range-checked since it's a whole count, not free text —
  // the editor clamps on blur, this is the hard backstop on save.
  rooms: z
    .string()
    .default("1")
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, {
      message: "Rooms must be a whole number of at least 1.",
    }),
  // Free text, not a code — stores the same sentence shown on the PDF
  // (e.g. "Room + breakfast + one of lunch/dinner") so there's no separate
  // code-to-meaning mapping to keep in sync. Legacy itineraries that still
  // have a plain "MAP"/"CP"/"EP" code keep working: the PDF looks the code
  // up via MEAL_PLAN_LEGEND and falls back to the raw value otherwise.
  mealType: z.string().default("Room + breakfast + one of lunch/dinner"),
  // Per-hotel photo shown on its card — defaulted (not required) so
  // itineraries saved before this field existed still parse, same reasoning
  // as `hotelImages` below.
  image: z.string().default(DEFAULT_HOTEL_IMAGES[0]),
  // Whole-count fields, same clamp-on-blur + hard-backstop pattern as `rooms`.
  extraBed: z
    .string()
    .default("0")
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0, {
      message: "Extra Bed must be a whole number of at least 0.",
    }),
  childWithBed: z
    .string()
    .default("0")
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 0, {
      message: "Child With Bed must be a whole number of at least 0.",
    }),
  // "or Hotel Royal Heritage / similar category" — subtitle line under the
  // hotel name. Defaulted so itineraries saved before this field existed
  // still parse as blank.
  hotelAlt: z.string().default(""),
  // Free-text date labels (e.g. "Wed 10 Jun"), not derived from `nights` —
  // staff enters them directly, same as a day's `dateLabel`.
  checkIn: z.string().default(""),
  checkOut: z.string().default(""),
});

export const infoSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.string(),
  icon: z.string(), // key into ITINERARY_ICONS
});

export const trustSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  icon: z.string(), // key into ITINERARY_ICONS
});

// Included Activities — a free add/remove list (unlike `trust`'s fixed 4),
// same spirit as `hotels`: staff can delete every row down to none, in which
// case the whole PDF section is omitted (see ItineraryPdf.tsx), and can
// always add more via the editor's Add button regardless of current count.
export const activitySchema = z.object({
  id: z.string(),
  name: z.string(),
  place: z.string(),
  time: z.string(),
  image: z.string(),
  // Which day this activity happens on (e.g. "Day 05") — shown as a tag next
  // to the Included badge. Defaulted so itineraries saved before this field
  // existed still parse as blank.
  day: z.string().default(""),
});

// Shared shape for the two "pay locally, at these prices" grids — optional
// (paid) activities and local-taxi-required stops. Both are name + place +
// day + a short note (e.g. "Phase 1", "union rate") + an indicative price
// string (e.g. "₹840 pp") — free text throughout since these prices are set
// locally and change by season, not computed.
export const priceActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  place: z.string(),
  day: z.string(),
  note: z.string(),
  price: z.string(),
});

// Inclusions/Exclusions — grouped by `category` in the PDF (a new heading
// renders whenever it differs from the previous row); `category: ""` just
// renders with no heading. A legacy itinerary's plain `string[]` is migrated
// into this shape (empty category) by itineraryDataSchema's preprocessing
// below — never re-introduce a bare string here.
export const listItemSchema = z.object({
  id: z.string(),
  category: z.string(),
  text: z.string(),
});

// Cancellation tiers — one row per notice-period/charge pair (e.g. "30 days
// or more" / "10%"). Same legacy-string migration story as listItemSchema.
export const cancelTierSchema = z.object({
  id: z.string(),
  label: z.string(),
  charge: z.string(),
});

/** Best-effort migration of a legacy plain-string list into `listItemSchema`
 * rows (empty category) so an itinerary saved before this field existed
 * still loads — staff can re-categorize afterwards via the editor. */
function migrateLegacyListItems(value: unknown) {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.map((text) => ({ id: genId("li"), category: "", text }));
  }
  return value;
}

/** Same idea as migrateLegacyListItems, for the cancellation tier table —
 * the whole legacy sentence becomes one row's `label`, `charge` left blank. */
function migrateLegacyCancelTiers(value: unknown) {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.map((label) => ({ id: genId("ct"), label, charge: "" }));
  }
  return value;
}

export const itineraryDataSchema = z.object({
  // Cover
  coverTitle: z.string(),
  subtitle: z.string(),
  duration: z.string(),
  preparedFor: z.string(),
  travelDates: z.string(),
  travelers: z.string(),
  packageType: z.string(),
  totalCost: z.string(),
  coverImage: z.string(),
  // Staff byline shown top-right of the cover ("Prepared By"). Defaulted so
  // itineraries saved before this field existed still parse as blank —
  // src/app/admin/itinerary/new/page.tsx seeds it from the creating staff
  // user; existing itineraries just leave it blank until edited.
  preparedByName: z.string().default(""),
  preparedByPhone: z.string().default(""),
  // Quote/reference number shown on the cover and in every page's footer
  // (e.g. "VKH-2026-0418"). Defaulted so itineraries saved before this field
  // existed still parse as blank.
  quoteNumber: z.string().default(""),

  // Destinations + info bar
  destinations: z.string(),
  info: z.array(infoSchema),

  // Daily plan
  days: z.array(daySchema),

  // Accommodation + trust strip
  hotels: z.array(hotelSchema),
  // Hotel/room photos shown below the accommodation table. Defaulted (not
  // required) so itineraries saved before this field existed still parse
  // instead of falling back to DEFAULT_ITINERARY_DATA wholesale — see the
  // safeParse fallback in src/app/admin/itinerary/[id]/page.tsx.
  hotelImages: z.array(z.string()).default(DEFAULT_HOTEL_IMAGES),
  trust: z.array(trustSchema),
  // Included Activities — shown right after the Trust strip in the PDF
  // (before Transportation Info), omitted entirely when empty. Defaulted so
  // itineraries saved before this field existed still parse as `[]`;
  // src/app/admin/itinerary/[id]/page.tsx backfills the default Shikara Ride
  // activity on load if still empty, same as whyChoose below — staff can
  // delete it per itinerary via the editor.
  activities: z.array(activitySchema).default([]),
  // "Available on the day" — paid-locally activities, shown as a price grid
  // right after Included Activities. Same add/remove-to-zero spirit as
  // `activities`.
  optionalActivities: z.array(priceActivitySchema).default([]),
  // Why Choose Vertex — same shape as `trust` (id/title/subtitle/icon),
  // editable per itinerary same as everything else. Defaulted so itineraries
  // saved before this field existed still parse; src/app/admin/itinerary/[id]/page.tsx
  // seeds real content into it on load if still empty.
  whyChoose: z.array(trustSchema).default([]),

  // Transport
  transportType: z.string(),
  transportDesc: z.string(),
  transportImage: z.string(),
  transportSeats: z.string().default(""),
  transportBags: z.string().default(""),
  // e.g. "Day 01 – 06"
  transportDays: z.string().default(""),
  transportTags: z.array(z.string()).default([]),
  // Local-taxi-required stops (union vehicles at specific points) — same
  // shape/spirit as optionalActivities.
  localTaxis: z.array(priceActivitySchema).default([]),

  // Lists — `inc`/`exc` accept either the current listItemSchema rows or a
  // legacy plain string[] (migrated transparently, empty category) so an
  // itinerary saved before this shape existed still loads.
  inc: z.preprocess(migrateLegacyListItems, z.array(listItemSchema)).default([]),
  exc: z.preprocess(migrateLegacyListItems, z.array(listItemSchema)).default([]),
  // Short tag pills shown under the "how payment works" card (e.g. "GST
  // included"), not a bulleted list — see payStep1/2 below for the actual steps.
  pay: z.array(z.string()),
  payStep1Title: z.string().default(""),
  payStep1Desc: z.string().default(""),
  payStep2Title: z.string().default(""),
  payStep2Desc: z.string().default(""),
  payNote: z.string().default(""),
  // Cancellation tier table — same legacy-string migration as inc/exc.
  cancel: z.preprocess(migrateLegacyCancelTiers, z.array(cancelTierSchema)).default([]),
  // Small footnote chips below the cancellation table (e.g. "Refunds within
  // 15 working days"). Defaulted so itineraries saved before this field
  // existed still parse as `[]`.
  cancelNotes: z.array(z.string()).default([]),
});

export type ItineraryMeta = z.infer<typeof metaSchema>;
export type ItineraryDay = z.infer<typeof daySchema>;
export type HotelRow = z.infer<typeof hotelSchema>;
export type InfoItem = z.infer<typeof infoSchema>;
export type TrustItem = z.infer<typeof trustSchema>;
export type ActivityItem = z.infer<typeof activitySchema>;
export type PriceActivityItem = z.infer<typeof priceActivitySchema>;
export type ListItem = z.infer<typeof listItemSchema>;
export type CancelTier = z.infer<typeof cancelTierSchema>;
export type ItineraryData = z.infer<typeof itineraryDataSchema>;

export type ItineraryStatus = "DRAFT" | "SENT" | "CONFIRMED";

/** Light record used by the list view (no heavy `data` blob). */
export interface ItinerarySummary {
  id: string;
  title: string;
  status: ItineraryStatus;
  ownerId: string;
  ownerName?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  /** Linked to a lead or a direct booking — can't be deleted. */
  linked: boolean;
}

/** Full record returned by GET /api/itineraries/[id]. */
export interface ItineraryRecord extends ItinerarySummary {
  data: ItineraryData;
}

/**
 * Curated, pre-compressed local stock imagery (public/itinerary/*.webp).
 * Shown in the editor's image picker; the PDF re-encodes the chosen image to
 * a small JPEG at export time (react-pdf cannot embed WebP).
 */
export const STOCK_IMAGES: { src: string; label: string }[] = [
  { src: "/itinerary/srinagar.webp", label: "Srinagar" },
  { src: "/itinerary/gulmarg.webp", label: "Gulmarg" },
  { src: "/itinerary/gulmarg-winter.webp", label: "Gulmarg (Winter)" },
  { src: "/itinerary/pahalgam.webp", label: "Pahalgam" },
  { src: "/itinerary/pahalgam2.webp", label: "Pahalgam II" },
  { src: "/itinerary/sonamarg.webp", label: "Sonamarg" },
  { src: "/itinerary/gurez.webp", label: "Gurez" },
  { src: "/itinerary/doodhpathri.webp", label: "Doodhpathri" },
  { src: "/itinerary/lidder-river.webp", label: "Lidder River" },
  { src: "/itinerary/shikara.webp", label: "Shikara / Dal Lake" },
  { src: "/itinerary/hero.webp", label: "Kashmir Valley" },
];

/** Simple incrementing-ish unique id for new rows (client-side only). */
export function genId(prefix = "it"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
