import { z } from "zod";
import { listItemSchema, cancelTierSchema, trustSchema } from "@/types/itinerary";

// One card's worth of content for a single pricing tier (page 1's price box,
// page 2's option card, and the comparison table's per-tier columns all read
// from the same tier object).
export const proposalTierSchema = z.object({
  label: z.string(), // "Budget" / "Premium" / "Luxury" — the small eyebrow
  title: z.string(), // "The Essentials" — the option card's own headline
  priceLabel: z.string(), // e.g. "₹30,500" — free text, not computed
  // Short one-liner shown in the cover's small price box, e.g. "3-star ·
  // Shikara ride" — distinct from `description` below, which is the longer
  // paragraph on the page-2 option card.
  coverNote: z.string().default(""),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  // "MOST CHOSEN" — empty means no badge. Not hardcoded to a tier so staff
  // can move it to whichever option they're steering the lead towards.
  badgeLabel: z.string().default(""),
});
export type ProposalTier = z.infer<typeof proposalTierSchema>;

// Fixed-key object, not an array — the schema itself guarantees exactly the
// three named slots this document always has, so there's nothing to add or
// remove in the editor and no index-based bugs (tiers[0] vs tiers.budget).
export const proposalTiersSchema = z.object({
  budget: proposalTierSchema,
  premium: proposalTierSchema,
  luxury: proposalTierSchema,
});
export type ProposalTiers = z.infer<typeof proposalTiersSchema>;
export type ProposalTierKey = keyof ProposalTiers;
export const TIER_ORDER: ProposalTierKey[] = ["budget", "premium", "luxury"];

// Comparison table cell sentinels — each cell is plain free text (same "what
// staff types is exactly what prints" convention used for hotel meal-type
// text), pattern-matched at render time rather than stored as a {kind,value}
// object: "" / "-" / "–" renders as a muted dash (not included), "✓" / "yes"
// renders as the green check icon, anything else renders as literal text.
export const COMPARISON_DASH = "–";
export const COMPARISON_CHECK = "✓";

export const comparisonRowSchema = z.object({
  id: z.string(),
  label: z.string(), // e.g. "Hotels", "Gulmarg Gondola"
  budget: z.string(),
  premium: z.string(),
  luxury: z.string(),
});
export type ComparisonRow = z.infer<typeof comparisonRowSchema>;

// The route/day-by-day plan is identical across all three tiers — simpler
// than itineraryDataSchema's daySchema: no image, no meta[] array. Day number
// comes from the array index at render time, same convention ItineraryPdf.tsx
// already uses for its own day cards.
export const proposalDaySchema = z.object({
  id: z.string(),
  title: z.string(),
  dateLabel: z.string().default(""),
  body: z.string(),
  stayLabel: z.string().default(""), // bed-icon line, e.g. "Srinagar"
  // Free text, rendered verbatim exactly as typed — no structured chip list.
  highlightsLine: z.string().default(""),
});
export type ProposalDay = z.infer<typeof proposalDaySchema>;

export const proposalDataSchema = z.object({
  // Cover
  quoteNumber: z.string().default(""),
  coverTitle: z.string(), // "Kashmir,"
  coverSubtitle: z.string().default(""), // "three ways"
  coverIntro: z.string().default(""),
  duration: z.string(), // "5 Nights · 6 Days"
  preparedByName: z.string().default(""),
  preparedByPhone: z.string().default(""),
  preparedFor: z.string(),
  travelDates: z.string(),
  travelers: z.string(),

  tiers: proposalTiersSchema,

  // Page 2 — "you can mix these" tip box
  tipText: z.string().default(""),

  // Page 3 — comparison grid
  comparisonRows: z.array(comparisonRowSchema).default([]),
  comparisonFootnote: z.string().default(""),

  // Page 4 — same six days regardless of tier
  days: z.array(proposalDaySchema).default([]),

  // Page 5 — what's covered + payment & cancellation (reused shapes)
  inc: z.array(listItemSchema).default([]),
  exc: z.array(listItemSchema).default([]),
  policyNote: z.string().default(""), // the cloud-snow "if snowfall..." box
  payStep1Title: z.string().default(""),
  payStep1Desc: z.string().default(""),
  payStep2Title: z.string().default(""),
  payStep2Desc: z.string().default(""),
  pay: z.array(z.string()).default([]),
  payNote: z.string().default(""),
  cancel: z.array(cancelTierSchema).default([]),
  cancelNotes: z.array(z.string()).default([]),

  // Why Choose Us — shown as its own section right after Payment &
  // Cancellation, and reused for the closing page's badge pills (same
  // dual-use pattern as itineraryDataSchema's `whyChoose`).
  whyChoose: z.array(trustSchema).default([]),

  // Page 6 — closing / how to confirm. Fixed at exactly 3 steps (same flat-
  // fields convention as payStep1/2 above) rather than an array, since the
  // count is fixed by the document's own design, not staff-editable.
  confirmStep1Title: z.string().default(""),
  confirmStep1Desc: z.string().default(""),
  confirmStep2Title: z.string().default(""),
  confirmStep2Desc: z.string().default(""),
  confirmStep3Title: z.string().default(""),
  confirmStep3Desc: z.string().default(""),
  closingHoldNote: z.string().default(""), // "this proposal holds for 7 days..."
});

export type ProposalData = z.infer<typeof proposalDataSchema>;
export type ProposalStatus = "DRAFT" | "SENT";

/** Light record used by the list view (no heavy `data` blob). */
export interface ProposalSummary {
  id: string;
  title: string;
  status: ProposalStatus;
  ownerId: string;
  ownerName?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** Full record returned by GET /api/proposals/[id]. */
export interface ProposalRecord extends ProposalSummary {
  data: ProposalData;
}
