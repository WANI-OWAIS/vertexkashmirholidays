import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

// Regenerated from Postgres at most once an hour (ISR-style) instead of on
// every request — RSS readers poll infrequently, and the previous
// force-dynamic setting meant every hit re-queried the blog table.
export const revalidate = 3600;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await prisma.blog.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" },
    take: 50,
    select: { title: true, slug: true, excerpt: true, publishedAt: true, updatedAt: true },
  });

  const items = posts
    .map((p) => {
      const link = `${SITE_URL}/blog/${p.slug}`;
      const pubDate = (p.publishedAt ?? p.updatedAt).toUTCString();
      return `
    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${escapeXml(p.excerpt ?? "")}</description>
      <pubDate>${pubDate}</pubDate>
    </item>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(SITE_NAME)} Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Kashmir travel guides and tips from ${escapeXml(SITE_NAME)}.</description>
    <language>en-in</language>${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
