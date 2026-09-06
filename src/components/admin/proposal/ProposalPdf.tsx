/* eslint-disable jsx-a11y/alt-text */
// PDF rendering of the 3-tier proposal using @react-pdf/renderer primitives.
// Built to match a supplied 6-page HTML mockup as closely as possible, reusing
// ItineraryPdf.tsx's established visual patterns (What's Covered cards,
// Payment & Cancellation steps/table, closing office/social footer) wherever
// the mockup's own sections are structurally identical to it.
//
// No per-tier/per-day photo fields anywhere (unlike the Itinerary PDF) — this
// document is otherwise typography/icon/color driven. `images` is used only
// to embed the one real brand asset (the icon mark) behind the watermarks and
// the closing logo, same lossless data-URL technique as ItineraryPdf.tsx.

import { Document, Page, View, Text, Image, Svg, Path, Link, StyleSheet } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import {
  type ProposalData,
  type ProposalTierKey,
  TIER_ORDER,
  COMPARISON_DASH,
  COMPARISON_CHECK,
} from "@/types/proposal";
import { PDF_CONTACT, type PdfSocialLinks } from "@/lib/pdf/contact";
import { SITE_URL } from "@/lib/seo";
import type { PdfTrustContent } from "@/lib/itinerary/pdfTrustContent";
import { ITINERARY_ICON_PATHS, type ItineraryIconKey } from "../itinerary/icons";

// The brand icon mark — same asset ItineraryPdf.tsx uses for its own
// watermark. Redefined here (not imported from ItineraryPdf.tsx) to avoid
// pulling in that entire ~1600-line module as a side effect.
export const LOGO_SRC = "/brand/png/icon/vertex-icon-512.png";
// Horizontal wordmark lockups — "dark" is light-text-on-dark (cover), "light"
// is dark-text-on-light (the white body-page header). Same assets/naming as
// ItineraryPdf.tsx.
export const LOGO_DARK_SRC = "/brand/png/horizontal/vertex-horizontal-dark-1600w.png";
export const LOGO_LIGHT_SRC = "/brand/png/horizontal/vertex-horizontal-light-1600w.png";
export const LOGO_ASSETS = [LOGO_SRC, LOGO_DARK_SRC, LOGO_LIGHT_SRC] as const;

// Same muted forest-green system + rust accent as ItineraryPdf.tsx's `C` —
// this mockup uses the identical palette.
const C = {
  green: "#145C3E",
  greenDeep: "#0B2C1D",
  greenMid: "#1C4A33",
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
  white: "#ffffff",
};

const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

const CONTACT = {
  ...PDF_CONTACT,
  phones: PDF_CONTACT.phone.split(" / ").map((p) => p.trim()),
};
const WEBSITE_DISPLAY = SITE_URL.replace(/^https?:\/\//, "");

function waLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, "")}`;
}

/** Resolves the real URL a footer/closing social icon should link to, or
 * undefined if none is configured — the icon then renders as a plain
 * (non-clickable) decoration rather than a dead link. Copied from
 * ItineraryPdf.tsx's own helper (kept independent, same reasoning as PdfIcon
 * below). */
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

const s = StyleSheet.create({
  page: {
    paddingTop: 58,
    paddingBottom: 46,
    paddingHorizontal: 40,
    fontSize: 10,
    color: C.ink,
    fontFamily: "Helvetica",
  },

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
  headerTag: { fontSize: 7.5, color: C.muted, letterSpacing: 1 },
  brandName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.ink },
  headerLogo: { width: 100, height: 25, objectFit: "contain" },

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

  sectionGap: { marginTop: SP.xxl },
  secHeadRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: SP.md,
  },
  secHead: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.green },
  secTag: { fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  secIntro: { fontSize: 10, color: C.body, lineHeight: 1.6, marginBottom: SP.md },

  // Faint repeating brand mark (the real icon asset, not a text letterform)
  // behind every sheet of the body page.
  bodyWatermark: { position: "absolute", right: -10, bottom: 20, width: 240, height: 240, opacity: 0.045 },

  // ── Cover (page 1) ────────────────────────────────────────────────────────
  cover: { padding: 0, backgroundColor: C.greenDeep },
  coverWatermark: { position: "absolute", right: -60, top: 110, width: 420, height: 420, opacity: 0.06 },
  watermarkImg: { width: "100%", height: "100%", objectFit: "contain" },
  coverContent: { position: "relative", padding: 40, height: "100%" },
  coverBrandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  coverBrandName: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.white },
  coverBrandSub: { fontSize: 8, letterSpacing: 2.5, color: C.mint, marginTop: 2 },
  coverLogo: { width: 140, height: 35, objectFit: "contain" },
  preparedByBox: { alignItems: "flex-end" },
  preparedByLabel: { fontSize: 7.5, letterSpacing: 1.4, color: C.mint },
  preparedByName: { fontSize: 12, color: C.white, marginTop: 4 },
  preparedByPhone: { fontSize: 9, color: "#5E9C7B", marginTop: 2 },

  coverTitleBlock: { marginTop: 90 },
  // Fills the blank stretch between the intro paragraph and the bottom stat
  // row (which is pinned down via coverBottomBlock's marginTop: "auto") with
  // a large centered "Prepared For" — otherwise empty space on shorter cover
  // copy.
  coverPreparedForCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverPreparedForLabel: { fontSize: 11, letterSpacing: 7, color: C.mint },
  coverPreparedForName: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.white, marginTop: 10 },
  quoteLine: { fontSize: 8.5, letterSpacing: 2.5, color: C.mint, marginBottom: 12 },
  coverTitle: { fontSize: 44, fontFamily: "Helvetica-Bold", color: C.white, lineHeight: 1 },
  coverSubtitle: { fontSize: 44, fontFamily: "Helvetica", fontWeight: 300, color: C.mint, lineHeight: 1.1 },
  coverDivider: { width: 48, height: 2, backgroundColor: "#4E8B6B", marginTop: 20, marginBottom: 16 },
  coverIntro: { fontSize: 11, color: C.mintPale, lineHeight: 1.7, maxWidth: 340 },

  coverBottomBlock: { marginTop: "auto" },
  coverStatRow: {
    flexDirection: "row",
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(127,191,158,0.25)",
  },
  coverStatCol: { flex: 1 },
  coverStatLabel: { fontSize: 8, color: C.mint, letterSpacing: 1.2 },
  coverStatValue: { fontSize: 15, color: C.white, fontFamily: "Helvetica-Bold", marginTop: 5 },

  coverPriceRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  coverPriceBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(127,191,158,0.3)",
    borderRadius: 8,
    padding: 11,
  },
  coverPriceBoxPremium: {
    flex: 1,
    backgroundColor: "rgba(127,191,158,0.14)",
    borderWidth: 1,
    borderColor: C.mint,
    borderRadius: 8,
    padding: 11,
    position: "relative",
  },
  coverPriceLabel: { fontSize: 8, color: C.mint, letterSpacing: 1.4 },
  coverPriceValue: { fontSize: 16, color: C.white, fontFamily: "Helvetica-Bold", marginTop: 6 },
  coverPriceNote: { fontSize: 8, color: "#5E9C7B", marginTop: 4 },
  coverPriceBadge: {
    position: "absolute",
    top: -8,
    right: 10,
    fontSize: 6.5,
    color: C.greenDeep,
    backgroundColor: C.mint,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderRadius: 99,
    letterSpacing: 0.6,
  },
  coverFootnote: { fontSize: 8, color: "#5E9C7B", marginTop: 12, letterSpacing: 0.4 },

  // ── Options page (page 2) ───────────────────────────────────────────────
  optionCard: { borderRadius: 10, padding: SP.md + 5, marginBottom: SP.md },
  optionHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  optionEyebrow: { fontSize: 8.5, letterSpacing: 1.8 },
  optionTitle: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 5 },
  optionDesc: { fontSize: 10, lineHeight: 1.6, marginTop: 5, maxWidth: 330 },
  optionPriceValue: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  optionPriceNote: { fontSize: 8, marginTop: 3 },
  optionTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: SP.md,
    paddingTop: SP.sm + 2,
    borderTopWidth: 1,
  },
  optionTag: { fontSize: 8.5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 5 },
  optionBadge: {
    position: "absolute",
    top: -8,
    left: 16,
    fontSize: 7.5,
    color: C.white,
    backgroundColor: C.green,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 99,
    letterSpacing: 1,
  },
  tipBox: {
    flexDirection: "row",
    gap: SP.sm + 2,
    backgroundColor: C.lightGreen,
    borderRadius: 9,
    padding: SP.sm + 3,
    alignItems: "flex-start",
    marginTop: SP.sm,
  },
  tipText: { flex: 1, fontSize: 9.5, color: C.greenMid, lineHeight: 1.6 },

  // ── Comparison page (page 3) ────────────────────────────────────────────
  cmpTable: { borderWidth: 1, borderColor: C.border, borderRadius: 10, overflow: "hidden" },
  cmpHeadRow: { flexDirection: "row", backgroundColor: C.greenDeep },
  cmpHeadCellLabel: { flex: 1.25, padding: SP.sm + 3 },
  cmpHeadCell: {
    flex: 1,
    padding: SP.sm + 3,
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(127,191,158,0.2)",
  },
  cmpHeadCellPremium: { backgroundColor: "rgba(127,191,158,0.14)" },
  cmpHeadText: { fontSize: 8.5, color: C.mint, letterSpacing: 1.2 },
  cmpHeadTextPremium: { color: C.white },
  cmpRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: C.borderLight },
  cmpRowLabelCell: { flex: 1.25, padding: SP.sm + 3 },
  cmpRowLabel: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.ink },
  cmpCell: {
    flex: 1,
    padding: SP.sm + 3,
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: C.borderLight,
  },
  cmpCellPremium: { backgroundColor: C.bgSubtle },
  cmpCellText: { fontSize: 9, color: C.body, textAlign: "center" },
  cmpCellTextStrong: { fontSize: 9, color: C.green, fontFamily: "Helvetica-Bold", textAlign: "center" },
  cmpCellDash: { fontSize: 10, color: "#C9D8CF" },
  cmpTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bgSubtle,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  cmpTotalLabel: { flex: 1.25, padding: SP.sm + 4, fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.ink },
  cmpTotalCell: {
    flex: 1,
    padding: SP.sm + 4,
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: C.borderLight,
  },
  cmpTotalCellPremium: { backgroundColor: C.lightGreen },
  cmpTotalValue: { fontSize: 12.5, fontFamily: "Helvetica-Bold", color: C.ink },
  cmpFootnote: { fontSize: 8.5, color: C.muted, marginTop: SP.md, lineHeight: 1.6 },

  // ── Six Days timeline (page 4) ──────────────────────────────────────────
  dayRow: { flexDirection: "row", gap: SP.md },
  railCol: { width: 16, alignItems: "center" },
  railDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: C.green, marginTop: 5 },
  railLine: { flex: 1, width: 2, backgroundColor: C.border, marginTop: 3, marginBottom: 3 },
  dayCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: SP.md + 1,
    marginBottom: SP.md,
  },
  dayHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  dayNumTitle: { flexDirection: "row", alignItems: "baseline", gap: 9 },
  dayNum: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.mintPale },
  dayTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.ink },
  dayDate: { fontSize: 9, color: C.muted },
  dayBody: { fontSize: 9.5, color: C.body, lineHeight: 1.6, marginBottom: SP.sm },
  dayMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    paddingTop: SP.sm - 1,
    borderTopWidth: 1,
    borderTopColor: C.borderLight,
  },
  dayMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dayMetaText: { fontSize: 9, color: C.muted },
  dayMetaDivider: { width: 1, height: 10, backgroundColor: C.border },

  // ── What's Covered + Payment & Cancellation (page 5, shared w/ ItineraryPdf) ─
  twoCol: { flexDirection: "row", gap: SP.lg },
  coveredCard: { flex: 1, borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  coveredCardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: SP.md,
  },
  coveredCardHeadText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.white },
  coveredCardBody: { padding: SP.md },
  coveredCategory: {
    fontSize: 8.5,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 5,
    marginTop: SP.sm + 2,
  },
  coveredText: { fontSize: 9.5, color: C.body, lineHeight: 1.55, marginBottom: 2 },

  payStepsCard: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: SP.md + 3 },
  payStepsHead: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink, marginBottom: SP.md },
  payStepsRow: { flexDirection: "row", alignItems: "stretch" },
  payStepCol: { flex: 1, paddingRight: SP.lg + 2 },
  payStepColMid: { flex: 1, paddingHorizontal: SP.lg + 2 },
  payStepDivider: { width: 1, backgroundColor: C.borderLight },
  payStepRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
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
  payTag: {
    fontSize: 9,
    color: C.green,
    backgroundColor: C.lightGreen,
    paddingVertical: 3.5,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
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
  cancelNotesRow: {
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm + 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SP.md,
  },
  cancelNoteItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  cancelNoteText: { fontSize: 8.5, color: C.muted },

  infoNoteBox: {
    flexDirection: "row",
    gap: SP.sm + 2,
    backgroundColor: C.lightGreen,
    borderRadius: 9,
    padding: SP.sm + 3,
    alignItems: "flex-start",
  },
  infoNoteText: { flex: 1, fontSize: 9.5, color: C.greenMid, lineHeight: 1.5 },

  // ── Why Choose Us (after Payment & Cancellation, same pattern as
  //    ItineraryPdf.tsx's "Why Choose Vertex" section) ─────────────────────
  trustHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SP.sm + 2,
  },
  reviewBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  reviewStars: { flexDirection: "row", gap: 1 },
  reviewText: { fontSize: 8.5, color: C.muted },
  reviewTextStrong: { fontFamily: "Helvetica-Bold", color: C.ink },
  whyChooseIntro: {
    fontSize: 10,
    color: C.body,
    lineHeight: 1.4,
    marginBottom: SP.sm + 2,
    fontStyle: "italic",
  },
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
  iconChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.lightGreen,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Closing (page 6) ─────────────────────────────────────────────────────
  closingOuter: { padding: 0 },
  closingTop: { backgroundColor: C.greenDeep, paddingVertical: 40, paddingHorizontal: 40, position: "relative" },
  closingWatermark: { position: "absolute", right: -30, bottom: -70, width: 260, height: 260, opacity: 0.07 },
  closingKicker: { fontSize: 9, letterSpacing: 3, color: C.mint },
  closingHeadline: { fontSize: 24, color: C.white, fontFamily: "Helvetica-Bold", marginTop: 14, lineHeight: 1.25 },
  confirmStepsRow: { flexDirection: "row", marginTop: 24 },
  confirmStepCol: { flex: 1, paddingRight: 14 },
  confirmStepColMid: { flex: 1, paddingHorizontal: 14, borderLeftWidth: 1, borderLeftColor: "rgba(127,191,158,0.22)" },
  confirmStepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.mint,
    color: C.greenDeep,
    fontSize: 10.5,
    textAlign: "center",
    paddingTop: 5,
  },
  confirmStepTitle: { fontSize: 10.5, color: C.white, fontFamily: "Helvetica-Bold", marginTop: 9 },
  confirmStepDesc: { fontSize: 8.5, color: "#9DC5B1", marginTop: 4, lineHeight: 1.5 },

  closingBottom: { padding: 40, flex: 1 },
  ctaRow: { flexDirection: "row", gap: 10, maxWidth: 400 },
  ctaPrimary: { flex: 1, backgroundColor: C.green, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  ctaPrimaryText: { fontSize: 10.5, color: C.white },
  ctaSecondary: { flex: 1, borderWidth: 1, borderColor: C.green, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  ctaSecondaryText: { fontSize: 10.5, color: C.green },
  closingHoldNote: { fontSize: 10, color: C.body, marginTop: SP.xl, lineHeight: 1.65, maxWidth: 400 },
  closingBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SP.lg },
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
  // Centered brand mark filling the otherwise-blank stretch between the
  // badge row and the office footer (which is pinned to the bottom via
  // `marginTop: "auto"` on closingOfficeRow below).
  closingLogoWrap: { alignItems: "center", justifyContent: "center", marginTop: SP.xxl },
  closingLogoImg: { width: 280, height: 70, objectFit: "contain" },
  // Fallback when the logo image couldn't be embedded — icon-in-circle + caption.
  closingLogoBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: C.lightGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  closingLogoBadgeText: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.green },
  closingLogoText: { fontSize: 9, letterSpacing: 2, color: C.muted, marginTop: 8 },
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

// Same module-level threading trick as ItineraryPdf.tsx's Footer — it has no
// props (used `fixed` across every sheet of the flowing body page), so this
// is set once per render just before the body <Page>.
let footerQuoteNumber = "";
// Same module-level threading trick, for the footer's social icon links.
let footerSocialLinks: PdfSocialLinks = {};
// ...and for the small brand mark centered above them.
let footerLogoSrc: string | undefined;

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

/** Groups consecutive rows sharing the same (non-empty) category — identical
 * to ItineraryPdf.tsx's helper, copied rather than imported to keep this
 * module independent of the itinerary PDF's internals. */
function withCategoryRuns<T extends { id: string; category: string; text: string }>(items: T[]) {
  return items.map((item, i) => ({
    ...item,
    showCategory: !!item.category && item.category !== items[i - 1]?.category,
  }));
}

/** Comparison-cell sentinel convention (see src/types/proposal.ts): a dash
 * renders muted, a check renders as the green check icon, anything else
 * renders as literal text. */
function renderCell(value: string, premium: boolean) {
  const v = value.trim();
  if (v === "" || v === "-" || v === COMPARISON_DASH) {
    return <Text style={s.cmpCellDash}>{COMPARISON_DASH}</Text>;
  }
  if (v === COMPARISON_CHECK || v.toLowerCase() === "yes") {
    return <PdfIcon icon="check" size={12} color={C.green} />;
  }
  return <Text style={premium ? s.cmpCellTextStrong : s.cmpCellText}>{v}</Text>;
}

// Icons whose path geometry is a single closed silhouette — safe to render
// solid. Copied from ItineraryPdf.tsx's own list (kept independent rather
// than imported, same reasoning as withCategoryRuns above).
const SOLID_CAPABLE_ICONS = new Set<string>([
  "star",
  "highlights",
  "map-pin",
  "drop",
  "home",
  "shield",
  "users",
  "clock",
  "instagram",
  "facebook",
  "youtube",
  "whatsapp",
]);
const SOLID_OVERLAY_STROKE_ICONS = new Set<string>(["shield", "clock"]);

function PdfIcon({
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

// Per-tier visual variant for the page-2 option cards — budget is outlined,
// premium is highlighted with a badge, luxury is dark/inverted, matching the
// mockup's three distinct treatments rather than one shared style.
const TIER_PALETTE: Record<
  ProposalTierKey,
  {
    card: Style;
    eyebrow: Style;
    title: Style;
    desc: Style;
    price: Style;
    priceNote: Style;
    tagRow: Style;
    tag: Style;
  }
> = {
  budget: {
    card: { borderWidth: 1, borderColor: C.border, backgroundColor: C.white },
    eyebrow: { color: C.muted },
    title: { color: C.ink },
    desc: { color: C.body },
    price: { color: C.ink },
    priceNote: { color: C.muted },
    tagRow: { borderTopColor: C.borderLight },
    tag: { color: C.body, backgroundColor: C.bgSubtle },
  },
  premium: {
    card: { borderWidth: 2, borderColor: C.green, backgroundColor: "#F7FBF9" },
    eyebrow: { color: C.green },
    title: { color: C.ink },
    desc: { color: C.body },
    price: { color: C.green },
    priceNote: { color: C.muted },
    tagRow: { borderTopColor: C.border },
    tag: { color: C.green, backgroundColor: C.lightGreen },
  },
  luxury: {
    card: { backgroundColor: C.greenDeep },
    eyebrow: { color: C.mint },
    title: { color: C.white },
    desc: { color: C.mintPale },
    price: { color: C.mint },
    priceNote: { color: "#5E9C7B" },
    tagRow: { borderTopColor: "rgba(127,191,158,0.25)" },
    tag: { color: C.greenDeep, backgroundColor: C.mint },
  },
};

interface Props {
  data: ProposalData;
  /** original src -> embedded data URL (only the brand icon mark, see LOGO_ASSETS above) */
  images?: Record<string, string>;
  /** Resolved Corporate Office (or Registered Office fallback). */
  address?: string;
  /** Real review-rating + Why Choose Vertex content, fetched fresh (not stored per-proposal). */
  trustContent?: PdfTrustContent;
  /** Real Instagram/Facebook/YouTube profile URLs (SiteSettings) — makes the footer/closing social icons clickable. */
  socialLinks?: PdfSocialLinks;
}

export function ProposalPdf({ data, images = {}, address, trustContent, socialLinks = {} }: Props) {
  const img = (src: string) => images[src];
  const officeAddress = address ?? PDF_CONTACT.address;
  footerQuoteNumber = data.quoteNumber;
  footerSocialLinks = socialLinks;
  footerLogoSrc = img(LOGO_SRC);
  const incRuns = withCategoryRuns(data.inc);
  const excRuns = withCategoryRuns(data.exc);

  return (
    <Document title={`Proposal - ${data.preparedFor}`} author="Vertex Kashmir Holidays">
      {/* COVER */}
      <Page size="A4" style={[s.page, s.cover]}>
        {img(LOGO_SRC) ? (
          <View style={s.coverWatermark}>
            <Image src={img(LOGO_SRC)} style={s.watermarkImg} />
          </View>
        ) : null}
        <View style={s.coverContent}>
          <View style={s.coverBrandRow}>
            {img(LOGO_DARK_SRC) ? (
              <Image src={img(LOGO_DARK_SRC)} style={s.coverLogo} />
            ) : (
              <View>
                <Text style={s.coverBrandName}>Vertex</Text>
                <Text style={s.coverBrandSub}>KASHMIR HOLIDAYS</Text>
              </View>
            )}
            {data.preparedByName ? (
              <View style={s.preparedByBox}>
                <Text style={s.preparedByLabel}>PREPARED BY</Text>
                <Text style={s.preparedByName}>{data.preparedByName}</Text>
                {data.preparedByPhone ? (
                  <Text style={s.preparedByPhone}>{data.preparedByPhone}</Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={s.coverTitleBlock}>
            {data.quoteNumber ? (
              <Text style={s.quoteLine}>TRAVEL PROPOSAL · {data.quoteNumber}</Text>
            ) : null}
            <Text style={s.coverTitle}>{data.coverTitle}</Text>
            <Text style={s.coverSubtitle}>{data.coverSubtitle}</Text>
            <View style={s.coverDivider} />
            {data.coverIntro ? <Text style={s.coverIntro}>{data.coverIntro}</Text> : null}
          </View>

          {data.preparedFor ? (
            <View style={s.coverPreparedForCenter}>
              <Text style={s.coverPreparedForLabel}>PREPARED FOR</Text>
              <Text style={s.coverPreparedForName}>{data.preparedFor}</Text>
            </View>
          ) : null}

          <View style={s.coverBottomBlock}>
            <View style={s.coverStatRow}>
              <View style={s.coverStatCol}>
                <Text style={s.coverStatLabel}>PREPARED FOR</Text>
                <Text style={s.coverStatValue}>{data.preparedFor}</Text>
              </View>
              <View style={s.coverStatCol}>
                <Text style={s.coverStatLabel}>TRAVEL DATES</Text>
                <Text style={s.coverStatValue}>{data.travelDates}</Text>
              </View>
              <View style={[s.coverStatCol, { flex: 0.8 }]}>
                <Text style={s.coverStatLabel}>TRAVELLERS</Text>
                <Text style={s.coverStatValue}>{data.travelers}</Text>
              </View>
            </View>

            <View style={s.coverPriceRow}>
              {TIER_ORDER.map((key) => {
                const tier = data.tiers[key];
                const premium = key === "premium";
                return (
                  <View key={key} style={premium ? s.coverPriceBoxPremium : s.coverPriceBox}>
                    {tier.badgeLabel ? (
                      <Text style={s.coverPriceBadge}>{tier.badgeLabel}</Text>
                    ) : null}
                    <Text style={s.coverPriceLabel}>{tier.label.toUpperCase()}</Text>
                    <Text style={s.coverPriceValue}>{tier.priceLabel}</Text>
                    <Text style={s.coverPriceNote}>{tier.coverNote}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={s.coverFootnote}>
              TOTAL FOR THE PARTY · ALL INCLUSIVE OF GST · VALID 7 DAYS
            </Text>
          </View>
        </View>
      </Page>

      {/* BODY — one continuous flowing page (options, comparison, days,
          covered + payment/cancellation) so content fills each sheet instead
          of leaving whitespace after every section. */}
      <Page size="A4" style={s.page}>
        {img(LOGO_SRC) ? (
          <View style={s.bodyWatermark} fixed>
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

        {/* YOUR THREE OPTIONS */}
        <SectionHead title="Your Three Options" tag={data.duration} />
        <Text style={s.secIntro}>
          Every option follows the same route and the same days. What changes is where you sleep,
          what you eat, what you ride in, and what is already paid for before you land.
        </Text>
        {TIER_ORDER.map((key) => {
          const tier = data.tiers[key];
          const palette = TIER_PALETTE[key];
          return (
            <View key={key} style={[s.optionCard, palette.card]} wrap={false}>
              {tier.badgeLabel ? <Text style={s.optionBadge}>{tier.badgeLabel}</Text> : null}
              <View style={s.optionHeadRow}>
                <View style={{ flex: 1, paddingRight: SP.md }}>
                  <Text style={[s.optionEyebrow, palette.eyebrow]}>{tier.label.toUpperCase()}</Text>
                  <Text style={[s.optionTitle, palette.title]}>{tier.title}</Text>
                  <Text style={[s.optionDesc, palette.desc]}>{tier.description}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.optionPriceValue, palette.price]}>{tier.priceLabel}</Text>
                  <Text style={[s.optionPriceNote, palette.priceNote]}>total · GST included</Text>
                </View>
              </View>
              {tier.tags.length > 0 ? (
                <View style={[s.optionTagRow, palette.tagRow]}>
                  {tier.tags.map((tag, ti) => (
                    <Text key={ti} style={[s.optionTag, palette.tag]}>
                      {tag}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {data.tipText ? (
          <View style={s.tipBox} wrap={false}>
            <PdfIcon icon="bulb" size={14} color={C.green} />
            <Text style={s.tipText}>{data.tipText}</Text>
          </View>
        ) : null}

        {/* WHAT ACTUALLY DIFFERS — always starts on its own fresh page
            (`break`), rather than wherever it happens to land after the
            option cards. */}
        {data.comparisonRows.length > 0 ? (
          <View style={s.sectionGap} break>
            <SectionHead title="What Actually Differs" tag="Side by Side" />
            <View style={s.cmpTable}>
              <View style={s.cmpHeadRow} wrap={false}>
                <View style={s.cmpHeadCellLabel} />
                {TIER_ORDER.map((key) => (
                  <View key={key} style={[s.cmpHeadCell, key === "premium" ? s.cmpHeadCellPremium : {}]}>
                    <Text style={[s.cmpHeadText, key === "premium" ? s.cmpHeadTextPremium : {}]}>
                      {data.tiers[key].label.toUpperCase()}
                    </Text>
                  </View>
                ))}
              </View>
              {data.comparisonRows.map((row) => (
                <View key={row.id} style={s.cmpRow} wrap={false}>
                  <View style={s.cmpRowLabelCell}>
                    <Text style={s.cmpRowLabel}>{row.label}</Text>
                  </View>
                  {TIER_ORDER.map((key) => (
                    <View key={key} style={[s.cmpCell, key === "premium" ? s.cmpCellPremium : {}]}>
                      {renderCell(row[key], key === "premium")}
                    </View>
                  ))}
                </View>
              ))}
              <View style={s.cmpTotalRow} wrap={false}>
                <Text style={s.cmpTotalLabel}>Total, GST included</Text>
                {TIER_ORDER.map((key) => (
                  <View key={key} style={[s.cmpTotalCell, key === "premium" ? s.cmpTotalCellPremium : {}]}>
                    <Text style={s.cmpTotalValue}>{data.tiers[key].priceLabel}</Text>
                  </View>
                ))}
              </View>
            </View>
            {data.comparisonFootnote ? (
              <Text style={s.cmpFootnote}>{data.comparisonFootnote}</Text>
            ) : null}
          </View>
        ) : null}

        {/* YOUR SIX DAYS */}
        {data.days.length > 0 ? (
          <View style={s.sectionGap}>
            <SectionHead
              title="Your Six Days"
              tag="Same in All Three Options"
              minPresenceAhead={140}
            />
            {data.days.map((day, i) => (
              <View key={day.id} style={s.dayRow} wrap={false}>
                <View style={s.railCol}>
                  <View style={s.railDot} />
                  {i < data.days.length - 1 ? <View style={s.railLine} /> : null}
                </View>
                <View style={s.dayCard}>
                  <View style={s.dayHeadRow}>
                    <View style={s.dayNumTitle}>
                      <Text style={s.dayNum}>{String(i + 1).padStart(2, "0")}</Text>
                      <Text style={s.dayTitle}>{day.title}</Text>
                    </View>
                    {day.dateLabel ? <Text style={s.dayDate}>{day.dateLabel}</Text> : null}
                  </View>
                  {day.body ? <Text style={s.dayBody}>{day.body}</Text> : null}
                  {day.stayLabel || day.highlightsLine ? (
                    <View style={s.dayMetaRow}>
                      {day.stayLabel ? (
                        <View style={s.dayMetaItem}>
                          <PdfIcon icon="stay" size={11} color={C.green} />
                          <Text style={s.dayMetaText}>{day.stayLabel}</Text>
                        </View>
                      ) : (
                        <View style={s.dayMetaItem}>
                          <PdfIcon icon="plane" size={11} color={C.green} />
                        </View>
                      )}
                      {day.stayLabel && day.highlightsLine ? <View style={s.dayMetaDivider} /> : null}
                      {day.highlightsLine ? (
                        <Text style={s.dayMetaText}>{day.highlightsLine}</Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* WHAT'S COVERED */}
        <View style={s.sectionGap} wrap={false}>
          <SectionHead title="What's Covered" tag="All Three Options" />
          <View style={s.twoCol}>
            <View style={[s.coveredCard, { borderColor: C.border }]}>
              <View style={[s.coveredCardHead, { backgroundColor: C.green }]}>
                <PdfIcon icon="check" size={12} color={C.mintPale} />
                <Text style={s.coveredCardHeadText}>Included in every option</Text>
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
            <View style={[s.coveredCard, { borderColor: C.border }]}>
              <View style={[s.coveredCardHead, { backgroundColor: C.rust }]}>
                <PdfIcon icon="minus" size={12} color={C.mintPale} />
                <Text style={s.coveredCardHeadText}>Paid separately</Text>
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

        {data.policyNote ? (
          <View style={[s.infoNoteBox, { marginTop: SP.md }]} wrap={false}>
            <PdfIcon icon="cloud-snow" size={14} color={C.green} />
            <Text style={s.infoNoteText}>{data.policyNote}</Text>
          </View>
        ) : null}

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
                    <Text style={[s.cancelRowCharge, { color: high ? C.rust : C.green }]}>
                      {tier.charge}
                    </Text>
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

        {/* WHY CHOOSE US */}
        {data.whyChoose.length > 0 ? (
          <View style={s.sectionGap} wrap={false}>
            <View style={s.trustHeadRow}>
              <Text style={s.secHead}>Why Choose Us</Text>
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
            <Text style={s.whyChooseIntro}>
              From carefully planned itineraries to reliable local support, we handle the details so you
              can enjoy Kashmir with confidence.
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

      {/* CLOSING */}
      <Page size="A4" style={[s.page, s.closingOuter]}>
        <View style={s.closingTop} wrap={false}>
          {img(LOGO_SRC) ? (
            <View style={s.closingWatermark}>
              <Image src={img(LOGO_SRC)} style={s.watermarkImg} />
            </View>
          ) : null}
          <Text style={s.closingKicker}>HOW TO CONFIRM</Text>
          <Text style={s.closingHeadline}>Tell us which one,{"\n"}and we do the rest.</Text>
          <View style={s.confirmStepsRow}>
            <View style={s.confirmStepCol}>
              <Text style={s.confirmStepBadge}>1</Text>
              <Text style={s.confirmStepTitle}>{data.confirmStep1Title}</Text>
              <Text style={s.confirmStepDesc}>{data.confirmStep1Desc}</Text>
            </View>
            <View style={s.confirmStepColMid}>
              <Text style={s.confirmStepBadge}>2</Text>
              <Text style={s.confirmStepTitle}>{data.confirmStep2Title}</Text>
              <Text style={s.confirmStepDesc}>{data.confirmStep2Desc}</Text>
            </View>
            <View style={s.confirmStepColMid}>
              <Text style={s.confirmStepBadge}>3</Text>
              <Text style={s.confirmStepTitle}>{data.confirmStep3Title}</Text>
              <Text style={s.confirmStepDesc}>{data.confirmStep3Desc}</Text>
            </View>
          </View>
        </View>

        <View style={s.closingBottom}>
          <View style={s.ctaRow}>
            <Link src={waLink(CONTACT.phones[0])} style={s.ctaPrimary}>
              <Text style={s.ctaPrimaryText}>WhatsApp {CONTACT.phones[0]}</Text>
            </Link>
            <Link src={`mailto:${CONTACT.email}`} style={s.ctaSecondary}>
              <Text style={s.ctaSecondaryText}>Email us</Text>
            </Link>
          </View>

          {data.closingHoldNote ? <Text style={s.closingHoldNote}>{data.closingHoldNote}</Text> : null}

          <View style={s.closingBadgeRow}>
            {data.whyChoose.map((w) => (
              <Text key={w.id} style={s.closingBadge}>
                {w.title.toUpperCase()}
              </Text>
            ))}
            {trustContent?.rating ? (
              <Text style={s.closingBadge}>
                {trustContent.rating.title.toUpperCase()} · {trustContent.rating.subtitle.toUpperCase()}
              </Text>
            ) : null}
          </View>

          <View style={s.closingLogoWrap}>
            {img(LOGO_LIGHT_SRC) ? (
              <Image src={img(LOGO_LIGHT_SRC)} style={s.closingLogoImg} />
            ) : (
              <>
                <View style={s.closingLogoBadge}>
                  <Text style={s.closingLogoBadgeText}>V</Text>
                </View>
                <Text style={s.closingLogoText}>VERTEX KASHMIR HOLIDAYS</Text>
              </>
            )}
          </View>

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
                const href = socialHref(icon, socialLinks);
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
