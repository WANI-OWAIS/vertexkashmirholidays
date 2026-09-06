/* eslint-disable jsx-a11y/alt-text */
// PDF rendering of the itinerary using @react-pdf/renderer primitives.
// One <Page> per section; long sections wrap across physical pages.
// Text is vector (selectable); images are pre-compressed JPEG data URLs passed
// in via `images` (keyed by the original src) so the document stays under 1 MB.
//
// Visual language: a mockup was supplied (a full 7-"page" HTML sample) and
// this file was rebuilt to match it — timeline-style days, check-in/check-out
// accommodation cards, an Activities+Transport page split into
// included/optional/local-taxi grids, a categorized What's Covered page, a
// payment-steps + cancellation-table policy page, and a QR-first closing
// page. The mock's exact hex palette is used throughout (see `C` below)
// rather than the previous greener/redder one.

import { Document, Page, View, Text, Image, Svg, Path, Link, StyleSheet } from "@react-pdf/renderer";
import type { ItineraryData } from "@/types/itinerary";
import { PDF_CONTACT, inr, type PdfSocialLinks } from "@/lib/pdf/contact";
import { MEAL_PLAN_LEGEND } from "@/lib/hotelSuppliers/schema";
import { SITE_URL } from "@/lib/seo";
import type { PdfTrustContent } from "@/lib/itinerary/pdfTrustContent";
import { ITINERARY_ICON_PATHS, type ItineraryIconKey } from "./icons";

// Brand assets. Each data URL is supplied through the `images` map (keyed by
// these paths). The icon doubles as the faint per-page watermark; the
// horizontal lockups are the primary logo — dark-bg (white text) variant for
// the cover/closing pages, light-bg (dark text) variant for the body header.
export const LOGO_SRC = "/brand/png/icon/vertex-icon-512.png";
export const LOGO_DARK_SRC = "/brand/png/horizontal/vertex-horizontal-dark-1600w.png";
export const LOGO_LIGHT_SRC = "/brand/png/horizontal/vertex-horizontal-light-1600w.png";

// Every lossless brand asset the PDF embeds — the export pipeline fetches each
// as a data URL up-front (no re-encoding, so PNG transparency survives) so a
// missing one degrades gracefully instead of throwing.
export const LOGO_ASSETS = [LOGO_SRC, LOGO_DARK_SRC, LOGO_LIGHT_SRC] as const;

// Mockup's exact palette — a muted forest-green system with a rust/brown
// accent for "paid separately" / higher cancellation charges (not a bright
// red danger color, deliberately calmer).
const C = {
  green: "#145C3E",
  greenDeep: "#0B2C1D",
  greenMid: "#1C4A33",
  greenAlt: "#2A7A55",
  mint: "#7FBF9E",
  mintLight: "#A9D8BF",
  mintPale: "#B8D4C4",
  lightGreen: "#E8F2EB",
  border: "#DCE7E0",
  borderLight: "#EDF3EF",
  bgSubtle: "#F4F8F6",
  ink: "#0F2A1E",
  body: "#3D4F45",
  muted: "#6B7C73",
  rust: "#8A5340",
  rustLight: "#E8C9BC",
  rustBorder: "#E8DCD6",
  rustBg: "#FBF6F4",
  white: "#ffffff",
};

// Spacing scale (pt). Every gap/margin/padding added or touched below in the
// body content pulls from this scale instead of an ad-hoc number, so rhythm
// stays consistent regardless of how many days/hotels/list items the CRM
// data contains.
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36 };

// Strict cap on how many "Highlights" a single day card shows — keeps the
// block a fast scan instead of a growing list. See the days.map below for
// how this is applied (drops trailing items only, never rewords/reorders).
const MAX_HIGHLIGHTS = 4;

// Company contact details, reused by the page footer and the closing page —
// sourced from the shared PDF_CONTACT (src/lib/pdf/contact.ts) so this never
// drifts from the invoice PDF's copy. `phones` splits the "A / B" convention
// used elsewhere into a real array for the closing page's two-number line and
// the tel: link.
const CONTACT = {
  ...PDF_CONTACT,
  phones: PDF_CONTACT.phone.split(" / ").map((p) => p.trim()),
};
const WEBSITE_DISPLAY = SITE_URL.replace(/^https?:\/\//, "");

function telLink(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

/** Resolves the real URL a footer/closing social icon should link to, or
 * undefined if none is configured — the icon then renders as a plain
 * (non-clickable) decoration rather than a dead link. */
function socialHref(
  icon: "instagram" | "facebook" | "youtube" | "whatsapp" | "world",
  links: PdfSocialLinks,
): string | undefined {
  switch (icon) {
    case "instagram":
      return links.instagram ?? undefined;
    case "facebook":
      return links.facebook ?? undefined;
    case "youtube":
      return links.youtube ?? undefined;
    case "whatsapp":
      return waLink(CONTACT.phones[0]);
    case "world":
      return SITE_URL;
    default:
      return undefined;
  }
}

// Static payment-method labels shown on the closing page — not per-itinerary
// data, just what Razorpay actually accepts.
const PAYMENT_METHODS = ["UPI", "GPay", "PhonePe", "Paytm", "Cards", "Netbanking"];

const s = StyleSheet.create({
  // NOTE: no page-level `lineHeight`. A unitless lineHeight here is inherited and
  // resolved against the 10pt base size, squashing every line box to ~14.5pt —
  // which makes large display text (titles, price) overlap the next element.
  // Multi-line body styles set their own lineHeight where readable spacing matters.
  page: {
    paddingTop: 58,
    paddingBottom: 46,
    paddingHorizontal: 40,
    fontSize: 10,
    color: C.ink,
    fontFamily: "Helvetica",
  },

  // Fixed brand header repeated on every physical sheet of the body page.
  header: {
    position: "absolute",
    top: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 8,
  },
  headerLogo: { width: 120, height: 30, objectFit: "contain" },
  headerTag: { fontSize: 7.5, color: C.muted, letterSpacing: 1 },

  // Faint centred icon watermark — sits behind body content on every sheet.
  watermark: { position: "absolute", top: 250, left: 116, width: 360, height: 360, opacity: 0.04 },
  watermarkImg: { width: 360, height: 360, objectFit: "contain" },

  // Footer — 3 columns: office name/reg (left), social icon row (center),
  // quote number + dynamic page count + contact (right).
  footer: {
    position: "absolute",
    bottom: 16,
    left: 40,
    right: 40,
    paddingTop: 9,
    borderTopWidth: 2,
    borderTopColor: C.green,
  },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  footerCompany: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink },
  footerReg: { fontSize: 7, color: C.muted, marginTop: 2, maxWidth: 230 },
  footerCenter: { alignItems: "center" },
  footerLogo: { width: 14, height: 14, objectFit: "contain", marginBottom: 4 },
  footerSocialRow: { flexDirection: "row", gap: 5 },
  footerSocialIcon: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: C.lightGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  footerRight: { alignItems: "flex-end" },
  footerContact: { fontSize: 7.5, color: C.muted, textAlign: "right" },
  footerQuote: { fontSize: 7.5, color: C.muted, textAlign: "right", marginTop: 2 },

  // Cover — every block is absolutely positioned over the full-bleed image so
  // the cover has zero in-flow height and can never overflow onto a 2nd page.
  cover: { padding: 0, backgroundColor: C.greenDeep },
  coverImg: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "55%",
    objectFit: "cover",
  },
  coverOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(11,44,29,0.5)",
  },
  coverContent: { position: "relative", padding: 40, height: "100%" },
  coverBrand: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  logoBox: {
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: { width: 28, height: 28, objectFit: "contain" },
  coverLogo: { width: 150, height: 38, objectFit: "contain" },
  brandName: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.white },
  brandSub: { fontSize: 8, letterSpacing: 2, color: "rgba(255,255,255,0.85)" },
  preparedByBox: { alignItems: "flex-end" },
  preparedByLabel: { fontSize: 7.5, letterSpacing: 1.6, color: C.mint },
  preparedByName: { fontSize: 13, color: C.white, marginTop: 5 },

  coverTitleBlock: { marginTop: "auto" },
  quoteLine: { fontSize: 8.5, letterSpacing: 2, color: C.mint, marginBottom: 10 },
  coverTitle: {
    fontSize: 58,
    fontFamily: "Helvetica-Bold",
    color: C.white,
    lineHeight: 0.95,
    letterSpacing: -0.5,
  },
  coverScript: { fontSize: 34, color: C.mint, marginTop: 3 },
  durationRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  durationText: { fontSize: 10.5, letterSpacing: 2.5, color: C.mintPale },

  preparedForBlock: { marginTop: 24 },
  preparedLabel: { fontSize: 8.5, letterSpacing: 1.6, color: C.mint },
  preparedName: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.white, marginTop: 6 },

  coverGrid: {
    flexDirection: "row",
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(127,191,158,0.28)",
  },
  coverGridCol: { flex: 1 },
  coverGridValue: { fontSize: 12.5, color: C.white },
  coverGridLabel: { fontSize: 7.5, letterSpacing: 1, color: C.mint, marginTop: 4 },

  costBox: {
    marginTop: 18,
    backgroundColor: C.mint,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  costValue: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.greenDeep },
  costLabel: { fontSize: 8.5, letterSpacing: 1, color: C.greenMid, marginTop: 3 },

  coverBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  coverBadge: {
    fontSize: 7.5,
    color: C.mintPale,
    borderWidth: 1,
    borderColor: "rgba(127,191,158,0.35)",
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 99,
    letterSpacing: 0.3,
  },

  // Section headings
  sectionGap: { marginTop: SP.xxl },
  secHeadRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: SP.md },
  secHead: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.green },
  secTag: { fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 },

  // Top info — Destinations gets its own full-width card (its value can run
  // long, e.g. 4+ names), then every other data.info row wraps as its own
  // card below. Two separate rows (not one shared strip) so this never
  // degrades into a cramped, wrapping mess regardless of how many info rows
  // an older itinerary happens to have.
  infoDestCard: {
    backgroundColor: C.bgSubtle,
    borderRadius: 10,
    padding: SP.md + 3,
    marginBottom: SP.sm + 2,
  },
  infoCardsRow: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm + 2, marginBottom: SP.xl },
  infoCard: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: C.bgSubtle,
    borderRadius: 10,
    padding: SP.md + 3,
  },
  infoLabel: { fontSize: 8, color: C.muted, letterSpacing: 0.5 },
  infoValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 4 },

  // Small circular colored background behind an icon — used wherever an icon
  // needs more visual weight ("premium chip" presence) instead of floating
  // bare against the page background.
  iconChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.lightGreen,
    alignItems: "center",
    justifyContent: "center",
  },

  // Daily Itinerary — a card per day: number/title/date row, description,
  // small highlight pills (inline wrap), meals/stay icon row, full-height
  // photo on the right.
  dayCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: SP.md + 2,
    flexDirection: "row",
  },
  dayCardBody: { flex: 1, padding: SP.md + 3 },
  dayHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: SP.sm },
  dayNumTitle: { flexDirection: "row", alignItems: "baseline", gap: 9 },
  dayNum: { fontSize: 21, fontFamily: "Helvetica-Bold", color: C.mintPale, lineHeight: 1 },
  dayTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink },
  dayDate: { fontSize: 9, color: C.muted },
  dayText: { fontSize: 10, color: C.body, lineHeight: 1.6 },
  dayPillRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: SP.sm },
  dayPill: { fontSize: 9, color: C.green, backgroundColor: C.lightGreen, paddingVertical: 3.5, paddingHorizontal: 8, borderRadius: 5 },
  dayMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    marginTop: SP.md,
    paddingTop: SP.sm + 2,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  dayMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dayMetaText: { fontSize: 9, color: C.muted },
  dayMetaDivider: { width: 1, height: 11, backgroundColor: C.border },
  // No explicit height here on purpose — the column has no in-flow content
  // (the image inside is `position: absolute`, so it doesn't count towards
  // this column's own natural size), so the row's flex-stretch gives this
  // column exactly dayCardBody's content height, then the absolutely
  // positioned image fills that rect edge-to-edge. This is what actually
  // makes "image height == content height" work: an in-flow Image with
  // height:"100%" here resolves against an indefinite parent and renders far
  // too tall (Yoga walks up to the nearest definite ancestor instead of
  // falling back to intrinsic size, the way browser CSS would) — the
  // absolute-fill escapes that circular measurement entirely.
  dayImgCol: { width: 150, flexShrink: 0, position: "relative" },
  dayImgFallback: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.green },
  dayImgFull: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, objectFit: "cover" },

  // Accommodation — one card per hotel: photo left, name/alt/badge + a
  // 4-column check-in/check-out/nights/room stat row, then tag pills.
  hotelCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: SP.md,
    flexDirection: "row",
  },
  // No explicit height — same absolute-fill-to-content-height trick as
  // dayImgCol above.
  hotelImgCol: { width: 130, flexShrink: 0, position: "relative" },
  hotelImgFallback: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.green },
  hotelImgFull: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, objectFit: "cover" },
  hotelBody: { flex: 1, padding: SP.md + 2 },
  hotelHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  hotelName: { fontSize: 13.5, fontFamily: "Helvetica-Bold", color: C.ink },
  hotelAlt: { fontSize: 9.5, color: C.muted, marginTop: 2 },
  hotelBadge: {
    fontSize: 9,
    color: C.green,
    backgroundColor: C.lightGreen,
    paddingVertical: 3.5,
    paddingHorizontal: 9,
    borderRadius: 99,
  },
  hotelStatRow: {
    flexDirection: "row",
    marginTop: SP.sm + 2,
    paddingTop: SP.sm + 2,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  hotelStat: { flex: 1 },
  hotelStatLabel: { fontSize: 8, color: C.muted, letterSpacing: 0.4, textTransform: "uppercase" },
  hotelStatValue: { fontSize: 11, color: C.ink, marginTop: 3 },
  hotelTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: SP.sm + 2 },

  note: { fontSize: 8.5, color: C.muted, fontStyle: "italic", marginTop: 6 },
  infoNoteBox: {
    flexDirection: "row",
    gap: SP.sm + 2,
    backgroundColor: C.lightGreen,
    borderRadius: 9,
    padding: SP.sm + 3,
    alignItems: "flex-start",
  },
  infoNoteText: { flex: 1, fontSize: 9.5, color: C.greenMid, lineHeight: 1.5 },

  // Included Activities — a bordered row per activity (photo block left,
  // name/badge/desc + place/time/day stats right).
  activityCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: SP.md,
    flexDirection: "row",
  },
  // Fixed height — same reasoning as dayImgCol above.
  // 50/50 split with a fixed landscape height (unlike day/hotel cards, this
  // one doesn't stretch to match content — activity copy is short and
  // variable, so a fixed height keeps every tile the same uniform shape).
  activityImgCol: { width: "50%", height: 150, flexShrink: 0 },
  activityImgFallback: { width: "100%", height: "100%", backgroundColor: C.green },
  activityImgFull: { width: "100%", height: "100%", objectFit: "cover" },
  activityBody: { width: "50%", padding: SP.md + 2 },
  activityHeadRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activityName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink },
  includedBadge: {
    fontSize: 8,
    color: C.white,
    backgroundColor: C.green,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 99,
  },
  activityDesc: { fontSize: 9.5, color: C.body, marginTop: 6, lineHeight: 1.55 },
  activityStatRow: { flexDirection: "row", flexWrap: "wrap", gap: SP.md, marginTop: SP.sm + 2 },
  activityStatItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  activityStatText: { fontSize: 9, color: C.muted },

  // Price grids — "available on the day" activities + local-taxi stops.
  // Same tile shape, dashed border (visually distinct from the solid-bordered
  // Included cards — these are informational, not part of the package).
  priceGridHead: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: 2 },
  priceGridSub: { fontSize: 9, color: C.muted, marginBottom: SP.sm + 2, lineHeight: 1.5 },
  priceGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  priceTile: { width: "33.33%", paddingHorizontal: 5, marginBottom: SP.sm + 2 },
  priceTileCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: C.border,
    borderRadius: 9,
    overflow: "hidden",
  },
  priceTileImg: { width: "100%", height: 46, backgroundColor: C.bgSubtle },
  priceTileBody: { padding: SP.sm + 2 },
  priceTileName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: C.ink },
  priceTileSub: { fontSize: 8.5, color: C.muted, marginTop: 3, marginBottom: 7 },
  priceTileFootRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  priceTileNote: { fontSize: 8, color: C.muted },
  priceTileAmount: { fontSize: 9.5, color: C.green },

  // Transport
  transportCard: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    overflow: "hidden",
    flexDirection: "row",
    marginBottom: SP.md,
  },
  // 50/50 split with a fixed landscape height — same reasoning as
  // activityImgCol above.
  transportIconCol: {
    width: "50%",
    height: 150,
    flexShrink: 0,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  transportBody: { width: "50%", padding: SP.md + 2, flexDirection: "row", gap: SP.md },
  transportMain: { flex: 1 },
  transportHeadRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  transportType: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink },
  privateBadge: {
    fontSize: 8,
    color: C.white,
    backgroundColor: C.green,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 99,
  },
  transportDesc: { fontSize: 9.5, color: C.body, marginTop: 6, lineHeight: 1.55 },
  transportStatCol: {
    paddingLeft: SP.md,
    borderLeftWidth: 1,
    borderLeftColor: C.borderLight,
    justifyContent: "center",
    gap: 7,
  },
  transportStatItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  transportStatText: { fontSize: 9, color: C.muted },
  driverNote: {
    flexDirection: "row",
    gap: SP.sm + 2,
    backgroundColor: C.greenDeep,
    borderRadius: 9,
    padding: SP.sm + 3,
    alignItems: "center",
    marginBottom: SP.md,
  },
  driverNoteText: { flex: 1, fontSize: 9.5, color: C.white, lineHeight: 1.5 },

  // Two columns (What's Covered / Payment & Cancellation)
  twoCol: { flexDirection: "row", gap: SP.lg },
  coveredCard: { flex: 1, borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  coveredCardHead: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 9, paddingHorizontal: SP.md },
  coveredCardHeadText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.white },
  coveredCardBody: { padding: SP.md },
  coveredCategory: { fontSize: 8.5, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 5, marginTop: SP.sm + 2 },
  coveredText: { fontSize: 9.5, color: C.body, lineHeight: 1.55, marginBottom: 2 },

  // Payment & Cancellation — 3 columns side by side (step 1 | step 2 |
  // tags+note), separated by thin vertical dividers, matching the mock
  // exactly rather than a vertical stack.
  payStepsCard: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: SP.md + 3 },
  payStepsHead: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: SP.md },
  payStepsRow: { flexDirection: "row", alignItems: "stretch" },
  payStepCol: { flex: 1, paddingRight: SP.lg + 2 },
  payStepColMid: { flex: 1, paddingHorizontal: SP.lg + 2 },
  payStepDivider: { width: 1, backgroundColor: C.borderLight },
  payStepRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  // Step 1's badge is solid green/white (the "current" step); step 2's is
  // the pale mint with dark text (the "next" step) — a deliberate two-tone
  // distinction from the mock, not a copy-paste of the same style twice.
  payStepNum1: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.green,
    color: C.white,
    fontSize: 10,
    textAlign: "center",
    paddingTop: 5,
  },
  payStepNum2: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.mintPale,
    color: "#0F3A28",
    fontSize: 10,
    textAlign: "center",
    paddingTop: 5,
  },
  payStepTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink },
  payStepDesc: { fontSize: 9.5, color: C.body, lineHeight: 1.5 },
  payTagCol: { flex: 1, paddingLeft: SP.lg + 2, justifyContent: "center" },
  payTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  payTag: { fontSize: 9, color: C.green, backgroundColor: C.lightGreen, paddingVertical: 3.5, paddingHorizontal: 8, borderRadius: 5 },
  payNoteText: { fontSize: 9, color: C.muted, marginTop: SP.sm + 2, lineHeight: 1.5 },

  cancelCard: { borderWidth: 1, borderColor: C.border, borderRadius: 10, overflow: "hidden" },
  cancelHead: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.sm },
  cancelHeadTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink },
  cancelHeadNote: { fontSize: 8.5, color: C.muted, marginTop: 3 },
  cancelTableHeadRow: {
    flexDirection: "row",
    backgroundColor: C.bgSubtle,
    paddingVertical: 6,
    paddingHorizontal: SP.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: C.borderLight,
  },
  cancelTableHeadText: { fontSize: 7.5, color: C.muted, letterSpacing: 0.4, textTransform: "uppercase" },
  cancelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  cancelRowLabel: { flex: 1, fontSize: 10, color: C.ink },
  cancelRowCharge: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right" },
  cancelNotesRow: { paddingHorizontal: SP.md, paddingVertical: SP.sm + 2, flexDirection: "row", flexWrap: "wrap", gap: SP.md },
  cancelNoteItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  cancelNoteText: { fontSize: 8.5, color: C.muted },

  // Trust strip — "Why Travel With Vertex" framing: a heading ties the 4
  // cells together as one deliberate section, and (when real rating data is
  // available) a compact review badge sits alongside it.
  trustSection: { marginTop: SP.xxl },
  trustHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SP.sm },
  trustHead: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.green },
  reviewBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  reviewStars: { flexDirection: "row", gap: 1 },
  reviewText: { fontSize: 8.5, color: C.muted },
  reviewTextStrong: { fontFamily: "Helvetica-Bold", color: C.ink },
  trust: { flexDirection: "row", backgroundColor: C.bgSubtle, borderRadius: 12, paddingVertical: SP.md },
  trustCell: { flex: 1, alignItems: "center", paddingHorizontal: 8, textAlign: "center" },
  trustTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink, textAlign: "center", marginTop: 5 },
  trustSub: { fontSize: 8, color: C.muted, textAlign: "center", marginTop: 2, lineHeight: 1.3 },

  // Why Choose Vertex
  whyChoose: { marginTop: SP.xxl },
  whyChooseIntro: { fontSize: 10, color: C.body, lineHeight: 1.4, marginBottom: SP.sm + 2, fontStyle: "italic" },
  whyChooseGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP.sm },
  whyChooseItem: {
    width: "47%",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: SP.sm,
  },
  whyChooseItemTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.ink },
  whyChooseItemDesc: { fontSize: 8.5, color: C.muted, marginTop: 2, lineHeight: 1.35 },

  // Closing page — dark-green QR block on top (full bleed), white Thank You +
  // office block below.
  closingOuter: { padding: 0 },
  closingTop: { backgroundColor: C.greenDeep, paddingVertical: 44, paddingHorizontal: 40, alignItems: "center" },
  closingKicker: { fontSize: 9, letterSpacing: 3, color: C.mint, textAlign: "center" },
  qrCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 16,
    width: 150,
    height: 150,
    marginTop: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  qrImg: { width: "100%", height: "100%", objectFit: "contain" },
  qrCaption: { fontSize: 11, color: C.white, marginTop: 16, textAlign: "center" },
  qrSubCaption: { fontSize: 9, color: C.mint, marginTop: 5, textAlign: "center" },
  paymentMethodRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 15 },
  paymentMethodPill: {
    fontSize: 8.5,
    color: C.greenDeep,
    backgroundColor: C.mint,
    paddingVertical: 4.5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  securedBy: { fontSize: 7.5, color: "#5E9C7B", letterSpacing: 1.2, marginTop: 14 },

  closingBottom: { padding: 40, flex: 1 },
  thankYouTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: C.green },
  thankYouMsg: { fontSize: 10.5, color: C.body, marginTop: 9, lineHeight: 1.6, maxWidth: 380 },
  ctaRow: { flexDirection: "row", gap: 10, marginTop: 18, maxWidth: 380 },
  ctaPrimary: { flex: 1, backgroundColor: C.green, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  ctaPrimaryText: { fontSize: 10.5, color: C.white },
  ctaSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.green,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  ctaSecondaryText: { fontSize: 10.5, color: C.green },
  closingBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 22 },
  closingBadge: {
    fontSize: 8,
    color: C.green,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 4.5,
    paddingHorizontal: 9,
    borderRadius: 99,
    letterSpacing: 0.3,
  },
  closingOfficeRow: {
    marginTop: "auto",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  closingCompany: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink },
  closingOfficeText: { fontSize: 9, color: C.muted, marginTop: 7, lineHeight: 1.6, maxWidth: 320 },
  closingSocialRow: { flexDirection: "row", gap: 7 },
  closingSocialIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: C.lightGreen,
    alignItems: "center",
    justifyContent: "center",
  },
});

function Footer() {
  return (
    <View style={s.footer} fixed>
      <View style={s.footerRow}>
        <View>
          <Text style={s.footerCompany}>{CONTACT.company}</Text>
          <Text style={s.footerReg}>{CONTACT.address}</Text>
        </View>
        <View style={s.footerCenter}>
          {footerLogoSrc ? <Image src={footerLogoSrc} style={s.footerLogo} /> : null}
          <View style={s.footerSocialRow}>
            {(["instagram", "facebook", "youtube", "whatsapp"] as const).map((icon) => {
              const href = socialHref(icon, footerSocialLinks);
              return href ? (
                <Link key={icon} src={href} style={s.footerSocialIcon}>
                  <PdfIcon icon={icon} size={9} color={C.green} solid />
                </Link>
              ) : (
                <View key={icon} style={s.footerSocialIcon}>
                  <PdfIcon icon={icon} size={9} color={C.green} solid />
                </View>
              );
            })}
          </View>
        </View>
        <View style={s.footerRight}>
          <Text style={s.footerContact}>
            {CONTACT.phones[0]} · {CONTACT.email}
          </Text>
          <Text
            style={s.footerQuote}
            render={({ pageNumber, totalPages }) => {
              const quote = footerQuoteNumber || "";
              return `${quote ? `${quote} · ` : ""}Page ${pageNumber} / ${totalPages}`;
            }}
          />
        </View>
      </View>
    </View>
  );
}

// Set once per render from the itinerary's own quoteNumber (Footer has no
// props — it's used with `fixed` across every sheet of the flowing body page
// via react-pdf's own re-render-per-page mechanism, so a module-level value
// set just before the body <Page> is the simplest way to thread it through
// without restructuring Footer into a render-prop itself).
let footerQuoteNumber = "";
// Same module-level threading trick, for the footer's social icon links.
let footerSocialLinks: PdfSocialLinks = {};
// ...and for the small brand mark centered above them.
let footerLogoSrc: string | undefined;

// wrap={false} keeps the heading and its underline together; minPresenceAhead
// pulls the whole heading to the next page if too little room remains below,
// so a heading never strands at the bottom of a sheet with its content
// stranded on the next one. The value should roughly match the height of the
// smallest realistic atomic block that immediately follows the heading (the
// caller knows that; there's no single safe default — a value sized for a
// two-card policy block would push a heading followed only by a short table
// row further than it needs to go).
function SectionHead({
  title,
  tag,
  minPresenceAhead = 100,
}: {
  title: string;
  tag?: string;
  minPresenceAhead?: number;
}) {
  return (
    <View style={s.secHeadRow} wrap={false} minPresenceAhead={minPresenceAhead}>
      <Text style={s.secHead}>{title}</Text>
      {tag ? <Text style={s.secTag}>{tag}</Text> : null}
    </View>
  );
}

interface Props {
  data: ItineraryData;
  /** original src -> compressed JPEG data URL */
  images: Record<string, string>;
  /** Resolved Corporate Office (or Registered Office fallback) — falls back to the static PDF_CONTACT default if omitted. */
  address?: string;
  /**
   * Booking-token Razorpay Payment Link QR, already rendered to a data URL by
   * the caller (see src/lib/itinerary/export-pdf.tsx) — this is a live,
   * itinerary-specific payment link, never a static/bundled image. Omitted
   * (undefined) when no link could be resolved — the QR card is hidden
   * entirely in that case (existing "hidden rather than shown broken" rule
   * below), not filled with a generic fallback QR.
   */
  tokenQrDataUrl?: string;
  /** The fixed token amount that QR collects, in rupees — drives the "Pay ₹X only" caption. */
  tokenAmountRupees?: number;
  /**
   * Real review-rating badge, sourced server-side from the live site's own
   * HomeContent.aboutRatingTitle/Subtitle (see
   * src/lib/itinerary/pdfTrustContent.ts) — never invented here. Omitted
   * (null) simply isn't rendered. (Why Choose Vertex is separate — that's
   * editable itinerary content, see data.whyChoose.)
   */
  trustContent?: PdfTrustContent;
  /** Real Instagram/Facebook/YouTube profile URLs (SiteSettings) — makes the footer/closing social icons clickable. Missing fields just render as a non-clickable icon. */
  socialLinks?: PdfSocialLinks;
}

export function ItineraryPdf({
  data,
  images,
  address,
  tokenQrDataUrl,
  tokenAmountRupees,
  trustContent,
  socialLinks,
}: Props) {
  const img = (src: string) => images[src];
  const qrDataUrl = tokenQrDataUrl;
  const officeAddress = address ?? PDF_CONTACT.address;
  footerQuoteNumber = data.quoteNumber;
  footerSocialLinks = socialLinks ?? {};
  footerLogoSrc = img(LOGO_SRC);

  // Category headings for Inclusions/Exclusions render once per run of
  // same-category rows — computed here (not inline in JSX) since the "did
  // the category change from the previous row" check needs the previous
  // item, which .map() alone doesn't expose cleanly.
  const incRuns = withCategoryRuns(data.inc);
  const excRuns = withCategoryRuns(data.exc);

  return (
    <Document title={`Itinerary - ${data.preparedFor}`} author="Vertex Kashmir Holidays">
      {/* COVER — top ~55% is the full-bleed image; the rest of the page is a
          flat deep-green fill (s.cover), matching the mock's photo-band +
          solid-color lower half rather than a full-page image. */}
      <Page size="A4" style={[s.page, s.cover]}>
        {img(data.coverImage) ? <Image src={img(data.coverImage)} style={s.coverImg} fixed /> : null}
        <View style={[s.coverOverlay, { height: "55%" }]} fixed />

        <View style={s.coverContent}>
          <View style={s.coverBrand}>
            {img(LOGO_DARK_SRC) ? (
              <Image src={img(LOGO_DARK_SRC)} style={s.coverLogo} />
            ) : (
              <View>
                <Text style={s.brandName}>Vertex</Text>
                <Text style={s.brandSub}>KASHMIR HOLIDAYS</Text>
              </View>
            )}
            {data.preparedByName ? (
              <View style={s.preparedByBox}>
                <Text style={s.preparedByLabel}>PREPARED BY</Text>
                <Text style={s.preparedByName}>{data.preparedByName}</Text>
              </View>
            ) : null}
          </View>

          <View style={s.coverTitleBlock}>
            {data.quoteNumber ? <Text style={s.quoteLine}>QUOTE {data.quoteNumber}</Text> : null}
            <Text style={s.coverTitle}>{data.coverTitle}</Text>
            <Text style={s.coverScript}>{data.subtitle}</Text>
            <View style={s.durationRow}>
              <View style={{ width: 34, height: 1, backgroundColor: "rgba(255,255,255,0.5)" }} />
              <Text style={s.durationText}>{data.duration}</Text>
            </View>

            <View style={s.preparedForBlock}>
              <Text style={s.preparedLabel}>PREPARED FOR</Text>
              <Text style={s.preparedName}>{data.preparedFor}</Text>
            </View>

            <View style={s.coverGrid}>
              <View style={s.coverGridCol}>
                <Text style={s.coverGridValue}>{data.travelDates}</Text>
                <Text style={s.coverGridLabel}>TRAVEL DATES</Text>
              </View>
              <View style={s.coverGridCol}>
                <Text style={s.coverGridValue}>{data.travelers}</Text>
                <Text style={s.coverGridLabel}>TRAVELLERS</Text>
              </View>
              <View style={s.coverGridCol}>
                <Text style={s.coverGridValue}>{data.packageType}</Text>
                <Text style={s.coverGridLabel}>PACKAGE</Text>
              </View>
            </View>

            <View style={s.costBox}>
              <View>
                <Text style={s.costValue}>{data.totalCost}</Text>
                <Text style={s.costLabel}>TOTAL · ALL INCLUSIVE OF GST</Text>
              </View>
              <PdfIcon icon="shield" size={30} color={C.greenDeep} solid />
            </View>

            <View style={s.coverBadgeRow}>
              <Text style={s.coverBadge}>{PDF_CONTACT.reg}</Text>
              {trustContent?.rating ? (
                <Text style={s.coverBadge}>
                  {trustContent.rating.title} · {trustContent.rating.subtitle}
                </Text>
              ) : null}
              <Text style={s.coverBadge}>1000+ TRAVELLERS</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* BODY — one continuous page so content flows and fills each sheet
          instead of leaving a near-empty page after every section. */}
      <Page size="A4" style={s.page}>
        {img(LOGO_SRC) ? (
          <View style={s.watermark} fixed>
            <Image src={img(LOGO_SRC)} style={s.watermarkImg} />
          </View>
        ) : null}

        <View style={s.header} fixed>
          {img(LOGO_LIGHT_SRC) ? (
            <Image src={img(LOGO_LIGHT_SRC)} style={s.headerLogo} />
          ) : (
            <Text style={s.brandName}>Vertex</Text>
          )}
          <Text style={s.headerTag}>YOUR JOURNEY, CRAFTED</Text>
        </View>

        {/* Info — Destinations gets its own full-width card (comes straight
            from data.destinations, not a free-text info[] row, so it can
            never drift out of sync with the single field every other part of
            the document reads), then every data.info row wraps as its own
            card below. Two rows rather than one shared strip so this stays
            legible regardless of how many info rows an itinerary has (an
            older itinerary may still carry more than the current default's
            3). */}
        <View style={s.infoDestCard}>
          <Text style={s.infoLabel}>DESTINATIONS</Text>
          <Text style={s.infoValue}>{data.destinations}</Text>
        </View>
        <View style={s.infoCardsRow}>
          {data.info.map((it) => (
            <View key={it.id} style={s.infoCard}>
              <Text style={s.infoLabel}>{it.label.toUpperCase()}</Text>
              <Text style={s.infoValue}>{it.value}</Text>
            </View>
          ))}
        </View>

        {/* 140: guarantees at least the DAY 01 card's number/title/date row +
            a couple of description lines land with the heading. */}
        <SectionHead title="Daily Itinerary" tag={`${data.days.length} Days`} minPresenceAhead={140} />
        {data.days.map((day, i) => {
          // Highlights get pulled into small inline pills (content untouched —
          // just the same comma-separated value split into short items).
          // Capped at MAX_HIGHLIGHTS so a long list doesn't run away.
          const highlightsMeta = day.meta.find((m) => m.label.trim().toLowerCase() === "highlights");
          const gridMeta = day.meta.filter((m) => m !== highlightsMeta);
          const highlightItems = highlightsMeta
            ? highlightsMeta.value
                .split(",")
                .map((h) => h.trim())
                .filter(Boolean)
                .slice(0, MAX_HIGHLIGHTS)
            : [];
          return (
            <View key={day.id} style={s.dayCard} wrap={false}>
              <View style={s.dayCardBody}>
                <View style={s.dayHeadRow}>
                  <View style={s.dayNumTitle}>
                    <Text style={s.dayNum}>{String(i + 1).padStart(2, "0")}</Text>
                    <Text style={s.dayTitle}>{day.title}</Text>
                  </View>
                  {day.dateLabel ? <Text style={s.dayDate}>{day.dateLabel}</Text> : null}
                </View>
                <Text style={s.dayText}>{day.body}</Text>
                {highlightItems.length > 0 ? (
                  <View style={s.dayPillRow}>
                    {highlightItems.map((h, hi) => (
                      <Text key={hi} style={s.dayPill}>
                        {h}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {gridMeta.length > 0 ? (
                  <View style={s.dayMetaRow}>
                    {gridMeta.map((m, mi) => (
                      <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: SP.md }}>
                        {mi > 0 ? <View style={s.dayMetaDivider} /> : null}
                        <View style={s.dayMetaItem}>
                          <PdfIcon icon={m.label.trim().toLowerCase()} size={12} color={C.green} solid />
                          <Text style={s.dayMetaText}>{m.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={s.dayImgCol}>
                {img(day.image) ? (
                  <Image src={img(day.image)} style={s.dayImgFull} />
                ) : (
                  <View style={s.dayImgFallback} />
                )}
              </View>
            </View>
          );
        })}

        {/* ACCOMMODATION — one card per hotel, each independently wrap={false}
            (the heading uses minPresenceAhead) rather than forcing the whole
            list to fit-or-move-together — the photo cards are tall enough
            that grouping the entire list risks an unnecessary near-empty page. */}
        <View style={s.sectionGap}>
          <SectionHead
            title="Accommodation"
            tag={`${data.hotels.length} Stays · ${data.hotels.reduce((sum, h) => sum + (parseInt(h.nights, 10) || 0), 0)} Nights`}
            minPresenceAhead={120}
          />
          {data.hotels.map((h) => (
            <View key={h.id} style={s.hotelCard} wrap={false}>
              <View style={s.hotelImgCol}>
                {img(h.image) ? (
                  <Image src={img(h.image)} style={s.hotelImgFull} />
                ) : (
                  <View style={s.hotelImgFallback} />
                )}
              </View>
              <View style={s.hotelBody}>
                <View style={s.hotelHeadRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.hotelName}>{h.hotelDetails}</Text>
                    {h.hotelAlt ? <Text style={s.hotelAlt}>{h.hotelAlt}</Text> : null}
                  </View>
                  <Text style={s.hotelBadge}>{h.destination}</Text>
                </View>
                <View style={s.hotelStatRow}>
                  <View style={s.hotelStat}>
                    <Text style={s.hotelStatLabel}>Check In</Text>
                    <Text style={s.hotelStatValue}>{h.checkIn || "To Decide"}</Text>
                  </View>
                  <View style={s.hotelStat}>
                    <Text style={s.hotelStatLabel}>Check Out</Text>
                    <Text style={s.hotelStatValue}>{h.checkOut || "To Decide"}</Text>
                  </View>
                  <View style={s.hotelStat}>
                    <Text style={s.hotelStatLabel}>Nights</Text>
                    <Text style={s.hotelStatValue}>{h.nights}</Text>
                  </View>
                  <View style={s.hotelStat}>
                    <Text style={s.hotelStatLabel}>Room</Text>
                    <Text style={s.hotelStatValue}>{h.roomType}</Text>
                  </View>
                </View>
                <View style={s.hotelTagRow}>
                  <Text style={s.dayPill}>
                    {MEAL_PLAN_LEGEND.find((l) => l.code === h.mealType)?.meaning ?? h.mealType}
                  </Text>
                  {h.extraBed !== "0" ? <Text style={s.dayPill}>{h.extraBed} Extra Bed</Text> : null}
                  {h.childWithBed !== "0" ? (
                    <Text style={s.dayPill}>{h.childWithBed} Child With Bed</Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
          <View style={s.infoNoteBox} wrap={false}>
            <PdfIcon icon="info" size={13} color={C.green} />
            <Text style={s.infoNoteText}>
              Hotels are confirmed at the time of booking. If a listed property is unavailable we
              substitute one of the same category and tell you before you pay the balance.
            </Text>
          </View>
        </View>
        <View style={s.trustSection} wrap={false}>
          <View style={s.trustHeadRow}>
            <Text style={s.trustHead}>Why Travel With Vertex</Text>
            {trustContent?.rating ? (
              <View style={s.reviewBadge}>
                <View style={s.reviewStars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <PdfIcon
                      key={n}
                      icon="star"
                      size={9}
                      color={
                        trustContent.rating!.value != null && n <= Math.round(trustContent.rating!.value)
                          ? C.green
                          : C.border
                      }
                      solid
                    />
                  ))}
                </View>
                <Text style={s.reviewText}>
                  <Text style={s.reviewTextStrong}>{trustContent.rating.title}</Text>
                  {"  ·  "}
                  {trustContent.rating.subtitle}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={s.trust}>
            {data.trust.map((t) => (
              <View key={t.id} style={s.trustCell}>
                <View style={s.iconChip}>
                  <PdfIcon icon={t.icon} size={13} solid />
                </View>
                <Text style={s.trustTitle}>{t.title}</Text>
                <Text style={s.trustSub}>{t.subtitle}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ACTIVITIES — Included (data.activities, each with a Day tag) then
            "Available on the day" price grid (data.optionalActivities), same
            two-tier structure as the mock. Omitted entirely when there's
            nothing to show, never rendered as an empty heading. */}
        {data.activities.length > 0 ? (
          <View style={s.sectionGap} wrap={false}>
            <SectionHead
              title="Activities"
              tag={`${data.activities.length} Included · ${data.optionalActivities.length} Optional`}
            />
            {data.activities.map((a) => (
              <View key={a.id} style={s.activityCard} wrap={false}>
                <View style={s.activityImgCol}>
                  {img(a.image) ? (
                    <Image src={img(a.image)} style={s.activityImgFull} />
                  ) : (
                    <View style={s.activityImgFallback} />
                  )}
                </View>
                <View style={s.activityBody}>
                  <View style={s.activityHeadRow}>
                    <Text style={s.activityName}>{a.name}</Text>
                    <Text style={s.includedBadge}>Included</Text>
                  </View>
                  <View style={s.activityStatRow}>
                    <View style={s.activityStatItem}>
                      <PdfIcon icon="map-pin" size={11} color={C.green} solid />
                      <Text style={s.activityStatText}>{a.place}</Text>
                    </View>
                    <View style={s.activityStatItem}>
                      <PdfIcon icon="clock" size={11} color={C.green} solid />
                      <Text style={s.activityStatText}>{a.time}</Text>
                    </View>
                    {a.day ? (
                      <View style={s.activityStatItem}>
                        <PdfIcon icon="calendar" size={11} color={C.green} />
                        <Text style={s.activityStatText}>{a.day}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {data.optionalActivities.length > 0 ? (
          <View style={{ marginTop: SP.lg }} wrap={false}>
            <Text style={s.priceGridHead}>Available on the day</Text>
            <Text style={s.priceGridSub}>
              Not part of your package. Pay the operator directly if you decide to do them. Prices are
              indicative and set locally.
            </Text>
            {/* 1 item takes the full width; 2 splits 50/50; 3+ goes 3-up,
                same responsive-by-count pattern as Included Activities above. */}
            <View style={s.priceGrid}>
              {data.optionalActivities.map((a) => (
                <View
                  key={a.id}
                  style={[
                    s.priceTile,
                    { width: `${100 / Math.min(data.optionalActivities.length, 3)}%` },
                  ]}
                  wrap={false}
                >
                  <View style={s.priceTileCard}>
                    <View style={s.priceTileImg} />
                    <View style={s.priceTileBody}>
                      <Text style={s.priceTileName}>{a.name}</Text>
                      <Text style={s.priceTileSub}>
                        {a.place}
                        {a.day ? ` · ${a.day}` : ""}
                      </Text>
                      <View style={s.priceTileFootRow}>
                        <Text style={s.priceTileNote}>{a.note}</Text>
                        <Text style={s.priceTileAmount}>{a.price}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* TRANSPORT */}
        <View style={s.sectionGap} wrap={false}>
          <SectionHead title="Transport" tag={data.transportDays ? `Private · ${data.transportDays}` : "Private"} />
          <View style={s.transportCard}>
            <View style={s.transportIconCol}>
              {img(data.transportImage) ? (
                <Image src={img(data.transportImage)} style={s.activityImgFull} />
              ) : (
                <PdfIcon icon="car" size={30} color={C.mint} />
              )}
            </View>
            <View style={s.transportBody}>
              <View style={s.transportMain}>
                <View style={s.transportHeadRow}>
                  <Text style={s.transportType}>{data.transportType}</Text>
                  <Text style={s.privateBadge}>Private</Text>
                </View>
                <Text style={s.transportDesc}>{data.transportDesc}</Text>
                {data.transportTags.length > 0 ? (
                  <View style={s.dayPillRow}>
                    {data.transportTags.map((tag, ti) => (
                      <Text key={ti} style={s.dayPill}>
                        {tag}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
              {data.transportSeats || data.transportBags || data.transportDays ? (
                <View style={s.transportStatCol}>
                  {data.transportSeats ? (
                    <View style={s.transportStatItem}>
                      <PdfIcon icon="users" size={11} color={C.green} solid />
                      <Text style={s.transportStatText}>{data.transportSeats}</Text>
                    </View>
                  ) : null}
                  {data.transportBags ? (
                    <View style={s.transportStatItem}>
                      <PdfIcon icon="briefcase" size={11} color={C.green} />
                      <Text style={s.transportStatText}>{data.transportBags}</Text>
                    </View>
                  ) : null}
                  {data.transportDays ? (
                    <View style={s.transportStatItem}>
                      <PdfIcon icon="calendar" size={11} color={C.green} />
                      <Text style={s.transportStatText}>{data.transportDays}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={s.driverNote} wrap={false}>
          <PdfIcon icon="user-check" size={16} color={C.mint} />
          <Text style={s.driverNoteText}>
            Your driver&apos;s name and number are shared on WhatsApp the evening before arrival,
            along with the pickup point at Srinagar airport.
          </Text>
        </View>

        {data.localTaxis.length > 0 ? (
          <View wrap={false}>
            <Text style={s.priceGridHead}>Where a local taxi is required</Text>
            <Text style={s.priceGridSub}>
              Local unions control access to these points, so your vehicle waits at the stand. This is
              standard across Kashmir and applies to every operator.
            </Text>
            <View style={s.priceGrid}>
              {data.localTaxis.map((t) => (
                <View key={t.id} style={s.priceTile} wrap={false}>
                  <View style={s.priceTileCard}>
                    <View style={s.priceTileBody}>
                      <Text style={s.priceTileName}>{t.name}</Text>
                      <Text style={s.priceTileSub}>
                        {t.place}
                        {t.day ? ` · ${t.day}` : ""}
                      </Text>
                      <View style={s.priceTileFootRow}>
                        <Text style={s.priceTileNote}>{t.note}</Text>
                        <Text style={s.priceTileAmount}>{t.price}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* WHAT'S COVERED — inc/exc grouped by category (a heading renders
            whenever it differs from the previous row); two-tone cards
            (green = included, rust = paid separately) matching the mock. */}
        <View style={s.sectionGap} wrap={false}>
          <SectionHead title="What's Covered" tag={data.totalCost} />
          <View style={s.twoCol}>
            <View style={[s.coveredCard, { borderColor: C.border }]}>
              <View style={[s.coveredCardHead, { backgroundColor: C.green }]}>
                <PdfIcon icon="check" size={12} color={C.mintPale} />
                <Text style={s.coveredCardHeadText}>Included in your package</Text>
              </View>
              <View style={s.coveredCardBody}>
                {incRuns.map((row) => (
                  <View key={row.id}>
                    {row.showCategory ? (
                      <Text style={[s.coveredCategory, { color: C.green }]}>{row.category}</Text>
                    ) : null}
                    <Text style={s.coveredText}>{row.text}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={[s.coveredCard, { borderColor: C.rustBorder }]}>
              <View style={[s.coveredCardHead, { backgroundColor: C.rust }]}>
                <PdfIcon icon="minus" size={12} color={C.rustLight} />
                <Text style={s.coveredCardHeadText}>Excluded</Text>
              </View>
              <View style={s.coveredCardBody}>
                {excRuns.map((row) => (
                  <View key={row.id}>
                    {row.showCategory ? (
                      <Text style={[s.coveredCategory, { color: C.rust }]}>{row.category}</Text>
                    ) : null}
                    <Text style={s.coveredText}>{row.text}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={[s.infoNoteBox, { marginTop: SP.md }]} wrap={false}>
          <PdfIcon icon="cloud-snow" size={14} color={C.green} />
          <Text style={s.infoNoteText}>
            If snowfall, road closure or a security restriction forces a change, we rearrange the day
            at no extra charge. Any additional night or vehicle this creates is charged at cost, with
            your approval first.
          </Text>
        </View>

        {/* PAYMENT & CANCELLATION */}
        <View style={s.sectionGap} wrap={false}>
          <SectionHead title="Payment & Cancellation" tag="Terms & Policies" />
          <View style={s.payStepsCard}>
            <Text style={s.payStepsHead}>How payment works</Text>
            <View style={s.payStepsRow}>
              <View style={s.payStepCol}>
                <View style={s.payStepRow}>
                  <Text style={s.payStepNum1}>1</Text>
                  <Text style={s.payStepTitle}>{data.payStep1Title}</Text>
                </View>
                <Text style={s.payStepDesc}>{data.payStep1Desc}</Text>
              </View>
              <View style={s.payStepDivider} />
              <View style={s.payStepColMid}>
                <View style={s.payStepRow}>
                  <Text style={s.payStepNum2}>2</Text>
                  <Text style={s.payStepTitle}>{data.payStep2Title}</Text>
                </View>
                <Text style={s.payStepDesc}>{data.payStep2Desc}</Text>
              </View>
              <View style={s.payStepDivider} />
              <View style={s.payTagCol}>
                {data.pay.length > 0 ? (
                  <View style={s.payTagRow}>
                    {data.pay.map((tag, ti) => (
                      <Text key={ti} style={s.payTag}>
                        {tag}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {data.payNote ? <Text style={s.payNoteText}>{data.payNote}</Text> : null}
              </View>
            </View>
          </View>
        </View>

        {data.cancel.length > 0 ? (
          <View style={{ marginTop: SP.md }} wrap={false}>
            <View style={s.cancelCard}>
              <View style={s.cancelHead}>
                <Text style={s.cancelHeadTitle}>If you need to cancel</Text>
                <Text style={s.cancelHeadNote}>
                  Notice is counted from your first travel date. Cancellations must be requested by
                  email.
                </Text>
              </View>
              <View style={s.cancelTableHeadRow}>
                <Text style={[s.cancelTableHeadText, { flex: 1 }]}>Notice given before travel</Text>
                <Text style={s.cancelTableHeadText}>Cancellation charge</Text>
              </View>
              {data.cancel.map((tier) => {
                const pct = parseFloat(tier.charge);
                const high = !Number.isNaN(pct) && pct >= 50;
                return (
                  <View key={tier.id} style={s.cancelRow}>
                    <Text style={s.cancelRowLabel}>{tier.label}</Text>
                    <Text style={[s.cancelRowCharge, { color: high ? C.rust : C.green }]}>{tier.charge}</Text>
                  </View>
                );
              })}
              {data.cancelNotes.length > 0 ? (
                <View style={s.cancelNotesRow}>
                  {data.cancelNotes.map((note, ni) => (
                    <View key={ni} style={s.cancelNoteItem}>
                      <PdfIcon icon="clock" size={10} color={C.green} solid />
                      <Text style={s.cancelNoteText}>{note}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* WHY CHOOSE VERTEX — editable itinerary content (data.whyChoose,
            same shape as data.trust). Section omitted entirely if empty. */}
        {data.whyChoose.length > 0 ? (
          <View style={s.whyChoose} wrap={false}>
            <SectionHead title="Why Choose Vertex" />
            <Text style={s.whyChooseIntro}>
              From carefully planned itineraries to reliable local support, we handle the details so
              you can enjoy Kashmir with confidence.
            </Text>
            <View style={s.whyChooseGrid}>
              {data.whyChoose.map((w) => (
                <View key={w.id} style={s.whyChooseItem} wrap={false}>
                  <View style={s.iconChip}>
                    <PdfIcon icon={w.icon} size={11} solid />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.whyChooseItemTitle}>{w.title}</Text>
                    <Text style={s.whyChooseItemDesc}>{w.subtitle}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Footer />
      </Page>

      {/* CLOSING PAGE — dark-green QR block (top), white Thank You + office
          block (bottom). QR reuses the same booking-token Payment Link as
          before; hidden entirely (not a generic fallback) when none could be
          resolved for this itinerary. */}
      <Page size="A4" style={[s.page, s.closingOuter]}>
        <View style={s.closingTop} wrap={false}>
          <Text style={s.closingKicker}>CONFIRM YOUR BOOKING</Text>
          {qrDataUrl ? (
            <>
              <View style={s.qrCard}>
                <Image src={qrDataUrl} style={s.qrImg} />
              </View>
              <Text style={s.qrCaption}>
                {tokenAmountRupees != null
                  ? `Scan to pay ${inr(tokenAmountRupees)}/- and confirm your booking`
                  : "Scan to pay your advance"}
              </Text>
              <Text style={s.qrSubCaption}>Open your phone camera or any UPI app</Text>
            </>
          ) : null}
          <View style={s.paymentMethodRow}>
            {PAYMENT_METHODS.map((m) => (
              <Text key={m} style={s.paymentMethodPill}>
                {m}
              </Text>
            ))}
          </View>
          <Text style={s.securedBy}>SECURED BY RAZORPAY</Text>
        </View>

        <View style={s.closingBottom}>
          <Text style={s.thankYouTitle}>Thank you</Text>
          <Text style={s.thankYouMsg}>
            We look forward to hosting you in Kashmir. If anything here needs changing, or you simply
            want to talk it through before deciding, call or message us — day or night.
          </Text>

          <View style={s.ctaRow}>
            <Link src={waLink(CONTACT.phones[0])} style={s.ctaPrimary}>
              <Text style={s.ctaPrimaryText}>WhatsApp us</Text>
            </Link>
            <Link src={telLink(CONTACT.phones[0])} style={s.ctaSecondary}>
              <Text style={s.ctaSecondaryText}>Call {CONTACT.phones[0]}</Text>
            </Link>
          </View>

          {data.whyChoose.length > 0 ? (
            <View style={s.closingBadgeRow}>
              {data.whyChoose.map((w) => (
                <Text key={w.id} style={s.closingBadge}>
                  {w.title.toUpperCase()}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={s.closingOfficeRow}>
            <View>
              <Text style={s.closingCompany}>{CONTACT.company}</Text>
              <Text style={s.closingOfficeText}>{officeAddress}</Text>
              <Text style={s.closingOfficeText}>
                {CONTACT.phones.join(" · ")}
                {"\n"}
                {CONTACT.email} · {WEBSITE_DISPLAY}
              </Text>
              <Text style={[s.closingOfficeText, { fontSize: 8, marginTop: 4 }]}>{PDF_CONTACT.reg}</Text>
            </View>
            <View style={s.closingSocialRow}>
              {(["instagram", "facebook", "youtube", "whatsapp", "world"] as const).map((icon) => {
                const href = socialHref(icon, socialLinks ?? {});
                return href ? (
                  <Link key={icon} src={href} style={s.closingSocialIcon}>
                    <PdfIcon icon={icon} size={13} color={C.green} solid />
                  </Link>
                ) : (
                  <View key={icon} style={s.closingSocialIcon}>
                    <PdfIcon icon={icon} size={13} color={C.green} solid />
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Groups consecutive rows sharing the same (non-empty) category — the
 * category heading is only shown on the first row of each run, exactly the
 * "changed from the previous row" behaviour the What's Covered section needs. */
function withCategoryRuns<T extends { id: string; category: string; text: string }>(items: T[]) {
  return items.map((item, i) => ({
    ...item,
    showCategory: !!item.category && item.category !== items[i - 1]?.category,
  }));
}

// Icons whose path geometry is a single closed silhouette (verified by
// inspection — each ends its main sub-path with Z/z) — safe to render solid
// (fill, no stroke) for a "premium" look. Icons built from open/disconnected
// strokes (calendar, car, meals, support, users) would look broken if filled
// naively, so they stay outline-only everywhere.
const SOLID_CAPABLE_ICONS = new Set<string>([
  "star",
  "highlights",
  "map-pin",
  "drop",
  "home",
  "shield",
  "users",
  "clock",
  // Brand marks — single closed-path logos, always filled.
  "instagram",
  "facebook",
  "youtube",
  "whatsapp",
]);

// Icons whose 2nd path segment is a detail drawn ON TOP of the solid body
// (a checkmark on `shield`, hour/minute hands on `clock`) — always a white
// stroke overlay, never filled (these are open strokes with no enclosed
// area).
const SOLID_OVERLAY_STROKE_ICONS = new Set<string>(["shield", "clock"]);

// react-pdf equivalent of ItineraryIcon (./icons.tsx) — same path registry, so
// the PDF's icons never drift from the live editor's. react-pdf has no <img>
// equivalent for inline vector icons, hence the separate Svg/Path render here
// rather than reusing the DOM <svg>-based ItineraryIcon component directly.
export function PdfIcon({
  icon,
  size = 12,
  color = C.green,
  strokeWidth = 1.8,
  solid = false,
}: {
  icon: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Render as a filled silhouette instead of an outline — only applied for icons in SOLID_CAPABLE_ICONS, ignored otherwise. */
  solid?: boolean;
}) {
  const d = ITINERARY_ICON_PATHS[icon as ItineraryIconKey] ?? "M12 8v0 M12 12v0 M12 16v0";
  const useSolid = solid && SOLID_CAPABLE_ICONS.has(icon);
  const segments = d.split(" M").map((seg, i) => (i === 0 ? seg : `M${seg}`));
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      {segments.map((seg, i) => {
        const isOverlayStroke = SOLID_OVERLAY_STROKE_ICONS.has(icon) && i === 1;
        if (useSolid && !isOverlayStroke) {
          return <Path key={i} d={seg} fill={color} stroke="none" />;
        }
        return (
          <Path
            key={i}
            d={seg}
            fill="none"
            stroke={isOverlayStroke ? C.white : color}
            strokeWidth={isOverlayStroke ? 2 : strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </Svg>
  );
}
