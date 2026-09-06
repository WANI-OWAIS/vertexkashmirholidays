import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ProposalEditor } from "@/components/admin/proposal/ProposalEditor";
import { DEFAULT_PROPOSAL_DATA } from "@/components/admin/proposal/default-data";
import { resolvePrimaryOffice } from "@/lib/companyOffice";
import { getPdfTrustContent } from "@/lib/itinerary/pdfTrustContent";

export const metadata: Metadata = { title: "New Proposal — Admin" };
export const dynamic = "force-dynamic";

export default async function NewProposalPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !(await can(role, "proposals", "create"))) {
    redirect("/admin/proposals");
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  const { address: companyAddress } = await resolvePrimaryOffice(settings);
  const trustContent = await getPdfTrustContent();

  // Seed the cover's "Prepared By" byline with the creating staff member's own
  // contact details — still freely editable in the editor afterwards, same
  // convention as src/app/admin/itinerary/new/page.tsx.
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: { name: true, phone: true },
  });
  const initialData = {
    ...DEFAULT_PROPOSAL_DATA,
    preparedByName: currentUser?.name ?? "",
    preparedByPhone: currentUser?.phone ?? "",
  };

  return (
    <ProposalEditor
      initialData={initialData}
      initialTitle="Kashmir Proposal"
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
