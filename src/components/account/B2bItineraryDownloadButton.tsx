"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { itineraryDataSchema } from "@/types/itinerary";

interface Props {
  requestId: string;
}

/**
 * Agent download of their own B2B request's latest itinerary — same shape as
 * ItineraryDownloadButton.tsx (the normal customer equivalent), but reads
 * from the B2B request endpoint and renders the dedicated B2B PDF template
 * (Phase 4). Read-only: this component only ever fetches, never writes —
 * agents have no itinerary-editing capability, consistent with Phase 1/2's
 * PENDING/SUSPENDED-gets-no-extra-capability rule (this page is only ever
 * reached by an authenticated B2B agent viewing their own request).
 */
export function B2bItineraryDownloadButton({ requestId }: Props) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/account/b2b/requests/${requestId}/itinerary`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not load your itinerary.");

      const data = itineraryDataSchema.parse(json.data);

      // Loaded on demand — keeps the heavy PDF renderer out of the account
      // bundle until an agent actually downloads.
      const { downloadB2bItineraryPdf } = await import("@/lib/itinerary/export-pdf");
      await downloadB2bItineraryPdf(data, json.status, json.id, json.agent, json.whiteLabel);
      toast.success("Itinerary downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {downloading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      Download Itinerary (PDF)
    </button>
  );
}
