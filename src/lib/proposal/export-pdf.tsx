"use client";

// @react-pdf/renderer and the ProposalPdf document tree are imported
// dynamically inside downloadProposalPdf (below), same as
// src/lib/itinerary/export-pdf.tsx, so the heavy PDF renderer only loads when
// the user actually exports.
import type { ProposalData } from "@/types/proposal";
import type { PdfTrustContent } from "@/lib/itinerary/pdfTrustContent";
import type { PdfSocialLinks } from "@/lib/pdf/contact";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "proposal"
  );
}

/**
 * Fetch a static asset and return it as a data URL — same technique as
 * src/lib/itinerary/export-pdf.tsx's own helper (copied, not imported, to
 * keep this module independent of the itinerary export pipeline).
 */
async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export interface ExportResult {
  bytes: number;
}

/**
 * Render the PDF to a Blob and trigger a browser download. No image
 * compression step here (unlike downloadItineraryPdf) — the proposal document
 * has no photo fields anywhere, see src/types/proposal.ts.
 *
 * `trustContent`: the real review-rating + Why Choose Vertex copy, resolved by
 * the caller (this function has no server/DB access) — same as the itinerary
 * export. Omitted sections just don't render.
 *
 * `socialLinks`: real Instagram/Facebook/YouTube profile URLs (SiteSettings),
 * also resolved by the caller — makes the footer/closing social icons
 * clickable. Missing fields just render as a non-clickable icon.
 */
export async function downloadProposalPdf(
  data: ProposalData,
  address?: string,
  trustContent?: PdfTrustContent,
  socialLinks?: PdfSocialLinks,
): Promise<ExportResult> {
  const [{ pdf }, { ProposalPdf, LOGO_ASSETS }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/admin/proposal/ProposalPdf"),
  ]);

  // Only the brand icon mark needs embedding (used for the watermarks + the
  // closing logo) — no per-tier/per-day photos exist in this schema.
  const logos = await Promise.all(
    LOGO_ASSETS.map((src) =>
      fetchAsDataUrl(src).catch((err) => {
        console.warn(`[proposal-pdf] Failed to embed brand asset "${src}" — it will be omitted.`, err);
        return "";
      }),
    ),
  );
  const images: Record<string, string> = {};
  LOGO_ASSETS.forEach((src, i) => {
    if (logos[i]) images[src] = logos[i];
  });

  const blob = await pdf(
    <ProposalPdf
      data={data}
      images={images}
      address={address}
      trustContent={trustContent}
      socialLinks={socialLinks}
    />,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vertex-proposal-${slugify(data.preparedFor)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { bytes: blob.size };
}
