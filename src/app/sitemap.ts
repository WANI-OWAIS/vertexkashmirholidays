import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";
import { TOUR_CATEGORY_META } from "@/lib/tours/categories";
import { ORIGIN_CITIES } from "@/lib/originCities";

// Regenerated from Postgres at most once an hour (ISR-style) instead of on
// every crawl — search engines don't need sub-hour freshness here, and the
// previous force-dynamic setting meant every hit re-ran all 7 queries below.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [tours, destinations, blogs, campaigns, activities, jobs, tourCategoryRows] =
    await Promise.all([
      prisma.tour.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      // Destinations have no published/draft concept — the model has no
      // `published` field and the public /destinations listing shows every row.
      // So there is intentionally no `where` filter here, unlike tours/blogs/etc.
      prisma.destination.findMany({
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.blog.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.campaign.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.activity.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.job.findMany({
        where: { published: true },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.tour.groupBy({
        by: ["category"],
        where: { published: true },
        _count: true,
        _max: { updatedAt: true },
      }),
    ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${SITE_URL}/tours`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    {
      url: `${SITE_URL}/tours/category`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/adventures`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/destinations`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    { url: `${SITE_URL}/blog`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    {
      url: `${SITE_URL}/careers`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/reviews`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/b2b-travel-partner-program`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    { url: `${SITE_URL}/faq`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    {
      url: `${SITE_URL}/terms-and-conditions`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy-policy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/refund-and-cancellation`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const tourRoutes: MetadataRoute.Sitemap = tours.map((t) => ({
    url: `${SITE_URL}/tours/${t.slug}`,
    lastModified: t.updatedAt,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const destinationRoutes: MetadataRoute.Sitemap = destinations.map((d) => ({
    url: `${SITE_URL}/destinations/${d.slug}`,
    lastModified: d.updatedAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const blogRoutes: MetadataRoute.Sitemap = blogs.map((b) => ({
    url: `${SITE_URL}/blog/${b.slug}`,
    lastModified: b.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const campaignRoutes: MetadataRoute.Sitemap = campaigns.map((c) => ({
    url: `${SITE_URL}/adventures/${c.slug}`,
    lastModified: c.updatedAt,
    changeFrequency: "weekly",
    priority: 0.85,
  }));

  const activityRoutes: MetadataRoute.Sitemap = activities.map((a) => ({
    url: `${SITE_URL}/activities/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const careerRoutes: MetadataRoute.Sitemap = jobs.map((j) => ({
    url: `${SITE_URL}/careers/${j.slug}`,
    lastModified: j.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const tourCategoryRoutes: MetadataRoute.Sitemap = tourCategoryRows
    .filter((c) => c._count > 0)
    .map((c) => ({
      url: `${SITE_URL}/tours/category/${TOUR_CATEGORY_META[c.category].slug}`,
      lastModified: c._max.updatedAt ?? new Date(),
      changeFrequency: "weekly",
      priority: 0.75,
    }));

  // Origin-city SEO landing pages — static config (no DB-backed origin-city
  // field exists), so no query needed, unlike the route families above.
  const originCityRoutes: MetadataRoute.Sitemap = ORIGIN_CITIES.map((c) => ({
    url: `${SITE_URL}/tours/kashmir-tour-packages-from/${c.slug}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.75,
  }));

  return [
    ...staticRoutes,
    ...tourRoutes,
    ...tourCategoryRoutes,
    ...originCityRoutes,
    ...campaignRoutes,
    ...destinationRoutes,
    ...activityRoutes,
    ...blogRoutes,
    ...careerRoutes,
  ];
}
