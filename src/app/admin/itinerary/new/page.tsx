import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ItineraryEditor } from "@/components/admin/itinerary/ItineraryEditor";
import { DEFAULT_ITINERARY_DATA } from "@/components/admin/itinerary/default-data";
import { resolvePrimaryOffice } from "@/lib/companyOffice";
import { getPdfTrustContent } from "@/lib/itinerary/pdfTrustContent";

export const metadata: Metadata = { title: "New Itinerary — Admin" };
export const dynamic = "force-dynamic";

export default async function NewItineraryPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !(await can(role, "itinerary", "create"))) {
    redirect("/admin/itinerary");
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  const { address: companyAddress } = await resolvePrimaryOffice(settings);
  const trustContent = await getPdfTrustContent();

  // Seed the cover's "Prepared By" byline with the creating staff member's own
  // contact details — still freely editable in the editor afterwards.
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: { name: true, phone: true },
  });
  const initialData = {
    ...DEFAULT_ITINERARY_DATA,
    preparedByName: currentUser?.name ?? "",
    preparedByPhone: currentUser?.phone ?? "",
  };

  return (
    <ItineraryEditor
      initialData={initialData}
      initialTitle="Kashmir Escape Itinerary"
      initialStatus="DRAFT"
      canSave
      companyAddress={companyAddress}
      trustContent={trustContent}
      socialLinks={{
        instagram: settings?.instagram,
        facebook: settings?.facebook,
        youtube: settings?.youtube,
      }}
    />
  );
}
