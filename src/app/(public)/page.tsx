import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/siteSettings";
import { JsonLd, buildItemList, buildWebSite, buildFAQPage } from "@/components/seo/JsonLd";
import { buildMetadata, SITE_URL } from "@/lib/seo";
import { AboutSection } from "@/components/about/AboutSection";
import { BlogSection } from "@/components/blog/BlogSection";
import { DestinationsSection } from "@/components/destinations/DestinationsSection";
import { HeroSection } from "@/components/home/HeroSection";
import { ActivitiesCarousel } from "@/components/activities/ActivitiesCarousel";
import { PackagesSection } from "@/components/home/PackagesSection";
import { TestimonialsSection } from "@/components/home/TestimonialsSection";
import { UpdatesStrip } from "@/components/home/UpdatesStrip";
import { VideoReviewsSection } from "@/components/home/VideoReviewsSection";
import { WhyChooseSection } from "@/components/home/WhyChooseSection";
import { FaqPreviewList } from "@/components/faqs/FaqPreviewList";
import { TransportAssistanceBanner } from "@/components/tours/TransportAssistanceBanner";
import { TrustSection } from "@/components/common/TrustSection";
import { getDisplayReviews } from "@/lib/reviews";
import { getFaqsForPlacement } from "@/lib/faqs";
import { getKashmirWeather } from "@/lib/weather";
import { HERO_FEATURES, PAYMENT_METHODS } from "@/lib/home/heroContent";
import { getVerifiedPropertiesCount } from "@/lib/hotelSuppliers/stats";
import type { SectionHeading } from "@/types/home";

// ISR: serve cached HTML and refresh in the background (admin edits appear
// within the window). Replaces force-dynamic, which hit the DB every request.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  return buildMetadata({
    // No brand suffix here — the root layout title template appends
    // "| Vertex Kashmir Holidays" automatically.
    title:
      settings?.metaTitle ??
      "Premium Kashmir Tour Packages — Honeymoon, Family & Adventure Holidays",
    description:
      settings?.metaDesc ??
      "Discover Kashmir with Vertex Kashmir Holidays — curated honeymoon, family, adventure and luxury tour packages. Dal Lake houseboats, Gulmarg Gondola and glacier treks, booked online with local experts.",
    canonical: SITE_URL,
    ogImage: settings?.ogImage ?? null,
  });
}

export default async function HomePage() {
  const [
    content,
    sections,
    slides,
    stats,
    tickerItems,
    videos,
    tours,
    whyItems,
    destinations,
    activities,
    reviews,
    blogs,
    faqs,
    verifiedPropertiesCount,
    publishedToursCount,
  ] = await Promise.all([
    prisma.homeContent.findUnique({ where: { id: "singleton" } }),
    prisma.homeSection.findMany(),
    prisma.heroSlide.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.siteStat.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.tickerItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.videoReview.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.tour.findMany({
      where: { published: true, region: "KASHMIR" },
      orderBy: [{ bestseller: "desc" }, { rating: "desc" }],
      take: 4,
      select: {
        id: true,
        slug: true,
        title: true,
        badge: true,
        badgeColor: true,
        duration: true,
        coverImage: true,
        rating: true,
        reviewCount: true,
        priceFrom: true,
        priceWas: true,
        minPersons: true,
        destinations: { select: { destination: { select: { name: true } } } },
      },
    }),
    prisma.whyChooseItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.destination.findMany({
      where: { isFeatured: true },
      orderBy: { sortOrder: "asc" },
      take: 5,
    }),
    // Homepage "Popular Things to Do" carousel — 4 handpicked activities.
    prisma.activity.findMany({
      where: { published: true },
      orderBy: { sortOrder: "asc" },
      take: 4,
      select: {
        id: true,
        slug: true,
        name: true,
        location: true,
        coverImage: true,
        duration: true,
        price: true,
      },
    }),
    // Approved customer reviews power the "what travellers say" section — the
    // admin Review module is the single source of truth (no CMS testimonials).
    // Capped at 4 — the full list lives on /reviews (linked via "View all").
    getDisplayReviews(4),
    prisma.blog.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      take: 3,
    }),
    // Centralized FAQ module — same Faq pool /about, /contact and /faq draw from.
    getFaqsForPlacement("HOME"),
    // Real, derived trust counts for the hero stat strip — never hardcoded.
    // Scoped to region: "KASHMIR" to match the "Kashmir Tours" label (Tour also
    // has a LADAKH region, which this page's featured list already excludes).
    getVerifiedPropertiesCount(),
    prisma.tour.count({ where: { published: true, region: "KASHMIR" } }),
  ]);

  // Live weather for the updates strip — fetched in parallel but outside the
  // main Promise.all so a weather API failure never blocks the page render.
  const kashmirWeather = await getKashmirWeather();
  const weatherTicker = kashmirWeather.map(
    (w) => `🌡️ ${w.name} · ${w.temperature}°C — ${w.condition}`,
  );

  const heading = (key: string): SectionHeading => {
    const s = sections.find((x) => x.key === key);
    return {
      kicker: s?.kicker ?? null,
      title: s?.title ?? null,
      subtitle: s?.subtitle ?? null,
      ctaLabel: s?.ctaLabel ?? null,
      ctaHref: s?.ctaHref ?? null,
    };
  };

  // Real, DB-derived trust stats appended after the admin-authored SiteStat
  // rows — never invented, and only shown when the underlying count is > 0.
  const derivedHeroStats: { label: string; value: string; suffix: string | null }[] = [];
  if (verifiedPropertiesCount > 0) {
    derivedHeroStats.push({
      label: "Verified Properties",
      value: String(verifiedPropertiesCount),
      suffix: "+",
    });
  }
  if (publishedToursCount > 0) {
    derivedHeroStats.push({
      label: publishedToursCount === 1 ? "Kashmir Tour" : "Kashmir Tours",
      value: String(publishedToursCount),
      suffix: null,
    });
  }

  let formAvatars: string[] = [];
  try {
    formAvatars = JSON.parse(content?.formAvatars ?? "[]");
  } catch {
    formAvatars = [];
  }

  // ── Structured data (JSON-LD) ────────────────────────────────────────────
  // Organization schema is injected sitewide in `(public)/layout.tsx` — not
  // duplicated here. WebSite schema is homepage-only per Google's structured
  // data guidelines (it's the "preferred site name" signal), so it lives here
  // and nowhere else.
  const webSiteJsonLd = buildWebSite();
  const packagesJsonLd = buildItemList(
    tours.map((t) => ({
      name: t.title,
      url: `${SITE_URL}/tours/${t.slug}`,
    })),
    "Featured Kashmir Tour Packages",
  );
  // Short answers only — matches what FaqPreviewList actually renders below.
  const faqJsonLd =
    faqs.length > 0
      ? buildFAQPage(faqs.map((f) => ({ question: f.question, answer: f.shortAnswer })))
      : null;

  return (
    <div className="bg-background text-foreground">
      <JsonLd data={webSiteJsonLd} />
      {tours.length > 0 && <JsonLd data={packagesJsonLd} />}
      {faqJsonLd && <JsonLd data={faqJsonLd} />}
      <HeroSection
        content={{
          badge: content?.heroBadge ?? null,
          title: content?.heroTitle ?? null,
          subtitle: content?.heroSubtitle ?? null,
          ctaPrimaryLabel: content?.heroCtaPrimaryLabel ?? null,
          ctaPrimaryHref: content?.heroCtaPrimaryHref ?? null,
          ctaSecondaryLabel: content?.heroCtaSecondaryLabel ?? null,
          ctaSecondaryHref: content?.heroCtaSecondaryHref ?? null,
          formKicker: content?.formKicker ?? null,
          formTitle: content?.formTitle ?? null,
          formSubtitle: content?.formSubtitle ?? null,
          formButtonLabel: content?.formButtonLabel ?? null,
          formNote: content?.formNote ?? null,
          formAvatars,
        }}
        slides={slides.map((s) => ({ image: s.image, imageMobile: s.imageMobile, alt: s.alt }))}
        stats={[
          ...stats
            .filter((s) => s.section === "hero")
            .map((s) => ({ label: s.label, value: s.value, suffix: s.suffix })),
          ...derivedHeroStats,
        ]}
        features={HERO_FEATURES}
        paymentMethods={PAYMENT_METHODS}
      />
      <UpdatesStrip items={[...weatherTicker, ...tickerItems.map((t) => t.text)]} />
      <VideoReviewsSection
        heading={heading("videos")}
        videos={videos.map((v) => ({
          id: v.id,
          name: v.name,
          place: v.place,
          duration: v.duration,
          thumbnail: v.thumbnail,
          videoUrl: v.videoUrl,
        }))}
      />
      <PackagesSection
        heading={heading("packages")}
        tours={tours.map((t) => ({
          id: t.id,
          slug: t.slug,
          title: t.title,
          badge: t.badge,
          badgeColor: t.badgeColor,
          durationLabel: `${t.duration - 1}N / ${t.duration}D`,
          places: t.destinations.map((d) => d.destination.name).join(", "),
          image: t.coverImage,
          rating: t.rating,
          reviewCount: t.reviewCount,
          priceFrom: t.priceFrom,
          priceWas: t.priceWas,
          minPersons: t.minPersons,
        }))}
      />
      <div className="mx-auto max-w-[1300px] px-4 py-10 sm:px-6 sm:py-12">
        <TransportAssistanceBanner placement="homepage" />
      </div>
      <WhyChooseSection
        heading={heading("why")}
        items={whyItems.map((w) => ({
          id: w.id,
          emoji: w.emoji,
          title: w.title,
          description: w.description,
        }))}
      />
      <DestinationsSection
        heading={heading("destinations")}
        destinations={destinations.map((d) => ({
          id: d.id,
          slug: d.slug,
          name: d.name,
          tagline: d.tagline,
          coverImage: d.coverImage,
        }))}
      />
      <AboutSection
        heading={heading("about")}
        content={{
          para1: content?.aboutPara1 ?? null,
          para2: content?.aboutPara2 ?? null,
          image1: content?.aboutImage1 ?? null,
          image2: content?.aboutImage2 ?? null,
          cardEmoji: content?.aboutCardEmoji ?? null,
          cardTitle: content?.aboutCardTitle ?? null,
          cardSubtitle: content?.aboutCardSubtitle ?? null,
          ratingTitle: content?.aboutRatingTitle ?? null,
          ratingSubtitle: content?.aboutRatingSubtitle ?? null,
        }}
        stats={stats
          .filter((s) => s.section === "about")
          .map((s) => ({ label: s.label, value: s.value, suffix: s.suffix }))}
      />
      <div className="relative z-[2] mx-auto max-w-[1300px] px-4 pt-16 sm:px-6 sm:pt-24">
        <ActivitiesCarousel
          title="Popular Things to Do in Kashmir"
          seeAllHref="/activities"
          items={activities.map((a) => ({
            id: a.id,
            slug: a.slug,
            name: a.name,
            location: a.location,
            duration: a.duration,
            price: a.price,
            image: a.coverImage,
          }))}
        />
      </div>
      <TestimonialsSection heading={heading("testimonials")} testimonials={reviews} />
      {faqs.length > 0 && (
        <section className="mx-auto max-w-[1300px] px-4 py-14 sm:px-6">
          <div className="text-center">
            <p className="text-[12px] font-bold tracking-[0.22em] text-primary">
              {heading("faqs").kicker ?? "QUESTIONS"}
            </p>
            <h2 className="h-display mt-3 font-display text-[18px] font-bold leading-snug">
              {heading("faqs").title ?? "Frequently Asked"}
            </h2>
          </div>
          <div className="mt-8">
            <FaqPreviewList faqs={faqs} columns={2} />
          </div>
          <div className="mt-6 flex justify-center">
            <Link
              href="/faq"
              className="inline-flex items-center gap-1.5 text-[14px] font-bold text-primary hover:underline"
            >
              View all FAQs
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
            </Link>
          </div>
        </section>
      )}
      <BlogSection
        heading={heading("blogs")}
        blogs={blogs.map((b) => ({
          id: b.id,
          slug: b.slug,
          title: b.title,
          excerpt: b.excerpt,
          coverImage: b.coverImage,
          category: b.category,
          readTime: b.readTime,
          dateLabel: b.publishedAt
            ? b.publishedAt.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : null,
        }))}
      />
      <TrustSection type="home" />
    </div>
  );
}
