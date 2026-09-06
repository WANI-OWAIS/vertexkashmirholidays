// src/app/(public)/destinations/[slug]/page.tsx
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildMetadata, SITE_URL } from "@/lib/seo";
import { getLiveWeather } from "@/lib/weather";
import { imgSrc } from "@/lib/placeholder";
import {
  JsonLd,
  buildBreadcrumbList,
  buildTouristDestination,
  buildFAQPage,
} from "@/components/seo/JsonLd";
import { formatINR } from "@/lib/accents";
import {
  parseStringList,
  parseTopAttractions,
  parseFoodOrShop,
  parseIdList,
} from "@/lib/destinations/content";
import { DestinationDetailGallery } from "@/components/destinations/DestinationDetailGallery";
import { DestinationDetailHero } from "@/components/destinations/DestinationDetailHero";
import { getVerifiedPropertiesCountForDestination } from "@/lib/hotelSuppliers/stats";
import { DestinationDetailOverview } from "@/components/destinations/DestinationDetailOverview";
import { DestinationDetailSidebar } from "@/components/destinations/DestinationDetailSidebar";
import { DestinationDetailTabs } from "@/components/destinations/DestinationDetailTabs";
import { ActivitiesShowcase } from "@/components/activities/ActivitiesShowcase";
import {
  DestinationDetailTours,
  type DestinationTour,
} from "@/components/destinations/DestinationDetailTours";
import { DestinationWhyVisit } from "@/components/destinations/DestinationWhyVisit";
import { DestinationTopAttractions } from "@/components/destinations/DestinationTopAttractions";
import { DestinationBestTime } from "@/components/destinations/DestinationBestTime";
import { DestinationHowToReach } from "@/components/destinations/DestinationHowToReach";
import { DestinationWhereToStay } from "@/components/destinations/DestinationWhereToStay";
import { DestinationLocalFood } from "@/components/destinations/DestinationLocalFood";
import { DestinationShopping } from "@/components/destinations/DestinationShopping";
import { DestinationTravelTips } from "@/components/destinations/DestinationTravelTips";
import { FaqPreviewList } from "@/components/faqs/FaqPreviewList";
import { DestinationRelatedBlogs } from "@/components/destinations/DestinationRelatedBlogs";
import { DestinationNearby } from "@/components/destinations/DestinationNearby";
import { TrustSection } from "@/components/common/TrustSection";
import type { DestinationCardData } from "@/components/destinations/DestinationsGrid";

export const revalidate = 900;

// Without this, Next.js has no known slug list to pre-render and falls back
// to fully dynamic rendering on every request regardless of `revalidate`
// (confirmed via build output: this route stayed ƒ even after ISR was
// restored on the rest of the public site). The catalog is small (single
// digits), so pre-rendering all of them at build time is cheap; any
// destination added after a deploy is rendered on its first request and
// cached from then on.
export async function generateStaticParams() {
  const destinations = await prisma.destination.findMany({
    select: { slug: true },
  });
  return destinations.map((d) => ({ slug: d.slug }));
}

type PageProps = { params: Promise<{ slug: string }> };

const BADGE_COLORS = ["orange", "blue", "green"] as const;

// ── Decorative SVG icon paths (not stored in the DB) ────────────────────────
const ICON = {
  altitude: "m8 21 4-14 4 14M5 21h14M10 13h4",
  calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
  star: "m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1L12 17l-5.5 3 1-6.1L3 9.5l6.3-.9Z",
  package: "M3 11h18l-2 8H5ZM8 11V7a4 4 0 0 1 8 0v4",
  pin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  camera: "M3 3h18v18H3zM9 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M21 15l-3.8-3.8a2 2 0 0 0-2.8 0L6 20",
  overview: "M12 12a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 8v4l2.5 2.5",
  bolt: "m13 2-2 9h4l-4 11 1-8H8l5-12Z",
  home: "M4 11 12 4l8 7M6 10v10h5v-6h2v6h5V10",
};

const TABS = [
  { id: "overview", label: "Overview", icon: ICON.overview },
  { id: "things", label: "Things to Do", icon: ICON.bolt },
  { id: "tours", label: "Tours", icon: ICON.package },
  { id: "gallery", label: "Gallery", icon: ICON.camera },
];

// Wrapped in React's cache() so generateMetadata() and the page component
// share one query per request instead of each fetching this row separately.
const getDestination = cache(async (slug: string) => {
  return prisma.destination.findUnique({
    where: { slug },
    include: {
      tours: {
        where: { tour: { published: true } },
        select: {
          tour: {
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
          },
        },
      },
      // Published activities linked to this destination → "Things to Do".
      activities: {
        where: { activity: { published: true } },
        include: {
          activity: {
            select: {
              id: true,
              slug: true,
              name: true,
              description: true,
              coverImage: true,
              duration: true,
            },
          },
        },
      },
      // Centralized FAQ module.
      relatedFaqs: {
        where: { status: "PUBLISHED" },
        orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
        select: { id: true, question: true, shortAnswer: true, slug: true },
      },
    },
  });
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const dest = await getDestination(slug);

  if (!dest) {
    return buildMetadata({
      title: "Destination Not Found",
      description: "The Kashmir destination you are looking for could not be found.",
      canonical: `${SITE_URL}/destinations/${slug}`,
      noindex: true,
    });
  }

  return buildMetadata({
    title: dest.metaTitle ?? dest.name,
    description:
      dest.metaDesc ??
      dest.excerpt ??
      dest.description ??
      `${dest.name} — a curated Kashmir destination by Vertex Kashmir Holidays.`,
    canonical: `${SITE_URL}/destinations/${slug}`,
    ogImage: dest.ogImage ?? dest.coverImage ?? null,
    ogTitle: dest.ogTitle ?? null,
    ogDescription: dest.ogDescription ?? null,
  });
}

export default async function DestinationDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const dest = await getDestination(slug);

  if (!dest) notFound();

  const relatedBlogIds = parseIdList(dest.relatedBlogIds);

  const [nearbyRaw, relatedBlogsRaw] = await Promise.all([
    prisma.destination.findMany({
      where: {
        slug: { not: dest.slug },
        ...(dest.region ? { region: dest.region } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 4,
      select: {
        slug: true,
        name: true,
        tagline: true,
        excerpt: true,
        description: true,
        coverImage: true,
        season: true,
        region: true,
        location: true,
        latitude: true,
        longitude: true,
        _count: { select: { tours: { where: { tour: { published: true } } } } },
      },
    }),
    relatedBlogIds.length > 0
      ? prisma.blog.findMany({
          where: { id: { in: relatedBlogIds }, published: true },
          select: {
            id: true,
            slug: true,
            title: true,
            excerpt: true,
            coverImage: true,
            category: true,
            publishedAt: true,
            readTime: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const nearbyDestinations: DestinationCardData[] = await Promise.all(
    nearbyRaw.map(async (d) => {
      const weather =
        d.latitude != null && d.longitude != null
          ? await getLiveWeather(d.latitude, d.longitude)
          : null;
      return {
        slug: d.slug,
        name: d.name,
        tagline: d.tagline,
        description: d.excerpt ?? d.description,
        coverImage: d.coverImage,
        temperature: weather?.temperature ?? null,
        season: d.season,
        region: d.region ?? (/ladakh/i.test(d.location ?? "") ? "Ladakh" : "Kashmir Valley"),
        tours: d._count.tours,
      };
    }),
  );

  const shortDate = (d: Date | null) =>
    d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

  const relatedBlogs = relatedBlogIds
    .map((id) => relatedBlogsRaw.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .map((b) => ({
      id: b.id,
      slug: b.slug,
      title: b.title,
      excerpt: b.excerpt,
      coverImage: b.coverImage,
      category: b.category,
      dateLabel: shortDate(b.publishedAt),
      readTime: b.readTime,
    }));

  // ── Display facts: prefer explicit DB fields, fall back to deriving from
  // `location` for older records that predate the dedicated columns. ──────────
  const region = dest.region ?? (/ladakh/i.test(dest.location ?? "") ? "Ladakh" : "Kashmir Valley");
  const altMatch = dest.location?.match(/([\d,]+)\s*m\b/i);
  const altitude = dest.altitude ?? (altMatch ? `${altMatch[1]} m` : "High Altitude");
  const season = dest.season ?? "Apr – Oct";

  // Live current conditions from Open-Meteo when the destination has coords.
  const liveWeather =
    dest.latitude != null && dest.longitude != null
      ? await getLiveWeather(dest.latitude, dest.longitude)
      : null;

  const tours = dest.tours.map((td) => td.tour);
  const totalReviews = tours.reduce((sum, t) => sum + t.reviewCount, 0);
  const avgRating = tours.length ? tours.reduce((sum, t) => sum + t.rating, 0) / tours.length : 4.8;

  const heroImage = imgSrc(dest.coverImage);

  // Real, DB-derived count of active B2B hotel/houseboat suppliers recorded
  // against this destination (aggregate only — never names). Omitted
  // entirely when there's no reliable count, rather than showing a 0.
  const verifiedProperties = await getVerifiedPropertiesCountForDestination(dest.slug, dest.name);

  const stats = [
    { value: altitude, label: "Altitude", icon: ICON.altitude },
    { value: season, label: "Best Season", icon: ICON.calendar },
    {
      value: String(tours.length),
      label: tours.length === 1 ? "Tour Package" : "Tour Packages",
      icon: ICON.package,
    },
    {
      value: `${avgRating.toFixed(1)}/5`,
      label: `${totalReviews.toLocaleString()} reviews`,
      icon: ICON.star,
    },
    ...(verifiedProperties > 0
      ? [
          {
            value: String(verifiedProperties),
            label: verifiedProperties === 1 ? "Verified Stay" : "Verified Stays",
            icon: ICON.home,
          },
        ]
      : []),
  ];

  const destinationTours: DestinationTour[] = tours.map((t) => ({
    badge: t.badge ?? "FEATURED",
    bc: (BADGE_COLORS as readonly string[]).includes(t.badgeColor ?? "")
      ? (t.badgeColor as (typeof BADGE_COLORS)[number])
      : "green",
    seed: t.id,
    image: t.coverImage ?? undefined,
    bookHref: `/tours/${t.slug}`,
    whatsappHref: "#",
    t: t.title,
    d: `${t.duration - 1}N / ${t.duration}D`,
    places: t.destinations.map((d) => d.destination.name).join(", "),
    r: t.rating.toFixed(1),
    n: String(t.reviewCount),
    old: t.priceWas ? formatINR(t.priceWas) : undefined,
    p: formatINR(t.priceFrom),
    minPersons: t.minPersons,
  }));

  // Things to Do — driven by the Activities module (published, linked to this
  // destination). The section hides itself when nothing is linked.
  const things = dest.activities.map((a) => ({
    id: a.activity.id,
    image: a.activity.coverImage,
    title: a.activity.name,
    description: a.activity.description ?? "",
    duration: a.activity.duration,
    href: `/activities/${a.activity.slug}`,
  }));

  // Gallery = the destination cover + the cover images of its linked activities
  // (real content, no external placeholders).
  const gallery = [dest.coverImage, ...dest.activities.map((a) => a.activity.coverImage)].filter(
    (img): img is string => Boolean(img),
  );

  const quickInfo = [
    { label: "Location", value: dest.location ?? "Jammu & Kashmir", icon: ICON.pin },
    { label: "Altitude", value: altitude, icon: ICON.altitude },
    { label: "Best Time to Visit", value: season, icon: ICON.calendar },
    { label: "Famous For", value: dest.tagline ?? "Scenic beauty", icon: ICON.star },
    { label: "Region", value: region, icon: ICON.pin },
    {
      label: "Tour Packages",
      value: `${tours.length} available`,
      icon: ICON.package,
    },
  ];

  // Live weather when available, otherwise a neutral fallback so the widget
  // always renders.
  const weather = liveWeather ?? {
    temperature: 18,
    condition: "Partly Cloudy",
    humidity: 56,
    wind: 12,
    feelsLike: 16,
  };

  // ── Finalized content (string-encoded JSON columns) ───────────────────────
  const whyVisit = parseStringList(dest.whyVisit);
  const topAttractions = parseTopAttractions(dest.topAttractions);
  const localFood = parseFoodOrShop(dest.localFood);
  const shopping = parseFoodOrShop(dest.shopping);
  const travelTips = parseStringList(dest.travelTips);
  const faqs = dest.relatedFaqs;

  // ── Structured data (JSON-LD) ─────────────────────────────────────────────
  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Home", url: SITE_URL },
    { name: "Destinations", url: `${SITE_URL}/destinations` },
    { name: dest.name, url: `${SITE_URL}/destinations/${dest.slug}` },
  ]);

  const destinationJsonLd = buildTouristDestination({
    name: dest.name,
    slug: dest.slug,
    description: dest.description ?? dest.excerpt,
    coverImage: dest.coverImage,
    location: dest.location,
    latitude: dest.latitude,
    longitude: dest.longitude,
  });

  return (
    <div className="bg-background text-foreground">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={destinationJsonLd} />
      {faqs.length > 0 && (
        <JsonLd
          data={buildFAQPage(faqs.map((f) => ({ question: f.question, answer: f.shortAnswer })))}
        />
      )}

      <DestinationDetailHero
        name={dest.name}
        tagline={dest.tagline ?? ""}
        region={region}
        image={heroImage}
        imageMobile={dest.coverImageMobile}
        stats={stats}
        weather={liveWeather}
      />

      <DestinationDetailTabs sections={TABS} />

      <main className="relative z-10 bg-background pb-16">
        <div className="mx-auto max-w-[1300px] px-3 sm:px-6 pt-8">
          <div className="grid items-start gap-7 lg:grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-7">
              {/* 3. Overview */}
              <DestinationDetailOverview
                name={dest.name}
                description={dest.description ?? dest.excerpt ?? ""}
              />
              {/* 4. Why Visit */}
              <DestinationWhyVisit name={dest.name} reasons={whyVisit} />
              {/* 5. Top Attractions */}
              <DestinationTopAttractions name={dest.name} attractions={topAttractions} />
              {/* Featured Tours — moved here, right after Top Attractions */}
              {destinationTours.length > 0 && (
                <DestinationDetailTours name={dest.name} tours={destinationTours} />
              )}
              {/* 6. Best Time to Visit (Live Weather stays parallel in the sidebar) */}
              <DestinationBestTime html={dest.bestTimeDetail} />
              {/* 8. How to Reach */}
              <DestinationHowToReach html={dest.howToReach} />
              {/* 9. Where to Stay */}
              <DestinationWhereToStay html={dest.whereToStay} />
              {/* 10. Local Food */}
              <DestinationLocalFood items={localFood} />
              {/* 11. Shopping */}
              <DestinationShopping items={shopping} />
              {/* 12. Travel Tips */}
              <DestinationTravelTips tips={travelTips} />
              {/* 13. Things To Do (existing ActivitiesShowcase) */}
              <ActivitiesShowcase
                title={`Things to Do in ${dest.name}`}
                items={things}
                seeAllHref="/activities"
              />
              {/* 14. Nearby Destinations */}
              <DestinationNearby destinations={nearbyDestinations} />
              {/* 15. Gallery */}
              <DestinationDetailGallery name={dest.name} images={gallery} />
              {/* 16. FAQs */}
              {faqs.length > 0 && (
                <section className="rounded-2xl border border-border bg-card p-3 sm:p-6 shadow-soft">
                  <h2 className="text-[18px] font-bold">FAQs</h2>
                  <div className="mt-4">
                    <FaqPreviewList faqs={faqs} />
                  </div>
                </section>
              )}
              {/* 17. Related Blogs */}
              <DestinationRelatedBlogs posts={relatedBlogs} />
            </div>

            <DestinationDetailSidebar name={dest.name} quickInfo={quickInfo} weather={weather} />
          </div>
        </div>
      </main>

      <TrustSection type="destination" name={dest.name} />
    </div>
  );
}
