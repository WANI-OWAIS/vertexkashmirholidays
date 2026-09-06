"use client";

// @react-pdf/renderer and the ItineraryPdf document tree are imported
// dynamically inside downloadItineraryPdf (below) rather than at module top, so
// the heavy PDF renderer only loads when the user actually exports — keeping it
// out of the itinerary editor's initial JS bundle.
import { compressMany } from "@/lib/itinerary/compress-image";
import type { ItineraryData } from "@/types/itinerary";
import type { PdfTrustContent } from "@/lib/itinerary/pdfTrustContent";
import type { PdfSocialLinks } from "@/lib/pdf/contact";
import type { B2bAgentInfo } from "@/components/admin/itinerary/B2bItineraryPdf";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "itinerary"
  );
}

/**
 * Fetch a static asset and return it as a data URL. Used for the brand logo so
 * it embeds losslessly (preserving PNG transparency) rather than going through
 * the JPEG compression path used for photos.
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

export interface TokenPaymentLink {
  /** Razorpay Payment Link short URL — the only thing encoded in the QR. */
  shortUrl: string;
  amountRupees: number;
}

/**
 * Compress every referenced image, render the PDF to a Blob, and trigger a
 * browser download. Returns the byte size so callers can warn if it approaches
 * the 1 MB budget.
 *
 * `tokenPaymentLink`: the caller resolves this itself first (POST
 * /api/itineraries/[id]/token-payment-link for staff, GET
 * /api/account/bookings/[id]/token-payment-link for a customer) — this
 * function only turns the resulting URL into a QR. Omitted when no itinerary
 * id is available yet (e.g. an unsaved draft) or the resolve call failed; the
 * PDF's QR card is simply hidden in that case (see ItineraryPdf.tsx), never
 * filled with a static/generic fallback QR.
 *
 * `trustContent`: the real review-rating + Why Choose Vertex copy — also
 * resolved by the caller (see src/lib/itinerary/pdfTrustContent.ts) since
 * this function has no server/DB access. Omitted sections just don't render.
 */
export async function downloadItineraryPdf(
  data: ItineraryData,
  address?: string,
  tokenPaymentLink?: TokenPaymentLink,
  trustContent?: PdfTrustContent,
  socialLinks?: PdfSocialLinks,
): Promise<ExportResult> {
  // Lazily pull in the PDF renderer and the document template only on export.
  const [{ pdf }, { ItineraryPdf, LOGO_ASSETS }, QRCode] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/admin/itinerary/ItineraryPdf"),
    tokenPaymentLink ? import("qrcode").then((m) => m.default) : Promise.resolve(null),
  ]);

  const tokenQrDataUrl = tokenPaymentLink
    ? await QRCode!.toDataURL(tokenPaymentLink.shortUrl)
    : undefined;

  const srcs = [
    data.coverImage,
    data.transportImage,
    ...data.days.map((d) => d.image),
    ...data.hotels.map((h) => h.image),
    ...data.hotelImages,
    ...data.activities.map((a) => a.image),
  ].filter(Boolean);

  // The cover wants a larger, fuller-bleed image; day thumbnails stay tiny.
  // Brand assets (icon watermark, horizontal lockups, payment-partner strip)
  // embed losslessly via data URLs so PNG transparency survives.
  const [coverImages, smallImages, logos] = await Promise.all([
    compressMany([data.coverImage].filter(Boolean), {
      maxWidth: 900,
      maxHeight: 1300,
      quality: 0.6,
    }),
    compressMany(
      srcs.filter((s) => s !== data.coverImage),
      { maxWidth: 640, maxHeight: 480, quality: 0.7 },
    ),
    Promise.all(
      LOGO_ASSETS.map((src) =>
        fetchAsDataUrl(src).catch((err) => {
          // Silent-drop fallback stays (one missing brand asset shouldn't
          // abort the whole export), but log so this doesn't go unnoticed
          // the way the payment-partner strip did before.
          console.warn(
            `[itinerary-pdf] Failed to embed brand asset "${src}" — it will be omitted from the PDF.`,
            err,
          );
          return "";
        }),
      ),
    ),
  ]);
  const logoMap: Record<string, string> = {};
  LOGO_ASSETS.forEach((src, i) => {
    if (logos[i]) logoMap[src] = logos[i];
  });
  const images = { ...smallImages, ...coverImages, ...logoMap };

  const blob = await pdf(
    <ItineraryPdf
      data={data}
      images={images}
      address={address}
      tokenQrDataUrl={tokenQrDataUrl}
      tokenAmountRupees={tokenPaymentLink?.amountRupees}
      trustContent={trustContent}
      socialLinks={socialLinks}
    />,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vertex-itinerary-${slugify(data.preparedFor)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { bytes: blob.size };
}

/**
 * B2B equivalent of downloadItineraryPdf — same data structure, same
 * lazy-load-the-renderer-only-on-export pattern, but the dedicated
 * quotation-style template (B2bItineraryPdf.tsx) instead of the photo-heavy
 * customer document. Branded for the agent (see B2bItineraryPdf.tsx) — full
 * white-label once the agency has earned it (see WHITE_LABEL_MIN_BOOKINGS,
 * resolved by the caller — this function has no DB access), otherwise
 * co-branded with a small Vertex icon fetched here only in that case.
 */
export async function downloadB2bItineraryPdf(
  data: ItineraryData,
  status: "DRAFT" | "SENT" | "CONFIRMED",
  itineraryId: string,
  agent?: B2bAgentInfo | null,
  whiteLabel = true,
): Promise<ExportResult> {
  // Display-only fields derived at export time — neither is a separately
  // stored column (Phase 4 is presentation-only, see B2bItineraryPdf.tsx).
  // "Issued" is the moment this PDF is generated, which is also the most
  // accurate reading of that label — not the itinerary row's last save time.
  const quoteRef = `B2B-${itineraryId.slice(-8).toUpperCase()}`;
  const issuedAt = new Date();
  const [{ pdf }, { B2bItineraryPdf }, { LOGO_SRC }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/admin/itinerary/B2bItineraryPdf"),
    import("@/components/admin/itinerary/ItineraryPdf"),
  ]);
  const vertexIcon = whiteLabel ? undefined : await fetchAsDataUrl(LOGO_SRC).catch(() => undefined);

  const blob = await pdf(
    <B2bItineraryPdf
      data={data}
      status={status}
      quoteRef={quoteRef}
      updatedAt={issuedAt}
      agent={agent}
      whiteLabel={whiteLabel}
      vertexIcon={vertexIcon}
    />,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // No "vertex" in the filename either — an agent forwarding this file to
  // their own customer would otherwise leak the underlying provider even
  // though the document content itself is fully white-labeled.
  a.download = `travel-quotation-${slugify(data.preparedFor)}-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { bytes: blob.size };
}
