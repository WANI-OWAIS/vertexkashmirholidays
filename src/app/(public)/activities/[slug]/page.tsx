import { ActivityBestTime } from "@/components/activities/ActivityBestTime";
import { ActivityDetailTabs } from "@/components/activities/ActivityDetailTabs";
import { ActivityDifficulty } from "@/components/activities/ActivityDifficulty";
import { ActivityHighlights } from "@/components/activities/ActivityHighlights";
import { ActivityNearby } from "@/components/activities/ActivityNearby";
import { ActivityPricingGuide } from "@/components/activities/ActivityPricingGuide";
import { ActivityQuickFacts } from "@/components/activities/ActivityQuickFacts";
import { ActivityRelatedDestinations } from "@/components/activities/ActivityRelatedDestinations";
import { ActivitySafetyTips } from "@/components/activities/ActivitySafetyTips";
import { ActivitySuitableFor } from "@/components/activities/ActivitySuitableFor";
import { ActivityWhatToCarry } from "@/components/activities/ActivityWhatToCarry";
import { ActivityWhyExperience } from "@/components/activities/ActivityWhyExperience";
import {
  DestinationDetailTours,
  type DestinationTour,
} from "@/components/destinations/DestinationDetailTours";
import { DestinationRelatedBlogs } from "@/components/destinations/DestinationRelatedBlogs";
import { SecondaryHero } from "@/components/layout/SecondaryHero";
import { HeroLeadCard } from "@/components/leads/HeroLeadCard";
import {
  buildBreadcrumbList,
  buildFAQPage,
  buildImageObjectList,
  buildTouristAttraction,
  JsonLd,
} from "@/components/seo/JsonLd";
import { FaqPreviewList } from "@/components/faqs/FaqPreviewList";
import { TrustSection } from "@/components/common/TrustSection";
import { TourDetailsGallery } from "@/components/tours/TourDetailsGallery";
import { formatINR } from "@/lib/accents";
import { prisma } from "@/lib/prisma";
import { buildMetadata, SITE_URL } from "@/lib/seo";
import { parseJson } from "@/lib/tours/content";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

export const revalidate = 900;

export async function generateStaticParams() {
  const activities = await prisma.activity.findMany({
    where: { published: true },
    select: { slug: true },
  });
  return activities.map((a) => ({ slug: a.slug }));
}

type PageProps = { params: Promise<{ slug: string }> };

const BADGE_COLORS = ["orange", "blue", "green"] as const;

// Wrapped in React's cache() so generateMetadata() and the page component
// share one query per request instead of each fetching this row separately.
const getActivity = cache(async (slug: string) => {
  return prisma.activity.findFirst({
    where: { slug, published: true },
    include: {
      tours: {
        where: { tour: { published: true } },
        include: {
          tour: {
            include: { destinations: { include: { destination: { select: { name: true } } } } },
          },
        },
      },
      destinations: {
        include: {
          destination: {
            select: {
              id: true,
              slug: true,
              name: true,
              tagline: true,
              coverImage: true,
              relatedBlogIds: true,
            },
          },
        },
      },
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
  const activity = await getActivity(slug);

  if (!activity) {
    return buildMetadata({
      title: "Activity Not Found",
      description: "The Kashmir activity you are looking for could not be found.",
      canonical: `${SITE_URL}/activities/${slug}`,
      noindex: true,
    });
  }

  return buildMetadata({
    title: activity.metaTitle ?? activity.name,
    description:
      activity.metaDesc ??
      activity.description ??
      `${activity.name} — a handpicked Kashmir experience by Vertex Kashmir Holidays.`,
    canonical: `${SITE_URL}/activities/${slug}`,
    ogImage: activity.ogImage ?? activity.coverImage ?? null,
  });
}

export default async function ActivityDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const activity = await getActivity(slug);
  if (!activity) notFound();

  const gallery = parseJson<string[]>(activity.images, []);
  const activityHighlights = parseJson<{ name: string; description: string }[]>(
    activity.activityHighlights,
    [],
  );
  const suitableFor = parseJson<string[]>(activity.suitableFor, []);
  const safetyTips = parseJson<string[]>(activity.safetyTips, []);
  const whatToCarry = parseJson<string[]>(activity.whatToCarry, []);
  const faqs = activity.relatedFaqs;

  const relatedDestinations = activity.destinations.map((d) => d.destination);

  const relatedTours: DestinationTour[] = activity.tours.map(({ tour: t }) => ({
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
    places: t.destinations.map((td) => td.destination.name).join(", "),
    r: t.rating.toFixed(1),
    n: String(t.reviewCount),
    old: t.priceWas ? formatINR(t.priceWas) : undefined,
    p: formatINR(t.priceFrom),
  }));

  // Nearby Activities — derived from shared destinations, no new relation.
  const destinationIds = relatedDestinations.map((d) => d.id);
  const nearbyRaw =
    destinationIds.length > 0
      ? await prisma.activity.findMany({
          where: {
            published: true,
            slug: { not: slug },
            destinations: { some: { destinationId: { in: destinationIds } } },
          },
          orderBy: { sortOrder: "asc" },
          take: 4,
          select: {
            id: true,
            slug: true,
            name: true,
            location: true,
            duration: true,
            price: true,
            coverImage: true,
          },
        })
      : [];
  const nearbyActivities = nearbyRaw.map((a) => ({
    id: a.id,
    slug: a.slug,
    name: a.name,
    location: a.location,
    duration: a.duration,
    price: a.price,
    image: a.coverImage,
  }));

  // Related Blogs — derived editorially from the linked destinations'
  // curated relatedBlogIds, not a new Activity ↔ Blog relation.
  const relatedBlogIds = Array.from(
    new Set(relatedDestinations.flatMap((d) => parseJson<string[]>(d.relatedBlogIds, []))),
  );
  const relatedBlogsRaw =
    relatedBlogIds.length > 0
      ? await prisma.blog.findMany({
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
      : [];
  const relatedBlogs = relatedBlogsRaw.map((b) => ({
    id: b.id,
    slug: b.slug,
    title: b.title,
    excerpt: b.excerpt,
    coverImage: b.coverImage,
    category: b.category,
    dateLabel: b.publishedAt
      ? b.publishedAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null,
    readTime: b.readTime,
  }));

  const breadcrumbJsonLd = buildBreadcrumbList([
    { name: "Home", url: SITE_URL },
    { name: "Activities", url: `${SITE_URL}/activities` },
    { name: activity.name, url: `${SITE_URL}/activities/${activity.slug}` },
  ]);

  const attractionJsonLd = buildTouristAttraction({
    name: activity.name,
    slug: activity.slug,
    description: activity.description,
    coverImage: activity.coverImage,
    location: activity.location,
  });

  return (
    <div className="bg-background text-foreground">
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={attractionJsonLd} />
      {gallery.length > 0 &&
        buildImageObjectList(gallery).map((img, i) => <JsonLd key={i} data={img} />)}
      {faqs.length > 0 && (
        <JsonLd
          data={buildFAQPage(faqs.map((f) => ({ question: f.question, answer: f.shortAnswer })))}
        />
      )}

      <SecondaryHero
        image={activity.coverImage ?? "/hero/gulmarg-lg.webp"}
        imageMobile={activity.coverImageMobile}
        alt={activity.name}
        aside={<HeroLeadCard source="activity-detail" buttonLabel="Enquire Now" />}
      >
        <nav className="flex items-center gap-2 text-[14px] text-white/80" aria-label="Breadcrumb">
          <Link href="/" className="transition hover:text-white">
            Home
          </Link>
          <span>›</span>
          <Link href="/activities" className="transition hover:text-white">
            Activities
          </Link>
          <span>›</span>
          <span className="font-semibold text-white">{activity.name}</span>
        </nav>
        <h1 className="mt-6 h-display text-3xl font-bold text-white sm:text-4xl lg:text-[44px]">
          {activity.name}
        </h1>
      </SecondaryHero>

      <main className="mx-auto max-w-[1300px] space-y-6 px-3 sm:px-6 py-10">
        <ActivityDetailTabs
          sections={[
            { id: "overview", label: "Overview" },
            ...(activityHighlights.length ? [{ id: "highlights", label: "Highlights" }] : []),
            ...(activity.pricingGuide ? [{ id: "pricing-guide", label: "Pricing" }] : []),
            ...(gallery.length ? [{ id: "gallery", label: "Gallery" }] : []),
            ...(faqs.length ? [{ id: "faqs", label: "FAQs" }] : []),
          ]}
        />

        {/* 2. Quick Facts */}
        <ActivityQuickFacts
          location={activity.location}
          duration={activity.duration}
          price={activity.price}
          difficulty={activity.difficulty}
        />

        {/* 3 + 4. Overview & Why Experience This — merged into one card */}
        {(activity.description || activity.whyExperience) && (
          <section
            id="overview"
            className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-3 sm:p-6 shadow-soft"
          >
            {activity.description && (
              <div>
                <h2 className="text-[18px] font-bold">About this experience</h2>
                <p className="mt-3 whitespace-pre-line text-[16px] leading-relaxed text-foreground/85">
                  {activity.description}
                </p>
              </div>
            )}
            {activity.whyExperience && (
              <ActivityWhyExperience name={activity.name} html={activity.whyExperience} bare />
            )}
          </section>
        )}

        {/* 5. Activity Highlights */}
        <ActivityHighlights highlights={activityHighlights} />

        {/* 6 + 8 + 9. Best Time | Difficulty + Suitable For */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ActivityBestTime html={activity.bestTime} />
          <div className="space-y-4">
            <ActivityDifficulty difficulty={activity.difficulty} />
            <ActivitySuitableFor items={suitableFor} />
          </div>
        </div>

        {/* 7. Duration — already surfaced in Quick Facts above */}

        {/* 10. Pricing Guide */}
        <ActivityPricingGuide html={activity.pricingGuide} />

        {/* 11 + 12. Safety Tips | What to Carry */}
        <div className="grid gap-4 sm:grid-cols-2">
          <ActivitySafetyTips tips={safetyTips} />
          <ActivityWhatToCarry items={whatToCarry} />
        </div>

        {/* Featured Tours — moved here, right before Gallery */}
        {relatedTours.length > 0 && (
          <DestinationDetailTours name={activity.name} tours={relatedTours} />
        )}

        {/* 13 + 16. Gallery (60%) | Where to Experience This (40%) */}
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          {gallery.length > 0 && (
            <TourDetailsGallery
              images={gallery.map((src) => ({ url: src, alt: activity.name }))}
              noTopMargin
            />
          )}
          <ActivityRelatedDestinations destinations={relatedDestinations} />
        </div>

        {/* 15. Nearby Activities */}
        <ActivityNearby activities={nearbyActivities} />

        {/* 18. Related Blogs */}
        <DestinationRelatedBlogs posts={relatedBlogs} />

        {/* 14. FAQs — moved to last */}
        {faqs.length > 0 && (
          <section
            id="faqs"
            className="scroll-mt-16 rounded-2xl border border-border bg-card p-3 sm:p-6 shadow-soft"
          >
            <h2 className="text-[18px] font-bold">FAQs</h2>
            <div className="mt-4">
              <FaqPreviewList faqs={faqs} />
            </div>
          </section>
        )}

        {/* 19. Final CTA — already surfaced via the Hero's HeroLeadCard ("Enquire Now") */}
      </main>

      <TrustSection type="activity" name={activity.name} />
    </div>
  );
}
