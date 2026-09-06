import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { b2bLeadWhere } from "@/lib/b2b/leadScope";
import { B2bRequestForm } from "@/components/account/B2bRequestForm";

export const metadata: Metadata = { title: "Edit Request" };
export const dynamic = "force-dynamic";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Agent self-edit of their own request — no delete, editing only. Blocked
 * once the request is `locked` (set true at conversion — see PATCH
 * /api/account/b2b/requests/[id], which enforces the same rule server-side).
 */
export default async function EditB2bRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.agencyStatus === null) {
    redirect("/account");
  }

  const { id } = await params;
  const request = await prisma.lead.findFirst({
    where: { id, ...b2bLeadWhere(session.user.id) },
    select: {
      id: true,
      name: true,
      phone: true,
      adults: true,
      children: true,
      days: true,
      rooms: true,
      budget: true,
      startDate: true,
      endDate: true,
      notes: true,
      locked: true,
    },
  });
  if (!request) notFound();

  return (
    <div className="space-y-5">
      <Link
        href={`/account/requests/${id}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to request
      </Link>
      <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">Edit Request</h1>

      {request.locked ? (
        <div className="max-w-2xl rounded-2xl border border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          This request is locked and can no longer be edited.
        </div>
      ) : (
        <B2bRequestForm
          mode="edit"
          requestId={request.id}
          initial={{
            guestName: request.name,
            guestPhone: request.phone,
            days: request.days ? String(request.days) : "",
            pax: String(request.adults),
            children: request.children ? String(request.children) : "",
            rooms: request.rooms ? String(request.rooms) : "",
            budget: request.budget ? String(request.budget) : "",
            startDate: toDateInput(request.startDate),
            endDate: toDateInput(request.endDate),
            notes: request.notes ?? "",
          }}
        />
      )}
    </div>
  );
}
