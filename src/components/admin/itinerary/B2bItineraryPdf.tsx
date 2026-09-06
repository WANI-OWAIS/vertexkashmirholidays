/* eslint-disable jsx-a11y/alt-text */
// Dedicated B2B PDF template — same @react-pdf/renderer tooling and the same
// ItineraryData shape as the normal customer document (ItineraryPdf.tsx), but
// a genuinely different, simpler "quotation document" layout modelled on
// docs/Vertex-b2b-Template.pdf: dark header bar, plain tables, no photos, no
// booking/payment machinery.
//
// White-labeled for the B2B partner: this document carries the AGENT's own
// branding (logo, agency name, phone, email) in the header/footer/document
// metadata, never Vertex's — a partner forwards this quote to their own end
// customer under their own name, so no "Vertex Kashmir Holidays" mention
// belongs anywhere in the rendered output or the exported file. Only the
// layout/accent-color system (navy + green, modelled on the reference file)
// is Vertex's own design choice, not a textual/visual brand mention.
//
// Deliberately does NOT reuse ItineraryPdf's photo-heavy cover/day-card
// styling: the reference has none of that, and Phase 4 is presentation-only
// (no new persisted data), so this renders straight from the same fields the
// normal PDF uses, just laid out differently. Fields the reference has no
// section for (trust, activities, hotelImages, coverImage) are simply unused
// here — never fabricated, never dropped from the data itself. whyChoose is
// the one exception: rendered as compact icon+title+subtitle cards (not the
// normal PDF's fuller intro-paragraph version) to fill page-2 whitespace.
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ItineraryData, ItineraryStatus } from "@/types/itinerary";
import { PdfIcon } from "./ItineraryPdf";

export interface B2bAgentInfo {
  agencyName: string | null;
  /** Already a data: URI (agents upload PNG logos as base64, stored as-is — see src/lib/b2b/schema.ts). */
  agencyLogoUrl: string | null;
  phone: string | null;
  email: string;
}

// Vertex's actual navy primary (same hex as TY_NAVY in ItineraryPdf.tsx,
// --primary: hsl(214 68% 14%)) — happens to closely match the reference
// template's own header-bar navy, so no invented color was needed there.
// The reference's warm terracotta accent belongs to a different company;
// Vertex's established brand green stands in for it throughout.
const NAVY = "#0b203c";
const NAVY_SOFT = "rgba(255,255,255,0.72)";
const GREEN = "#1d5c43";
const ROSE = "#e11d48";
const INK = "#2b2b2b";
const MUTED = "#7a7a72";
const BORDER = "#e4e0d8";
const CREAM = "#f7f4ee";
const WHITE = "#ffffff";

const STATUS_LABEL: Record<ItineraryStatus, string> = {
  DRAFT: "DRAFT QUOTATION",
  SENT: "QUOTATION",
  CONFIRMED: "CONFIRMED ITINERARY",
};

const s = StyleSheet.create({
  page: { fontSize: 9.5, color: INK, fontFamily: "Helvetica", paddingBottom: 46 },
  body: { paddingHorizontal: 34, paddingTop: 22 },

  // Full-bleed navy header bar, repeated on every page.
  headerBar: {
    backgroundColor: NAVY,
    paddingHorizontal: 34,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLogo: { width: 116, height: 28, objectFit: "contain" },
  headerRight: { alignItems: "flex-end" },
  headerBadge: { fontSize: 8, fontFamily: "Helvetica-Bold", color: WHITE, letterSpacing: 1.2 },
  headerMeta: { fontSize: 7, color: NAVY_SOFT, marginTop: 3 },

  eyebrow: { fontSize: 8, fontFamily: "Helvetica-Bold", color: GREEN, letterSpacing: 1.5 },
  title: { fontSize: 26, fontFamily: "Times-Bold", color: GREEN, marginTop: 6 },

  infoBar: {
    flexDirection: "row",
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
  },
  infoCell: { flex: 1 },
  infoLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1 },
  infoValue: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: INK, marginTop: 3 },

  destRow: { flexDirection: "row", marginTop: 18, alignItems: "baseline" },
  destLabel: { fontSize: 12, fontFamily: "Times-Bold", color: GREEN },
  destValue: { fontSize: 10.5, color: INK, marginLeft: 6 },

  // Why-Us content cards — fills the last page's remaining whitespace, just
  // above the closing banner/footer. Compact icon+title+subtitle cards (not
  // the normal customer PDF's fuller intro-paragraph version).
  whySection: {
    marginTop: 26,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  whyGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  whyCard: {
    width: "48%",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: CREAM,
    padding: 10,
  },
  whyIconChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: WHITE,
    alignItems: "center",
    justifyContent: "center",
  },
  whyCardTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK },
  whyCardDesc: { fontSize: 7.8, color: MUTED, marginTop: 2, lineHeight: 1.35 },

  sectionHead: { fontSize: 14, fontFamily: "Times-Bold", color: GREEN, marginTop: 22, marginBottom: 10 },

  // Tables — dark header row, plain bordered rows, no zebra photography.
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, overflow: "hidden" },
  tHeadRow: { flexDirection: "row", backgroundColor: NAVY },
  tHeadCell: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    letterSpacing: 0.8,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  tRowAlt: { backgroundColor: CREAM },
  tCell: { fontSize: 9, color: INK, lineHeight: 1.4 },

  dayNum: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: GREEN },
  dayTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: INK },
  dayBody: { fontSize: 8.7, color: "#555", lineHeight: 1.4, marginTop: 2 },
  dayStay: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK },
  dayMeals: { fontSize: 8.5, color: MUTED },

  note: { fontSize: 7.5, color: MUTED, marginTop: 6, lineHeight: 1.4 },

  twoCol: { flexDirection: "row", gap: 20, marginTop: 4 },
  colHalf: { flex: 1 },
  colHead: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GREEN,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  bulletRow: { flexDirection: "row", gap: 6, marginBottom: 5 },
  bulletMark: { fontSize: 8.5, fontFamily: "Helvetica-Bold", width: 10 },
  bulletText: { flex: 1, fontSize: 8.7, color: INK, lineHeight: 1.4 },

  priceCard: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    backgroundColor: CREAM,
    paddingVertical: 18,
    alignItems: "center",
  },
  priceLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED, letterSpacing: 1.5 },
  priceValue: { fontSize: 24, fontFamily: "Times-Bold", color: GREEN, marginTop: 4 },
  priceCaption: { fontSize: 7.5, color: MUTED, marginTop: 4 },

  calloutBox: {
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#e8ddc0",
    backgroundColor: "#fbf6e7",
    borderRadius: 6,
    padding: 10,
  },
  calloutText: { fontSize: 8.3, color: "#6b5b1f", lineHeight: 1.4 },

  closingBanner: {
    marginTop: 26,
    backgroundColor: NAVY,
    borderRadius: 8,
    padding: 18,
  },
  closingText: { fontSize: 13, fontFamily: "Times-Bold", color: WHITE, lineHeight: 1.4 },

  footer: {
    position: "absolute",
    bottom: 16,
    left: 34,
    right: 34,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: MUTED },
  poweredByRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  poweredByIcon: { width: 8, height: 8 },
  poweredByText: { fontSize: 6, color: MUTED },
});

function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function HeaderBar({
  agent,
  status,
  quoteNo,
  issued,
}: {
  agent?: B2bAgentInfo | null;
  status: ItineraryStatus;
  quoteNo: string;
  issued: string;
}) {
  return (
    <View style={s.headerBar} fixed>
      {agent?.agencyLogoUrl ? (
        <Image src={agent.agencyLogoUrl} style={s.headerLogo} />
      ) : (
        <Text style={{ color: WHITE, fontSize: 14, fontFamily: "Helvetica-Bold" }}>
          {agent?.agencyName ?? "Travel Quotation"}
        </Text>
      )}
      <View style={s.headerRight}>
        <Text style={s.headerBadge}>{STATUS_LABEL[status]}</Text>
        <Text style={s.headerMeta}>
          Quote no. {quoteNo}   ·   Issued: {issued}
        </Text>
      </View>
    </View>
  );
}

function Footer({
  agent,
  whiteLabel = true,
  vertexIcon,
}: {
  agent?: B2bAgentInfo | null;
  /** False once the agency hasn't yet earned full white-label (see
   *  WHITE_LABEL_MIN_BOOKINGS) — adds a small "Powered by Vertex Kashmir
   *  Holidays" credit below the agent's own contact line. */
  whiteLabel?: boolean;
  /** Vertex's small square icon mark, as a data: URI — only needed (and only
   *  fetched by the caller) when `whiteLabel` is false. */
  vertexIcon?: string | null;
}) {
  const contactLine = [agent?.agencyName, agent?.phone, agent?.email].filter(Boolean).join("   ·   ");
  return (
    <View style={s.footer} fixed>
      <View>
        <Text style={s.footerText}>{contactLine}</Text>
        {!whiteLabel && (
          <View style={s.poweredByRow}>
            {vertexIcon ? <Image src={vertexIcon} style={s.poweredByIcon} /> : null}
            <Text style={s.poweredByText}>Powered by Vertex Kashmir Holidays</Text>
          </View>
        )}
      </View>
      <Text
        style={s.footerText}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

interface Props {
  data: ItineraryData;
  status: ItineraryStatus;
  /** Short, stable reference shown as "Quote no." — derived from the itinerary id, not a separate stored field. */
  quoteRef: string;
  /** Last-updated timestamp, shown as "Issued". */
  updatedAt: string | Date;
  /** The B2B agent this quote is for — brands the document's header logo, footer contact line and PDF metadata. Omitted for a request with no resolvable agent (should not normally happen). */
  agent?: B2bAgentInfo | null;
  /** False until the agency has earned full white-label (see WHITE_LABEL_MIN_BOOKINGS) — adds a small "Powered by Vertex Kashmir Holidays" footer credit. Ignored when `agent` is absent. */
  whiteLabel?: boolean;
  /** Vertex's small square icon mark, as a data: URI — only needed (and only fetched by the caller) when `whiteLabel` is false. */
  vertexIcon?: string | null;
}

// Why-Us cards — always right after the price card (Total Package Cost) on
// page 2, regardless of whether a terms page follows.
function WhyUsCards({ whyChoose }: { whyChoose: ItineraryData["whyChoose"] }) {
  if (whyChoose.length === 0) return null;
  return (
    <View style={s.whySection} wrap={false}>
      <Text style={s.sectionHead}>Why Travel With Us</Text>
      <View style={s.whyGrid}>
        {whyChoose.map((w) => (
          <View key={w.id} style={s.whyCard} wrap={false}>
            <View style={s.whyIconChip}>
              <PdfIcon icon={w.icon} size={13} color={GREEN} solid />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.whyCardTitle}>{w.title}</Text>
              <Text style={s.whyCardDesc}>{w.subtitle}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// Closing banner — always the last thing on the page, just above the footer
// (page 2 when there's no terms/inclusions page, otherwise the terms page).
function ClosingBanner() {
  return (
    <View style={s.closingBanner} wrap={false}>
      <Text style={s.closingText}>Happy to adjust anything — hotels, route or budget.</Text>
    </View>
  );
}

export function B2bItineraryPdf({
  data,
  status,
  quoteRef,
  updatedAt,
  agent,
  whiteLabel,
  vertexIcon,
}: Props) {
  const issued = fmtDate(updatedAt);
  const hasHotels = data.hotels.length > 0;
  const hasTransport = !!(data.transportType || data.transportDesc);
  const hasTermsPage =
    data.inc.length > 0 || data.exc.length > 0 || data.pay.length > 0 || data.cancel.length > 0;

  return (
    <Document title={`Travel Quotation - ${data.preparedFor}`} author={agent?.agencyName ?? undefined}>
      <Page size="A4" style={s.page}>
        <HeaderBar agent={agent} status={status} quoteNo={quoteRef} issued={issued} />
        <Footer agent={agent} whiteLabel={whiteLabel} vertexIcon={vertexIcon} />
        <View style={s.body}>
          <Text style={s.eyebrow}>PROPOSED PLAN · PARTNER QUOTATION</Text>
          <Text style={s.title}>{data.coverTitle}</Text>

          <View style={s.infoBar}>
            <View style={s.infoCell}>
              <Text style={s.infoLabel}>PREPARED FOR</Text>
              <Text style={s.infoValue}>{data.preparedFor}</Text>
            </View>
            <View style={s.infoCell}>
              <Text style={s.infoLabel}>TRAVEL DATES</Text>
              <Text style={s.infoValue}>{data.travelDates}</Text>
            </View>
            <View style={s.infoCell}>
              <Text style={s.infoLabel}>TRAVELLERS</Text>
              <Text style={s.infoValue}>{data.travelers}</Text>
            </View>
            <View style={s.infoCell}>
              <Text style={s.infoLabel}>DURATION</Text>
              <Text style={s.infoValue}>{data.duration}</Text>
            </View>
          </View>

          {data.destinations ? (
            <View style={s.destRow}>
              <Text style={s.destLabel}>Destinations:</Text>
              <Text style={s.destValue}>{data.destinations}</Text>
            </View>
          ) : null}

          {data.days.length > 0 && (
            <>
              <Text style={s.sectionHead}>Day Plan at a Glance</Text>
              <View style={s.table}>
                <View style={s.tHeadRow}>
                  <Text style={[s.tHeadCell, { width: 34 }]}>DAY</Text>
                  <Text style={[s.tHeadCell, { flex: 1 }]}>PLAN</Text>
                  <Text style={[s.tHeadCell, { width: 90 }]}>NIGHT STAY</Text>
                  <Text style={[s.tHeadCell, { width: 100 }]}>MEALS</Text>
                </View>
                {data.days.map((day, i) => {
                  const stay = day.meta.find((m) => m.label.trim().toLowerCase() === "stay");
                  const meals = day.meta.find((m) => m.label.trim().toLowerCase() === "meals");
                  return (
                    <View
                      key={day.id}
                      style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}
                      wrap={false}
                    >
                      <View style={{ width: 34 }}>
                        <Text style={s.dayNum}>{String(i + 1).padStart(2, "0")}</Text>
                      </View>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={s.dayTitle}>{day.title}</Text>
                        {day.body ? <Text style={s.dayBody}>{day.body}</Text> : null}
                      </View>
                      <View style={{ width: 90 }}>
                        <Text style={s.dayStay}>{stay?.value || "—"}</Text>
                      </View>
                      <View style={{ width: 100 }}>
                        <Text style={s.dayMeals}>{meals?.value || "—"}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <HeaderBar agent={agent} status={status} quoteNo={quoteRef} issued={issued} />
        <Footer agent={agent} whiteLabel={whiteLabel} vertexIcon={vertexIcon} />
        <View style={s.body}>
          {hasHotels && (
            <View wrap={false}>
              <Text style={s.sectionHead}>Stay Plan</Text>
              <View style={s.table}>
                <View style={s.tHeadRow}>
                  <Text style={[s.tHeadCell, { width: 110 }]}>DESTINATION</Text>
                  <Text style={[s.tHeadCell, { width: 60 }]}>NIGHTS</Text>
                  <Text style={[s.tHeadCell, { flex: 1 }]}>HOTEL NAME</Text>
                  <Text style={[s.tHeadCell, { width: 90 }]}>ROOM TYPE</Text>
                </View>
                {data.hotels.map((h, i) => (
                  <View key={h.id} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                    <Text style={[s.tCell, { width: 110, fontFamily: "Helvetica-Bold" }]}>
                      {h.destination}
                    </Text>
                    <Text style={[s.tCell, { width: 60 }]}>{h.nights}</Text>
                    <Text style={[s.tCell, { flex: 1 }]}>{h.hotelDetails}</Text>
                    <Text style={[s.tCell, { width: 90 }]}>{h.roomType}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.note}>
                Hotel names shown are proposed properties, subject to availability at the time of
                confirmation.
              </Text>
            </View>
          )}

          {hasTransport && (
            <View wrap={false}>
              <Text style={s.sectionHead}>Transportation</Text>
              <View style={s.table}>
                <View style={s.tHeadRow}>
                  <Text style={[s.tHeadCell, { width: 140 }]}>VEHICLE</Text>
                  <Text style={[s.tHeadCell, { flex: 1 }]}>DETAILS</Text>
                </View>
                <View style={s.tRow}>
                  <Text style={[s.tCell, { width: 140, fontFamily: "Helvetica-Bold" }]}>
                    {data.transportType || "—"}
                  </Text>
                  <Text style={[s.tCell, { flex: 1 }]}>{data.transportDesc || "—"}</Text>
                </View>
              </View>
            </View>
          )}

          {data.totalCost ? (
            <View style={s.priceCard} wrap={false}>
              <Text style={s.priceLabel}>TOTAL PACKAGE COST</Text>
              <Text style={s.priceValue}>{data.totalCost}</Text>
              <Text style={s.priceCaption}>Final amount subject to confirmation at booking.</Text>
            </View>
          ) : null}

          <WhyUsCards whyChoose={data.whyChoose} />

          {/* This is the last page whenever there's nothing for the terms
              page below to show — so the closing banner belongs here instead. */}
          {!hasTermsPage && <ClosingBanner />}
        </View>
      </Page>

      {hasTermsPage && (
        <Page size="A4" style={s.page}>
          <HeaderBar agent={agent} status={status} quoteNo={quoteRef} issued={issued} />
          <Footer agent={agent} whiteLabel={whiteLabel} vertexIcon={vertexIcon} />
          <View style={s.body}>
            <View style={s.calloutBox}>
              <Text style={s.calloutText}>
                Rates shown are indicative and held only until the validity of this quotation. Final
                invoice and applicable taxes are confirmed at the time of booking.
              </Text>
            </View>

            {(data.inc.length > 0 || data.exc.length > 0) && (
              <View wrap={false}>
                <Text style={s.sectionHead}>What&apos;s Included, What&apos;s Not</Text>
                <View style={s.twoCol}>
                  <View style={s.colHalf}>
                    <Text style={s.colHead}>WHAT&apos;S INCLUDED</Text>
                    {data.inc.map((item) => (
                      <View key={item.id} style={s.bulletRow}>
                        <Text style={[s.bulletMark, { color: GREEN }]}>+</Text>
                        <Text style={s.bulletText}>{item.text}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.colHalf}>
                    <Text style={s.colHead}>WHAT&apos;S NOT INCLUDED</Text>
                    {data.exc.map((item) => (
                      <View key={item.id} style={s.bulletRow}>
                        <Text style={[s.bulletMark, { color: ROSE }]}>x</Text>
                        <Text style={s.bulletText}>{item.text}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {(data.pay.length > 0 || data.cancel.length > 0) && (
              <View wrap={false} style={{ marginTop: 22 }}>
                <Text style={s.sectionHead}>Terms &amp; Cancellation Policies</Text>
                <View style={s.twoCol}>
                  <View style={s.colHalf}>
                    <Text style={s.colHead}>PAYMENT POLICY</Text>
                    {data.pay.map((item, i) => (
                      <View key={i} style={s.bulletRow}>
                        <Text style={[s.bulletMark, { color: GREEN }]}>+</Text>
                        <Text style={s.bulletText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.colHalf}>
                    <Text style={s.colHead}>CANCELLATION POLICY</Text>
                    {data.cancel.map((item) => (
                      <View key={item.id} style={s.bulletRow}>
                        <Text style={[s.bulletMark, { color: GREEN }]}>+</Text>
                        <Text style={s.bulletText}>
                          {item.charge ? `${item.label} — ${item.charge}` : item.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            <ClosingBanner />
          </View>
        </Page>
      )}
    </Document>
  );
}
