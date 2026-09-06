import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ProposalEditor } from "@/components/admin/proposal/ProposalEditor";
import { DEFAULT_PROPOSAL_DATA } from "@/components/admin/proposal/default-data";
import { resolvePrimaryOffice } from "@/lib/companyOffice";
import { getPdfTrustContent } from "@/lib/itinerary/pdfTrustContent";
import { proposalDataSchema } from "@/types/proposal";

export const metadata: Metadata = { title: "Edit Proposal — Admin" };
export const dynamic = "force-dynamic";

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const role = session?.user?.role;
  if (!role || !(await can(role, "proposals", "view"))) {
    redirect("/admin/proposals");
  }

  const record = await prisma.proposalItinerary.findUnique({ where: { id } });
  if (!record) notFound();

  const isAdmin = role === "SUPERADMIN" || role === "ADMIN";
  const canEditModule = await can(role, "proposals", "edit");
  const canSave = canEditModule && (isAdmin || record.ownerId === session!.user.id);

  const parsed = proposalDataSchema.safeParse(record.data);
  const data = parsed.success ? parsed.data : DEFAULT_PROPOSAL_DATA;

  const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  const { address: companyAddress } = await resolvePrimaryOffice(settings);
  const trustContent = await getPdfTrustContent();

  return (
    <ProposalEditor
      id={record.id}
      initialData={data}
      initialTitle={record.title}
      initialStatus={record.status}
      canSave={canSave}
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
