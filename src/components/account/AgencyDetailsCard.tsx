"use client";

import { useState } from "react";
import Image from "next/image";
import { Building2, Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AgencyStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

const STATUS_LABELS: Record<AgencyStatus, string> = {
  PENDING: "Pending approval",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

const STATUS_STYLES: Record<AgencyStatus, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  SUSPENDED: "bg-red-500/15 text-red-700 dark:text-red-300",
};

// The only fields an agent can complete themselves — Travel Company, Contact
// Person, Phone, Email, Logo and State are all required at registration/CRM
// creation, so they're never missing; these three are optional and may be
// blank. Keys match the User columns PATCHed by /api/account/b2b/agency.
type EditableKey = "agencyWebsite" | "agencyRegistrationNumber" | "agencyGstin";
const MAX_LEN: Record<EditableKey, number> = {
  agencyWebsite: 200,
  agencyRegistrationNumber: 100,
  agencyGstin: 30,
};

interface Props {
  agencyStatus: AgencyStatus;
  agencyName: string | null;
  agencyLogoUrl: string | null;
  agencyWebsite: string | null;
  agencyRegistrationNumber: string | null;
  agencyGstin: string | null;
  agencyState: string | null;
  contactPerson: string;
  phone: string | null;
  email: string;
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <p className="shrink-0 text-xs font-semibold text-foreground">{label}</p>
      <p className="min-w-0 break-words text-right text-sm text-muted-foreground">
        {value || "—"}
      </p>
    </div>
  );
}

function EditableField({
  label,
  value,
  fieldKey,
  onSaved,
}: {
  label: string;
  value: string | null;
  fieldKey: EditableKey;
  onSaved: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/b2b/agency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldKey]: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      onSaved(trimmed);
      setEditing(false);
      toast.success(`${label} added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  if (!value && editing) {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5">
        <p className="shrink-0 text-xs font-semibold text-foreground">{label}</p>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN[fieldKey]))}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={`Enter ${label.toLowerCase()}`}
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-right text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !draft.trim()}
            aria-label="Save"
            className="shrink-0 text-primary transition hover:opacity-75 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            aria-label="Cancel"
            className="shrink-0 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="flex items-center justify-between gap-3 py-2.5">
        <p className="shrink-0 text-xs font-semibold text-foreground">{label}</p>
        <button
          type="button"
          onClick={() => {
            setDraft("");
            setEditing(true);
          }}
          className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    );
  }

  return <Field label={label} value={value} />;
}

export function AgencyDetailsCard({
  agencyStatus,
  agencyName,
  agencyLogoUrl,
  agencyWebsite,
  agencyRegistrationNumber,
  agencyGstin,
  agencyState,
  contactPerson,
  phone,
  email,
}: Props) {
  const [website, setWebsite] = useState(agencyWebsite);
  const [regNo, setRegNo] = useState(agencyRegistrationNumber);
  const [gstin, setGstin] = useState(agencyGstin);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-bold text-foreground">Agency details</h2>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold",
            STATUS_STYLES[agencyStatus],
          )}
        >
          {STATUS_LABELS[agencyStatus]}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
          {agencyLogoUrl ? (
            <Image
              src={agencyLogoUrl}
              alt={`${agencyName ?? "Agency"} logo`}
              fill
              sizes="64px"
              className="object-contain p-1.5"
              unoptimized
            />
          ) : (
            <Building2
              className="absolute inset-0 m-auto h-8 w-8 text-muted-foreground/50"
              strokeWidth={1.5}
            />
          )}
        </div>
        <p className="min-w-0 truncate text-sm font-bold text-foreground">
          {agencyName || "—"}
        </p>
      </div>

      <div className="mt-4 divide-y divide-border border-t border-border">
        <Field label="Travel Company" value={agencyName} />
        <Field label="Contact Person" value={contactPerson} />
        <Field label="Phone" value={phone} />
        <Field label="Email" value={email} />
        <EditableField
          label="Website"
          value={website}
          fieldKey="agencyWebsite"
          onSaved={setWebsite}
        />
        <EditableField
          label="Reg No"
          value={regNo}
          fieldKey="agencyRegistrationNumber"
          onSaved={setRegNo}
        />
        <EditableField label="GSTIN" value={gstin} fieldKey="agencyGstin" onSaved={setGstin} />
        <Field label="State" value={agencyState} />
      </div>
    </div>
  );
}
