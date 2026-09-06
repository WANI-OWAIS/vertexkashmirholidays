import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { B2bItineraryEditor } from "@/components/admin/itinerary/B2bItineraryEditor";
import { itineraryDataSchema, type ItineraryData } from "@/types/itinerary";
import { DEFAULT_ITINERARY_DATA } from "@/components/admin/itinerary/default-data";
import { getPdfTrustContent, toItineraryWhyChoose } from "@/lib/itinerary/pdfTrustContent";
import { isB2bAgentWhiteLabelEligible } from "@/lib/b2b/whiteLabelEligibility";

export const metadata: Metadata = { title: "Edit B2B Itinerary — Admin" };
export const dynamic = "force-dynamic";

// Deliberately its own page (not /admin/itinerary/[id]) — that page's access
// resolution is assignee-gated (see resolveItineraryAccess), which B2B
// requests have no concept of. Any staff with itinerary permission may edit
// any B2B itinerary — see .../api/admin/b2b-itineraries/[id].
export default async function EditB2bItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !(await can(role, "itinerary", "view"))) {
    redirect("/admin/b2b-requests");
  }

  const { id } = await params;
  const record = await prisma.itinerary.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          b2bAgentId: true,
          b2bAgent: { select: { agencyName: true, agencyLogoUrl: true, phone: true, email: true } },
        },
      },
    },
  });
  if (!record || record.lead?.b2bAgentId == null) notFound();

  const parsed = itineraryDataSchema.safeParse(record.data);
  let data: ItineraryData = parsed.success ? parsed.data : DEFAULT_ITINERARY_DATA;

  const canSave = await can(role, "itinerary", "edit");

  // Same backfill as the normal itinerary editor page — itineraries saved
  // before this field existed parse as `[]`. (No activities backfill here —
  // B2bItineraryPdf never renders activities, so the B2B editor doesn't
  // surface them either; see B2bItineraryEditor.tsx.)
  const trustContent = await getPdfTrustContent();
  if (data.whyChoose.length === 0 && trustContent.whyChoose.length > 0) {
    data = { ...data, whyChoose: toItineraryWhyChoose(trustContent.whyChoose) };
  }

  const whiteLabel = await isB2bAgentWhiteLabelEligible(record.lead.b2bAgentId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <Link
          href={`/admin/b2b-requests/${record.lead.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to B2B request: {record.lead.name}
        </Link>
      </div>
      <B2bItineraryEditor
        id={record.id}
        initialData={data}
        initialTitle={record.title}
        initialStatus={record.status}
        canSave={canSave}
        apiBasePath="/api/admin/b2b-itineraries"
        agent={record.lead.b2bAgent}
        whiteLabel={whiteLabel}
      />
    </div>
  );
}
