// src/app/(public)/b2b-travel-partner-program/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Phone,
  Mail,
  Hotel,
  Ship,
  Car,
  MapPinned,
  Mountain,
  Heart,
  Users,
  Settings2,
  LifeBuoy,
  Compass,
  Tent,
  Landmark,
  Building2,
  Star,
  Crown,
  ClipboardList,
  FileCheck2,
  FolderCog,
  Headset,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/brand";
import { getSiteSettings } from "@/lib/siteSettings";
import { buildMetadata, SITE_URL } from "@/lib/seo";
import { buildWhatsAppHref } from "@/lib/whatsapp";
import { SecondaryHero } from "@/components/layout/SecondaryHero";
import { JsonLd, buildBreadcrumbList, buildFAQPage } from "@/components/seo/JsonLd";
import { B2bWhatsAppLink } from "@/components/b2b/B2bWhatsAppLink";
import { B2bRegisterButton } from "@/components/b2b/B2bRegisterButton";
import { B2bRegisterModal } from "@/components/b2b/B2bRegisterModal";
import { B2bYoutubeEmbed } from "@/components/b2b/B2bYoutubeEmbed";
import { B2B_VIDEO_ID, B2B_VIDEO_TITLE } from "@/lib/b2b/videoConfig";

// Static marketing/SEO page — no CMS model behind it (unlike Home/Contact),
// so revalidating on the standard ISR window is enough; only the contact
// channels (WhatsApp/phone/email) are dynamic, and those already come from
// the cached getSiteSettings().
export const revalidate = 1800;

const PAGE_TITLE = "B2B Travel Partner Program | Kashmir DMC";
const PAGE_DESCRIPTION =
  "Partner with Vertex Kashmir Holidays, your Kashmir DMC — dynamic B2B net rates, hotels, houseboats, transportation and complete tour packages for travel agents, tour operators and DMCs.";
const CANONICAL = `${SITE_URL}/b2b-travel-partner-program`;

export async function generateMetadata(): Promise<Metadata> {
  const base = buildMetadata({
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    canonical: CANONICAL,
  });
  // Overrides the root layout's automatic " | Vertex Kashmir Holidays"
  // template with the exact literal title requested for this page — the
  // template would otherwise either truncate "Kashmir DMC" off the end (it's
  // budgeted against the suffix it's about to append) or double up the brand
  // name if the suffix were included in PAGE_TITLE instead.
  return {
    ...base,
    title: { absolute: `${PAGE_TITLE} | Vertex Kashmir Holidays` },
  };
}

const FAQS: { question: string; answer: string }[] = [
  {
    question: "What is a Kashmir DMC?",
    answer:
      "A Destination Management Company (DMC) is a local, on-ground travel operator that manages hotels, houseboats, transportation, sightseeing and complete tour execution in a specific destination. Vertex Kashmir Holidays acts as your Kashmir DMC, handling everything on the ground so you can focus on your own customer relationship.",
  },
  {
    question: "What is a B2B Kashmir travel partnership?",
    answer:
      "A B2B partnership lets travel agencies, tour operators, DMCs and corporate travel companies work with Vertex to book Kashmir hotels, houseboats, transportation, sightseeing, activities and complete tour packages on behalf of their own customers, typically at a B2B net rate.",
  },
  {
    question: "How do I become a B2B Kashmir travel partner?",
    answer:
      "Share your company or business details with our B2B team, and we'll review your partnership request, discuss your requirements and applicable commercial terms, and onboard you before you start sending Kashmir enquiries. Additional business verification may be requested for new or international partners.",
  },
  {
    question: "How do Vertex B2B rates work?",
    answer:
      "Vertex provides a dynamic B2B net rate for each requirement, calculated based on travel dates, season, hotel and houseboat availability, room category, number of travellers, transportation, sightseeing, activities and current supplier pricing. Partners can add their own markup on top of this net rate.",
  },
  {
    question: "Are Kashmir B2B rates fixed?",
    answer:
      "No. Kashmir travel costs vary by season, availability and requirement, so we do not rely on one fixed price for every package. Each quotation is generated against your specific dates and requirements and is subject to availability and confirmation.",
  },
  {
    question: "Can travel agents add their own margin?",
    answer:
      "Yes. Under the default net rate model, partners receive a B2B net rate and are free to add their own markup when quoting their customer.",
  },
  {
    question: "Do you offer commission-based partnerships?",
    answer:
      "Yes, for established partners who prefer it. Under this optional model, the partner earns a commission on the customer-facing selling price rather than adding a markup on a net rate. This is subject to mutual agreement.",
  },
  {
    question: "Can you provide white-label itineraries?",
    answer:
      "Yes. Customer-facing itineraries and vouchers can be prepared using your branding when requested, in addition to our default Vertex-branded documentation. Co-branded documentation is also available for suitable partnerships. Supplier confirmations and internal operational documents remain under Vertex's operational control.",
  },
  {
    question: "Do you work with international travel agencies?",
    answer:
      "Yes. Vertex works with both domestic and international travel agencies, tour operators, DMCs and corporate travel companies for Kashmir travel requirements.",
  },
  {
    question: "What services can B2B partners book?",
    answer:
      "Partners can book Kashmir tour packages, hotels, houseboats, airport transfers, private transportation, local sightseeing across destinations like Gulmarg, Pahalgam, Sonamarg, Doodhpathri and Yusmarg, activities including the Gulmarg Gondola, honeymoon packages, family holidays, group tours, fully customised itineraries and on-ground Kashmir support.",
  },
  {
    question: "How do I request a B2B quotation?",
    answer:
      "Send us your requirement — travel dates, number of travellers, hotel or houseboat category and itinerary needs — via WhatsApp, email or phone, and our B2B team will share a net quotation.",
  },
  {
    question: "What information should I provide for a B2B quotation?",
    answer:
      "Travel dates, number of adults, children and their ages, number of rooms, preferred hotel or houseboat category, meal plan, transportation preference, destinations to visit, activities and any special requirements — and your budget, if available. The more complete the requirement, the faster and more accurately we can prepare your quotation.",
  },
  {
    question: "Are rates subject to availability?",
    answer:
      "Yes. All B2B quotations are subject to availability and confirmation, and rate validity is shown on each individual quotation.",
  },
  {
    question: "How long is a B2B quotation valid?",
    answer:
      "Rate validity is shown on each individual quotation and depends on the season and availability at the time it was issued. If you confirm after the validity period, we will reconfirm availability and pricing before booking.",
  },
  {
    question: "How does booking confirmation work?",
    answer:
      "Once you approve a quotation and complete payment as per the terms shared on that quotation, we confirm the booking with our Kashmir suppliers and issue a booking voucher, followed by full on-ground support during the trip.",
  },
  {
    question: "Are preferential rates guaranteed for new partners?",
    answer:
      "No. Partner levels and preferential commercial terms are reviewed individually based on actual booking volume, frequency, payment reliability, operational cooperation and long-term business potential — enquiry volume alone does not guarantee preferential pricing or credit terms.",
  },
  {
    question: "Do I get B2B access immediately after registration?",
    answer:
      "No. Registration is an application. Vertex reviews the business details and may request additional verification before activating partner access.",
  },
  {
    question: "Can I share Vertex B2B rates with other agencies?",
    answer:
      "No. Partner-only rates, quotations and other confidential commercial information are intended for the approved partner's legitimate business use and must not be redistributed or disclosed to unauthorized third parties.",
  },
  {
    question: "What happens if B2B resources are misused?",
    answer:
      "Vertex may restrict or terminate partner access and may take other appropriate action where confidential pricing, itineraries, intellectual property or other partner resources are misused.",
  },
];

const SERVICES: { label: string; icon: typeof Hotel; href?: string }[] = [
  { label: "Kashmir tour packages", icon: Compass, href: "/tours" },
  { label: "Hotels", icon: Hotel },
  { label: "Houseboats", icon: Ship },
  { label: "Airport transfers", icon: Car },
  { label: "Private transportation", icon: Car },
  { label: "Local sightseeing", icon: MapPinned },
  { label: "Gulmarg Gondola", icon: Compass, href: "/activities/gulmarg-gondola-ride" },
  { label: "Activities", icon: Compass, href: "/activities" },
  { label: "Honeymoon packages", icon: Heart, href: "/tours/category/honeymoon-packages" },
  { label: "Family holidays", icon: Users, href: "/tours/category/family-tour-packages" },
  { label: "Group tours", icon: Users, href: "/tours/category/group-tour-packages" },
  {
    label: "Adventure tours (Gurez, trekking, LOC)",
    icon: Tent,
    href: "/tours/category/adventure-tour-packages",
  },
  {
    label: "Religious tours (e.g. Vaishno Devi)",
    icon: Landmark,
    href: "/tours/category/pilgrimage-tour-packages",
  },
  { label: "Leh-Ladakh", icon: Mountain, href: "/destinations/leh" },
  { label: "Customised itineraries", icon: Settings2 },
  { label: "On-ground Kashmir support", icon: LifeBuoy },
];

// Single consolidated destinations line, rendered as a full-width band below
// the grid, rather than a separate grid tile per place.
const DESTINATIONS_SUMMARY =
  "Srinagar, Gulmarg, Pahalgam, Sonamarg, Doodhpathri, Yusmarg & more Kashmir destinations";

const BENEFITS = [
  "Competitive B2B net rates",
  "Dynamic quotations tailored to your requirement",
  "Local Kashmir destination expertise",
  "Handpicked hotels and houseboats",
  "Reliable private transportation",
  "Complete itinerary execution, start to finish",
  "Fast quotation turnaround",
  "On-ground assistance throughout the trip",
  "White-label documentation on request",
  "Long-term partner relationships",
  "Potential preferential terms based on booking volume and payment reliability",
];

const PARTNER_LEVELS = [
  {
    icon: Building2,
    title: "Standard Partner",
    body: "The default level for new B2B partners — full access to B2B net rates, dynamic quotations and on-ground Kashmir support.",
  },
  {
    icon: Star,
    title: "Preferred Partner",
    body: "For partners with an established booking history — considered for preferential commercial terms based on booking volume and payment reliability.",
  },
  {
    icon: Crown,
    title: "Strategic Partner",
    body: "For long-term, high-volume partners — white-label documentation, co-branding options and closer collaboration on itinerary planning.",
  },
];

const WORKFLOW_STEPS = [
  { title: "Partner Enquiry", body: "Share your requirement with our B2B team." },
  { title: "Requirement Review", body: "We review your dates, group size and preferences." },
  {
    title: "Availability & Costing",
    body: "We check hotel, houseboat, transport and activity availability and cost it out.",
  },
  {
    title: "B2B Net Quotation",
    body: "You receive a dynamic B2B net rate, with validity shown on the quotation.",
  },
  { title: "Partner Approval", body: "You review and approve the quotation." },
  { title: "Payment", body: "Payment is completed as per the terms shared on the quotation." },
  { title: "Supplier Confirmation", body: "We confirm the booking with our Kashmir suppliers." },
  { title: "Booking Voucher", body: "A booking voucher is issued for the confirmed services." },
  {
    title: "Kashmir Operations & Support",
    body: "Our on-ground team handles execution and support throughout the trip.",
  },
];

const COMMERCIAL_TERMS = [
  "Dynamic Pricing",
  "Availability",
  "Rate Validity",
  "Payment",
  "Cancellation",
  "Amendments",
  "Refunds",
  "Supplier-Specific Policies",
  "Peak Season / Special Dates",
  "Force Majeure",
  "Rate Confidentiality",
  "White-Label Usage",
  "Customer Relationship",
  "Partner Responsibilities",
  "Vertex Responsibilities",
];

// Clarifying, non-numeric bullets for the Commercial Terms section — no exact
// payment/cancellation/refund percentages, credit periods or guarantees, per
// the approved business rules for this page.
const COMMERCIAL_TERM_NOTES = [
  "Final terms are communicated on the relevant quotation/booking confirmation.",
  "Supplier-specific cancellation policies may apply.",
  "Rates are subject to availability.",
  "Amendments may result in revised pricing.",
  "Payment terms depend on the agreed commercial arrangement.",
  "Credit terms are not automatically available to new partners.",
  "White-label use is subject to the agreed branding rules.",
  "B2B net rates are confidential trade rates intended for the partner's commercial use, and should not be publicly represented as Vertex's underlying acquisition or supplier cost.",
];

const BECOME_PARTNER_STEPS = [
  { title: "Share Your Details", body: "Tell us about your company or business." },
  { title: "Partnership Review", body: "Vertex reviews your partnership request." },
  {
    title: "Discuss Requirements",
    body: "We discuss your requirements and applicable commercial terms.",
  },
  { title: "Partner Onboarding", body: "You're onboarded as a Vertex B2B partner." },
  { title: "Start Sending Enquiries", body: "You start sending us Kashmir enquiries." },
];

const ENQUIRY_CHECKLIST = [
  "Travel dates",
  "Number of adults",
  "Children and ages",
  "Number of rooms",
  "Preferred hotel/houseboat category",
  "Meal plan",
  "Transportation preference",
  "Destinations / places to visit",
  "Activities",
  "Special requirements",
  "Budget, if available",
];

function SectionHeading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="text-center">
      <p className="text-[12px] font-bold tracking-[0.22em] text-primary">{kicker}</p>
      <h2 className="h-display mt-3 font-display text-[22px] font-bold text-foreground sm:text-[26px]">
        {title}
      </h2>
    </div>
  );
}

export default async function B2bTravelPartnerProgramPage() {
  const settings = await getSiteSettings();
  const whatsapp = settings?.whatsapp ?? settings?.sitePhone ?? null;
  const phone = settings?.sitePhone ?? null;
  const email = settings?.siteEmail ?? null;

  const quoteWaHref = buildWhatsAppHref(
    whatsapp,
    "Hi, I'm a travel agent/tour operator interested in the Vertex B2B Travel Partner Program. I'd like to request a B2B quotation for Kashmir.",
  );
  const talkWaHref = buildWhatsAppHref(
    whatsapp,
    "Hi, I'd like to talk to your B2B team about partnering with Vertex Kashmir Holidays.",
  );

  // Organization/TravelAgency schema is already injected sitewide in
  // (public)/layout.tsx — not duplicated here, per that file's own convention.
  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Home", url: SITE_URL },
    { name: "B2B Travel Partner Program", url: CANONICAL },
  ]);
  const faqJsonLd = buildFAQPage(FAQS);

  return (
    <div className="bg-background text-foreground">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={faqJsonLd} />

      <SecondaryHero alt="">
        <nav className="flex items-center gap-2 text-[14px] text-white/85" aria-label="Breadcrumb">
          <Link href="/" className="transition hover:text-white">
            Home
          </Link>
          <span>›</span>
          <span className="font-semibold text-white">B2B Travel Partner Program</span>
        </nav>
        <h1 className="h-display mt-6 font-display text-3xl font-bold leading-[1.12] text-white sm:text-4xl lg:text-[48px]">
          B2B Travel Partner Program — Kashmir DMC for Travel Agencies &amp; Tour Operators
        </h1>
        <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-white/85">
          Vertex Kashmir Holidays works as your Kashmir DMC and ground handling partner — hotels,
          houseboats, transportation, sightseeing, activities and wholesale Kashmir tour packages
          for domestic and international travel agencies, tour operators, DMCs and corporate
          travel companies.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <B2bRegisterButton className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground transition hover:brightness-110">
            Register as a B2B Partner
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
          </B2bRegisterButton>
          <B2bWhatsAppLink
            href={talkWaHref}
            className="glass inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            Talk to Our B2B Team
          </B2bWhatsAppLink>
        </div>
      </SecondaryHero>

      <main className="mx-auto max-w-[1300px] px-4 py-16 sm:px-6 sm:py-20">
        {/* 1. Pricing model */}
        <section>
          <SectionHeading kicker="B2B PRICING" title="How Our B2B Pricing Works" />

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7">
              <p className="text-[12px] font-bold uppercase tracking-wide text-primary">
                Default model
              </p>
              <h3 className="h-display mt-1 font-display text-lg font-bold text-foreground">
                B2B Net Rate
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                Vertex provides a dynamic B2B net rate based on your travel dates, season,
                hotel/houseboat availability, room category, number of travellers, transportation,
                sightseeing, activities, itinerary requirements and supplier availability and
                pricing. You are free to add your own markup when quoting your customer.
              </p>
              <div className="mt-5 rounded-xl bg-muted p-4 text-[13px]">
                <p className="font-semibold text-foreground">Example (for illustration only)</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>Vertex B2B Net Rate(for the given package): ₹50,000</li>
                  <li>Your markup: ₹5,000</li>
                  <li className="font-semibold text-foreground">
                    Customer selling price: ₹55,000
                  </li>
                  <li className="font-semibold text-foreground">Partner markup: ₹5,000</li>
                </ul>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                Illustrative example only. The partner determines their own final selling price and
                markup.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7">
              <p className="text-[12px] font-bold uppercase tracking-wide text-primary">
                Optional model
              </p>
              <h3 className="h-display mt-1 font-display text-lg font-bold text-foreground">
                Commission
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                Some established partners prefer a commission model instead — you quote your
                customer directly and earn a commission on the selling price. This model is
                optional and subject to mutual agreement.
              </p>
              <div className="mt-5 rounded-xl bg-muted p-4 text-[13px]">
                <p className="font-semibold text-foreground">Example (for illustration only)</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>Customer selling price (for the given package): ₹55,000</li>
                  <li className="font-semibold text-foreground">Your commission: ₹5,000</li>
                  <li>Vertex receives: ₹50,000</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-muted p-6 text-[14px] leading-relaxed text-muted-foreground sm:p-7">
            <p>
              We do not rely on one fixed price for every Kashmir package. Every quotation is
              generated against your actual travel requirements and current availability, so rates
              vary by season, dates, hotel category and group size.
            </p>
            <p className="mt-3 font-semibold text-foreground">
              All quotations are subject to availability and confirmation. Rate validity is shown
              on each individual quotation.
            </p>
            <p className="mt-3 text-[13px]">
              Illustrative example only: a quotation issued on 23 August may be valid until 25
              August, subject to availability. If a partner confirms after the validity period, we
              reconfirm availability and pricing before booking. The actual validity period is
              always stated on the individual quotation.
            </p>
          </div>
        </section>

        {/* 1b. Mutual growth philosophy */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="OUR APPROACH" title="Built for Mutual Growth" />
          <div className="mx-auto mt-6 max-w-3xl text-center text-[14px] leading-relaxed text-muted-foreground">
            <p>
              Our B2B model is designed to give travel partners room to earn while allowing Vertex
              to maintain the service quality and operational support required to deliver a
              successful Kashmir trip — competitive B2B net rates designed to leave room for
              partner markup. Preferential commercial terms may be considered as booking volume,
              consistency, payment reliability and the strength of the partnership grow.
            </p>
          </div>
        </section>

        {/* 2. Services */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="WHAT YOU CAN BOOK" title="Kashmir Services for B2B Partners" />
          <p className="mx-auto mt-4 max-w-2xl text-center text-[14px] leading-relaxed text-muted-foreground">
            As a Kashmir DMC for travel agents and tour operators, we handle the following on your
            behalf:
          </p>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {SERVICES.map((s) => {
              const Icon = s.icon;
              const inner = (
                <>
                  <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.9} />
                  <span className="text-[13px] font-semibold text-foreground">{s.label}</span>
                </>
              );
              return s.href ? (
                <Link
                  key={s.label}
                  href={s.href}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={s.label}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3"
                >
                  {inner}
                </div>
              );
            })}
          </div>
          <Link
            href="/destinations"
            className="mt-3 flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <MapPinned className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.9} />
            <span className="text-[13px] font-semibold text-foreground">
              {DESTINATIONS_SUMMARY}
            </span>
          </Link>
        </section>

        {/* 3. White-label / co-branding */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading
            kicker="BRANDING OPTIONS"
            title="White-Label &amp; Co-Branding"
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {[
              {
                title: "Vertex Branded",
                body: "The default for B2B quotations and operational documents.",
              },
              {
                title: "Partner White-Label",
                body: "Customer-facing itineraries and vouchers prepared using your branding, when requested.",
              },
              {
                title: "Co-Branded",
                body: "Available for suitable, strategic partnerships.",
              },
            ].map((o) => (
              <div
                key={o.title}
                className="rounded-2xl border border-border bg-card p-6 shadow-card"
              >
                <h3 className="text-[15px] font-bold text-foreground">{o.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{o.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
            White-label documentation applies primarily to customer-facing itineraries and vouchers
            requested by the partner. Supplier confirmations, internal operational documents and
            Vertex-side operational communications remain under Vertex&apos;s operational control.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            White-label use does not transfer ownership of Vertex&apos;s intellectual property,
            itinerary templates, operational systems or supplier relationships.
          </p>

          <div className="mt-8 flex items-start gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-6 sm:p-7">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Lock className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[13px] font-bold uppercase tracking-wide text-primary">
                Earned Privilege
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-foreground">
                White-label access is an earned partner privilege. Agencies become eligible for
                white-label customer-facing documents after a minimum of 3 completed bookings with
                Vertex Kashmir Holidays, subject to payment history, genuine business activity,
                responsible use of B2B information, and overall partner conduct.
              </p>
            </div>
          </div>
        </section>

        {/* 4. Customer relationship */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="RELATIONSHIP" title="Who Owns the Customer Relationship?" />
          <div className="mx-auto mt-8 max-w-3xl text-center text-[14px] leading-relaxed text-muted-foreground">
            <p>
              For partner-referred bookings, the partner retains the commercial customer
              relationship, while Vertex acts as the destination and operational partner. We may
              communicate directly with the traveller when required for operational coordination,
              transfers, hotel check-in, itinerary execution, emergency support or service
              delivery.
            </p>
          </div>
        </section>

        {/* 5. Benefits */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="PARTNER BENEFITS" title="Why Travel Partners Choose Vertex" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2} />
                <p className="text-[14px] text-foreground">{b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 6. Partner levels */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="PARTNER LEVELS" title="Standard, Preferred &amp; Strategic" />
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {PARTNER_LEVELS.map((l) => {
              const Icon = l.icon;
              return (
                <div
                  key={l.title}
                  className="rounded-2xl border border-border bg-card p-6 shadow-card"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full border-[1.5px] border-primary/40 text-primary">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <h3 className="mt-4 text-[15px] font-bold text-foreground">{l.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{l.body}</p>
                </div>
              );
            })}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-[13px] leading-relaxed text-muted-foreground">
            Partner levels and preferential commercial terms are reviewed individually based on
            actual booking volume, frequency, payment reliability, operational cooperation and
            long-term business potential. Registration or enquiry volume alone does not guarantee
            preferential pricing or credit terms.
          </p>

          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border bg-muted p-6 sm:p-7">
            <h3 className="text-[15px] font-bold text-foreground">
              Built for Genuine Travel Partners
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Our B2B program is designed for travel agencies, tour operators, DMCs and other
              legitimate travel businesses serving real customers. Preferential commercial terms
              are based on genuine business activity, booking history, payment reliability and
              long-term partnership potential — not enquiry volume alone.
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              Repeated rate-only enquiries, fictitious requirements, unauthorized rate collection
              or misuse of partner-only information may result in restricted or terminated B2B
              access.
            </p>
          </div>
        </section>

        {/* 6b. How to become a partner */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="GET STARTED" title="How to Become a B2B Partner" />
          <ol className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {BECOME_PARTNER_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="mt-3 text-[14px] font-bold text-foreground">{step.title}</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
          <p className="mx-auto mt-6 max-w-2xl text-center text-[13px] leading-relaxed text-muted-foreground">
            Additional business verification may be requested where appropriate, especially for
            new or international partners.
          </p>
          <div className="mt-8 flex justify-center">
            <B2bRegisterButton className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground transition hover:brightness-110">
              Register as a B2B Partner
              <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
            </B2bRegisterButton>
          </div>
        </section>

        {/* 6c. Intro video */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="WATCH" title="See Vertex Kashmir Holidays in Action" />
          <p className="mx-auto mt-4 max-w-2xl text-center text-[14px] leading-relaxed text-muted-foreground">
            A quick look at how we work as your Kashmir DMC and ground handling partner.
          </p>
          <div className="mt-8">
            <B2bYoutubeEmbed videoId={B2B_VIDEO_ID} title={B2B_VIDEO_TITLE} />
          </div>
        </section>

        {/* 6d. Registration CTA */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="APPLY NOW" title="Register as a B2B Partner" />
          <p className="mx-auto mt-4 max-w-2xl text-center text-[14px] leading-relaxed text-muted-foreground">
            Submit your agency details and our B2B team will review your application. Once
            approved, we&apos;ll work with you on your Kashmir requirements, quotations and
            bookings.
          </p>
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[12px] font-bold text-muted-foreground">
            {["Register", "Application Review", "Partner Approval", "B2B Business Begins"].map(
              (step, i, arr) => (
                <span key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-border bg-card px-3.5 py-1.5 text-foreground">
                    {step}
                  </span>
                  {i < arr.length - 1 && (
                    <ArrowRight className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
                  )}
                </span>
              ),
            )}
          </div>
          <div className="mt-8 flex justify-center">
            <B2bRegisterButton className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-[15px] font-bold text-primary-foreground shadow-card transition hover:brightness-110">
              Start Your Application
              <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
            </B2bRegisterButton>
          </div>
        </section>

        {/* 7. Booking workflow */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="HOW IT WORKS" title="B2B Booking Workflow" />
          <ol className="mt-10 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {WORKFLOW_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="mt-3 text-[14px] font-bold text-foreground">{step.title}</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* 7b. Structured B2B management */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="HOW WE OPERATE" title="Structured B2B Management" />
          <p className="mx-auto mt-4 max-w-2xl text-center text-[14px] leading-relaxed text-muted-foreground">
            From your initial enquiry and customized itinerary to quotation, booking and travel
            coordination, our team manages your requirements through a structured system so your
            requests stay organized and easy to track.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: ClipboardList, label: "Enquiry & Requirement Management" },
              { icon: FileCheck2, label: "Customized Itinerary & Quotation" },
              { icon: FolderCog, label: "Booking & Document Management" },
              { icon: Headset, label: "Dedicated B2B Coordination" },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.label}
                  className="flex items-start gap-2.5 rounded-2xl border border-border bg-card p-5 shadow-card"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={1.9} />
                  <p className="text-[13px] font-semibold text-foreground">{f.label}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* 7c. Customized itinerary process */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading
            kicker="FOR YOUR CLIENTS"
            title="Need a Customized Kashmir Package for Your Client?"
          />
          <ol className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            {[
              "Send us your client's requirements.",
              "Our team prepares a customized itinerary and quotation.",
              "We refine it with you until it fits your customer's requirements.",
              "Once approved, we proceed with the booking process.",
            ].map((step, i) => (
              <li
                key={step}
                className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="text-[13.5px] leading-relaxed text-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 8. Commercial terms */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="COMMERCIAL TERMS" title="Terms That Apply to Every Booking" />
          <p className="mx-auto mt-6 max-w-2xl text-center text-[14px] leading-relaxed text-muted-foreground">
            Applicable terms will be communicated in the relevant quotation/booking confirmation.
            The categories below are covered as part of every B2B engagement:
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            {COMMERCIAL_TERMS.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border bg-card px-4 py-2 text-[12.5px] font-semibold text-foreground"
              >
                {t}
              </span>
            ))}
          </div>
          <ul className="mx-auto mt-8 max-w-2xl space-y-2">
            {COMMERCIAL_TERM_NOTES.map((n) => (
              <li key={n} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} />
                {n}
              </li>
            ))}
          </ul>
        </section>

        {/* 8c. Confidentiality & responsible use */}
        <section
          id="b2b-confidentiality"
          className="mt-16 scroll-mt-24 border-t border-border pt-14 sm:mt-20 sm:pt-16"
        >
          <SectionHeading kicker="RESPONSIBLE USE" title="B2B Rates &amp; Resources — Confidential Use" />
          <p className="mx-auto mt-4 max-w-2xl text-center text-[14px] leading-relaxed text-muted-foreground">
            Vertex B2B rates, quotations, itinerary materials and partner-only resources are
            provided exclusively for legitimate business use by approved partners.
          </p>
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7">
            <ul className="space-y-3">
              {[
                "B2B/net rates must not be publicly published or redistributed.",
                "Partner-only rates must not be shared with competing agencies or unauthorized third parties.",
                "Vertex itineraries, templates, PDFs, package structures, descriptions and other proprietary materials must not be copied, resold or commercially exploited outside the authorized partner relationship.",
                "Partners must not create multiple accounts or submit fictitious/repeated enquiries primarily to collect or compare Vertex rates.",
                "Partner credentials, where provided in future, must not be shared with unauthorized users.",
              ].map((rule) => (
                <li key={rule} className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} />
                  {rule}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-muted p-4 text-[13px] leading-relaxed text-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2} />
              <p>
                Vertex reserves the right to restrict, suspend or terminate B2B access, quotations
                or preferential commercial terms where partner resources are misused. Where misuse
                involves unauthorized disclosure, copying, commercial exploitation or infringement
                of Vertex&apos;s rights, Vertex reserves all rights and remedies available under
                applicable law.
              </p>
            </div>
          </div>
        </section>

        {/* 8b. What to include in an enquiry */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="BEFORE YOU ENQUIRE" title="What to Include in a B2B Enquiry" />
          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7">
            <div className="grid gap-3 sm:grid-cols-2">
              {ENQUIRY_CHECKLIST.map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2} />
                  <p className="text-[14px] text-foreground">{item}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
              The more complete the requirement, the faster and more accurately we can prepare the
              quotation.
            </p>
          </div>
        </section>

        {/* 9. FAQ */}
        <section className="mt-16 border-t border-border pt-14 sm:mt-20 sm:pt-16">
          <SectionHeading kicker="QUESTIONS" title="Frequently Asked Questions" />
          <div className="mx-auto mt-10 grid max-w-5xl gap-3 lg:grid-cols-2 lg:gap-x-5">
            {FAQS.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-lg border border-border bg-card shadow-soft [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
                  <h3 className="text-[14px] font-bold leading-snug text-foreground">
                    {faq.question}
                  </h3>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 -rotate-45 text-muted-foreground transition-transform duration-300 group-open:rotate-45 group-open:text-primary"
                    strokeWidth={2.4}
                  />
                </summary>
                <p className="px-4 pb-3.5 text-[14px] leading-relaxed text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* 10. Contact / final CTA */}
        <section
          id="b2b-contact"
          className="mt-16 scroll-mt-24 rounded-3xl border border-border bg-muted p-8 text-center sm:mt-20 sm:p-12"
        >
          <p className="text-[12px] font-bold tracking-[0.22em] text-primary">GET STARTED</p>
          <h2 className="h-display mt-3 font-display text-[22px] font-bold text-foreground sm:text-[26px]">
            Ready to Partner With Vertex Kashmir Holidays?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            Share your requirement and our B2B team will get back to you with a dynamic quotation.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <B2bWhatsAppLink
              href={quoteWaHref}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-bold text-primary-foreground transition hover:brightness-110"
            >
              Request B2B Quotation
              <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
            </B2bWhatsAppLink>
            <B2bWhatsAppLink
              href={talkWaHref}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-7 py-3.5 text-sm font-semibold text-foreground transition hover:bg-background"
            >
              Talk to Our B2B Team
            </B2bWhatsAppLink>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            New here?{" "}
            <B2bRegisterButton className="font-semibold text-primary hover:underline">
              Register as a B2B Partner
            </B2bRegisterButton>
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[14px]">
            {whatsapp && (
              <a
                href={buildWhatsAppHref(whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-semibold text-foreground hover:text-primary"
              >
                <WhatsAppIcon className="h-4 w-4" /> {whatsapp}
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-2 font-semibold text-foreground hover:text-primary"
              >
                <Phone className="h-4 w-4" strokeWidth={2} /> {phone}
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="inline-flex items-center gap-2 font-semibold text-foreground hover:text-primary"
              >
                <Mail className="h-4 w-4" strokeWidth={2} /> {email}
              </a>
            )}
          </div>
        </section>
      </main>

      <B2bRegisterModal />
    </div>
  );
}
