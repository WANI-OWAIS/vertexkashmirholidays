/* eslint-disable jsx-a11y/alt-text */
// Server-rendered PDF documents for booking summaries and payment invoices.
// Rendered to a Buffer via @react-pdf/renderer's renderToBuffer and attached to
// transactional emails. Text is vector; the only image is the brand logo (data
// URL). Note: the built-in Helvetica font has no rupee glyph, so money is
// formatted as "Rs." (see assets.inr) — never the ₹ symbol here.

import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS as C, PDF_CONTACT as CONTACT, inr } from "./assets";
import { groupServiceTables } from "@/lib/bookings/serviceDisplay";

export interface PdfService {
  kind: "HOTEL" | "TRANSPORT" | "ACTIVITY" | "OTHER";
  name: string;
  location?: string | null;
  nights?: number | null;
  roomType?: string | null;
  pickup?: string | null;
  dropoff?: string | null;
  timing?: string | null;
}

export interface BookingSummaryPdfData {
  bookingRef: string;
  guestName: string;
  travelDate: string;
  travellers: number;
  services: PdfService[];
  inclusions: string[];
  bookingAmount: number;
  discountAmount: number;
  effectivePayable: number;
  paidAmount: number;
  balance: number;
  statusLabel: string;
}

export interface PaymentInvoicePdfData {
  invoiceRef: string;
  bookingRef: string;
  customerName: string;
  amount: number;
  type: string;
  method?: string | null;
  paymentDate: string;
  effectivePayable: number;
  totalPaid: number;
  balance: number;
  statusLabel: string;
}

const s = StyleSheet.create({
  page: {
    paddingVertical: 40,
    paddingHorizontal: 44,
    fontSize: 10,
    color: C.ink,
    fontFamily: "Helvetica",
  },

  // Header band
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: C.green,
    paddingBottom: 14,
    marginBottom: 18,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  logoBox: {
    width: 38,
    height: 38,
    borderRadius: 7,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: { width: 30, height: 30, objectFit: "contain" },
  brandName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.green },
  brandSub: { fontSize: 7, letterSpacing: 2, color: C.muted, marginTop: 2 },
  docMeta: { alignItems: "flex-end" },
  docTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: C.ink, letterSpacing: 1 },
  docRef: { fontSize: 9, color: C.muted, marginTop: 4 },

  // Two-column meta block
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 18 },
  metaCell: { width: "50%", marginBottom: 10 },
  metaLabel: { fontSize: 7.5, letterSpacing: 1, color: C.muted, textTransform: "uppercase" },
  metaValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink, marginTop: 2 },

  sectionHead: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: C.green,
    marginBottom: 8,
    marginTop: 6,
  },

  // Services
  svcGroup: { marginBottom: 12 },
  svcGroupTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.green,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  svcDot: { fontSize: 9, color: C.mint, fontFamily: "Helvetica-Bold", width: 8 },
  svcDetail: { fontSize: 8.5, color: C.muted, marginTop: 1 },

  // Service tables (price-free) — one per kind, mirroring the admin UI columns.
  tbl: { borderWidth: 1, borderColor: C.border, borderRadius: 6, overflow: "hidden" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  trHead: { backgroundColor: C.lightGreen },
  th: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.green,
    paddingVertical: 5,
    paddingHorizontal: 7,
    textTransform: "uppercase",
  },
  td: { fontSize: 9, paddingVertical: 5, paddingHorizontal: 7 },
  colW2: { flexGrow: 2, flexBasis: 0 },
  colW1: { flexGrow: 1.4, flexBasis: 0 },
  tdFirst: { fontFamily: "Helvetica-Bold", color: C.ink },
  tdRest: { color: C.muted },

  incRow: { flexDirection: "row", gap: 7, marginBottom: 3, paddingLeft: 2 },
  incText: { fontSize: 9, color: "#444" },

  // Summary box
  summaryBox: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 14,
    marginTop: 6,
    backgroundColor: C.cream,
  },
  sumRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  sumLabel: { fontSize: 10, color: C.muted },
  sumValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.ink },
  sumDivider: { borderTopWidth: 1, borderTopColor: C.border, marginTop: 4, marginBottom: 8 },
  sumTotalLabel: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.green },
  sumTotalValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.green },
  statusPill: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: C.lightGreen,
    color: C.green,
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 10,
  },

  note: { fontSize: 8, color: C.muted, fontStyle: "italic", marginTop: 14 },

  // Footer
  footer: {
    position: "absolute",
    bottom: 26,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 8,
    alignItems: "center",
  },
  footerCompany: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.green },
  footerLine: { fontSize: 7.5, color: C.muted, marginTop: 2, textAlign: "center" },
  poweredBy: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  poweredByIcon: { width: 9, height: 9 },
  poweredByText: { fontSize: 6.5, color: C.muted },
});

// Exported so other document families (e.g. the salary slip) can reuse the
// same header/footer/meta-cell shell instead of redefining it.
export { s as sharedPdfStyles };

// B2B agent branding — when present, Header/Footer render the agent's own
// identity instead of Vertex's, so a B2B booking's invoice/receipt reads as
// coming from the partner agency the guest actually booked through (same
// white-label treatment as B2bItineraryPdf.tsx). Every other caller (normal
// customer bookings, the salary slip) omits this and gets the Vertex-branded
// shell unchanged.
export interface InvoiceAgentBranding {
  agencyName: string | null;
  /** Already a data: URI — agents upload PNG logos as base64, stored as-is. */
  agencyLogoUrl: string | null;
  phone: string | null;
  email: string;
}

export function Header({
  logo,
  title,
  ref: docRef,
  agent,
}: {
  logo: string | null;
  title: string;
  ref: string;
  agent?: InvoiceAgentBranding | null;
}) {
  const brandLogo = agent ? agent.agencyLogoUrl : logo;
  return (
    <View style={s.header}>
      <View style={s.brandRow}>
        {brandLogo ? (
          <View style={s.logoBox}>
            <Image src={brandLogo} style={s.logoImg} />
          </View>
        ) : null}
        <View>
          {agent ? (
            <Text style={s.brandName}>{agent.agencyName ?? "Travel Partner"}</Text>
          ) : (
            <>
              <Text style={s.brandName}>Vertex Kashmir</Text>
              <Text style={s.brandSub}>HOLIDAYS</Text>
            </>
          )}
        </View>
      </View>
      <View style={s.docMeta}>
        <Text style={s.docTitle}>{title}</Text>
        <Text style={s.docRef}>{docRef}</Text>
      </View>
    </View>
  );
}

export function Footer({
  address,
  gstNumber,
  agent,
  whiteLabel = true,
  vertexIcon,
}: {
  address: string;
  /** SiteSettings.gstNumber — the same GSTIN shown in the site footer. Omitted
   *  on internal documents (e.g. the salary slip) and when it isn't configured. */
  gstNumber?: string | null;
  agent?: InvoiceAgentBranding | null;
  /** Agent-branded documents only — false once the agency hasn't yet earned
   *  full white-label (see WHITE_LABEL_MIN_BOOKINGS), adding a small
   *  "Powered by Vertex Kashmir Holidays" credit below the agent's own
   *  details. Ignored when `agent` is absent (never shown on Vertex's own
   *  documents — there's nothing to credit there). */
  whiteLabel?: boolean;
  /** Vertex's small square icon mark, as a data: URI — only needed (and only
   *  fetched by the caller) when `whiteLabel` is false. */
  vertexIcon?: string | null;
}) {
  if (agent) {
    return (
      <View style={s.footer} fixed>
        <Text style={s.footerCompany}>{agent.agencyName ?? "Travel Partner"}</Text>
        <Text style={s.footerLine}>{[agent.phone, agent.email].filter(Boolean).join(" · ")}</Text>
        {!whiteLabel && (
          <View style={s.poweredBy}>
            {vertexIcon ? <Image src={vertexIcon} style={s.poweredByIcon} /> : null}
            <Text style={s.poweredByText}>Powered by Vertex Kashmir Holidays</Text>
          </View>
        )}
      </View>
    );
  }
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerCompany}>{CONTACT.company}</Text>
      <Text style={s.footerLine}>
        {CONTACT.reg}
        {gstNumber ? ` · GSTIN: ${gstNumber}` : ""}
      </Text>
      <Text style={s.footerLine}>
        {CONTACT.phone} · {CONTACT.email}
      </Text>
      <Text style={s.footerLine}>{address}</Text>
    </View>
  );
}

export function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaCell}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

// Booking summary — services shown as a price-free table per kind, overall price
// summary visible.
export function BookingSummaryPdf({
  data,
  logo,
  address,
  gstNumber,
  agent,
  whiteLabel,
  vertexIcon,
}: {
  data: BookingSummaryPdfData;
  logo: string | null;
  /** Resolved Corporate Office (or Registered Office fallback) — see companyOffice.ts. */
  address: string;
  /** SiteSettings.gstNumber, rendered in the footer next to the tourism
   *  registration number. Null/absent when it isn't configured. */
  gstNumber?: string | null;
  /** B2B booking — white-labels this document to the agent instead of Vertex. */
  agent?: InvoiceAgentBranding | null;
  /** See Footer's own doc comment — ignored unless `agent` is set. */
  whiteLabel?: boolean;
  vertexIcon?: string | null;
}) {
  const grouped = groupServiceTables(data.services);

  return (
    <Document
      title={`Booking Summary - ${data.bookingRef}`}
      author={agent?.agencyName ?? CONTACT.brand}
    >
      <Page size="A4" style={s.page}>
        <Header logo={logo} title="BOOKING SUMMARY" ref={`Ref: ${data.bookingRef}`} agent={agent} />

        <View style={s.metaGrid}>
          <MetaCell label="Guest" value={data.guestName} />
          <MetaCell label="Booking Reference" value={data.bookingRef} />
          <MetaCell label="Travel Date" value={data.travelDate} />
          <MetaCell label="Travellers" value={String(data.travellers)} />
        </View>

        <Text style={s.sectionHead}>Your Package Includes</Text>
        {grouped.length === 0 ? (
          <Text style={s.svcDetail}>Service details will be shared shortly.</Text>
        ) : (
          grouped.map((g) => (
            <View key={g.kind} style={s.svcGroup}>
              <Text style={s.svcGroupTitle}>{g.title}</Text>
              <View style={s.tbl}>
                <View style={[s.tr, s.trHead]} wrap={false}>
                  {g.headers.map((h, i) => (
                    <Text key={i} style={[s.th, i === 0 ? s.colW2 : s.colW1]}>
                      {h}
                    </Text>
                  ))}
                </View>
                {g.rows.map((r, ri) => (
                  <View key={ri} style={s.tr} wrap={false}>
                    {r.map((c, ci) => (
                      <Text
                        key={ci}
                        style={[
                          s.td,
                          ci === 0 ? s.colW2 : s.colW1,
                          ci === 0 ? s.tdFirst : s.tdRest,
                        ]}
                      >
                        {c}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          ))
        )}

        {data.inclusions.length > 0 && (
          <View style={s.svcGroup}>
            <Text style={s.svcGroupTitle}>Additional Inclusions</Text>
            {data.inclusions.map((inc, i) => (
              <View key={i} style={s.incRow} wrap={false}>
                <Text style={s.svcDot}>+</Text>
                <Text style={s.incText}>{inc}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.sectionHead}>Price Summary</Text>
        <View style={s.summaryBox}>
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Total Booking Amount</Text>
            <Text style={s.sumValue}>{inr(data.bookingAmount)}</Text>
          </View>
          {data.discountAmount > 0 && (
            <View style={s.sumRow}>
              <Text style={s.sumLabel}>Discount</Text>
              <Text style={s.sumValue}>- {inr(data.discountAmount)}</Text>
            </View>
          )}
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Payable</Text>
            <Text style={s.sumValue}>{inr(data.effectivePayable)}</Text>
          </View>
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Paid</Text>
            <Text style={s.sumValue}>{inr(data.paidAmount)}</Text>
          </View>
          <View style={s.sumDivider} />
          <View style={s.sumRow}>
            <Text style={s.sumTotalLabel}>Remaining Balance</Text>
            <Text style={s.sumTotalValue}>{inr(data.balance)}</Text>
          </View>
          <Text style={s.statusPill}>Status: {data.statusLabel}</Text>
        </View>

        <Text style={s.note}>
          *Service inclusions are confirmed as above. Final accommodation and transport are subject
          to availability at the time of travel. This is a computer-generated summary.
        </Text>

        <Footer
          address={address}
          gstNumber={gstNumber}
          agent={agent}
          whiteLabel={whiteLabel}
          vertexIcon={vertexIcon}
        />
      </Page>
    </Document>
  );
}

// Payment invoice — payment-specific financials only. No service line items.
export function PaymentInvoicePdf({
  data,
  logo,
  address,
  gstNumber,
  agent,
  whiteLabel,
  vertexIcon,
}: {
  data: PaymentInvoicePdfData;
  logo: string | null;
  /** Resolved Corporate Office (or Registered Office fallback) — see companyOffice.ts. */
  address: string;
  /** SiteSettings.gstNumber, rendered in the footer next to the tourism
   *  registration number. Null/absent when it isn't configured. */
  gstNumber?: string | null;
  /** B2B booking — white-labels this document to the agent instead of Vertex. */
  agent?: InvoiceAgentBranding | null;
  /** See Footer's own doc comment — ignored unless `agent` is set. */
  whiteLabel?: boolean;
  vertexIcon?: string | null;
}) {
  return (
    <Document
      title={`Payment Receipt - ${data.invoiceRef}`}
      author={agent?.agencyName ?? CONTACT.brand}
    >
      <Page size="A4" style={s.page}>
        <Header logo={logo} title="PAYMENT RECEIPT" ref={`Receipt: ${data.invoiceRef}`} agent={agent} />

        <View style={s.metaGrid}>
          <MetaCell label="Customer" value={data.customerName} />
          <MetaCell label="Booking Reference" value={data.bookingRef} />
          <MetaCell label="Payment Date" value={data.paymentDate} />
          <MetaCell label="Payment Type" value={data.type} />
          {data.method ? <MetaCell label="Method" value={data.method} /> : null}
        </View>

        <Text style={s.sectionHead}>Payment Details</Text>
        <View style={s.summaryBox}>
          <View style={s.sumRow}>
            <Text style={s.sumTotalLabel}>Amount Received</Text>
            <Text style={s.sumTotalValue}>{inr(data.amount)}</Text>
          </View>
          <View style={s.sumDivider} />
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Total Payable</Text>
            <Text style={s.sumValue}>{inr(data.effectivePayable)}</Text>
          </View>
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Total Paid To Date</Text>
            <Text style={s.sumValue}>{inr(data.totalPaid)}</Text>
          </View>
          <View style={s.sumRow}>
            <Text style={s.sumLabel}>Remaining Balance</Text>
            <Text style={s.sumValue}>{inr(data.balance)}</Text>
          </View>
          <Text style={s.statusPill}>Status: {data.statusLabel}</Text>
        </View>

        <Text style={s.note}>
          *This receipt confirms the payment recorded above against your booking. For the full
          booking summary please refer to your booking summary document. This is a
          computer-generated receipt.
        </Text>

        <Footer
          address={address}
          gstNumber={gstNumber}
          agent={agent}
          whiteLabel={whiteLabel}
          vertexIcon={vertexIcon}
        />
      </Page>
    </Document>
  );
}
