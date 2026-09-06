"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";

interface Props {
  leadId: string;
}

/** Creates the single itinerary for a B2B request, then opens it for editing in a new tab. */
export function CreateB2bItineraryButton({ leadId }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/b2b-requests/${leadId}/itinerary`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create the itinerary.");
      window.open(`/admin/b2b-itineraries/${data.id}`, "_blank");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the itinerary.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <button
      onClick={handleCreate}
      disabled={creating}
      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      Generate Itinerary
    </button>
  );
}
