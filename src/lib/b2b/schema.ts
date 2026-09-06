// Shared B2B agent validation — used by the public registration routes
// (src/app/api/auth/b2b-register/{request-otp,verify-otp,route}) and the CRM
// manual-creation route (src/app/api/admin/b2b-agents). Deliberately does NOT
// reuse isAllowedEmailDomain/isAllowedCustomerEmailDomain
// (src/lib/auth/validation.ts) — those enforce a small public-provider
// allowlist built for individual customers signing up with a personal
// Gmail/Outlook/etc. address. A B2B agent registers with their own agency's
// business domain (e.g. contact@abctravels.com), which that allowlist would
// wrongly reject.
//
// Exactly nine fields, both sides: Travel Company*, Contact Person*, Phone*,
// Email*, Logo*, Website, Reg No, GSTIN, State*. No password is collected at
// registration — the account is created PENDING with an unusable
// system-generated password; real login credentials are only ever emailed
// when staff activates the agent (see sendB2bAgentActivationEmail), the same
// "temp password, must change on first login" flow already used for
// staff-created customer accounts.
//
// Public registration verifies email INLINE, inside the form, the moment the
// agent types it in — not as a separate step after the whole form is filled.
// This is the same "verify now, prove it later" pattern already used by the
// Careers apply form (src/app/api/careers/apply/{request-otp,verify-otp}):
// request-otp/verify-otp only ever handle the email address itself and issue
// a one-time verificationToken; the real application (all nine fields) is
// submitted separately to POST /api/auth/b2b-register, which re-checks that
// token rather than trusting a client-side "verified" flag.
import { z } from "zod";
import { nameField, phoneField } from "@/lib/leads/schema";

export const agencyNameField = z
  .string()
  .trim()
  .min(2, "Enter your agency/company name.")
  .max(150, "Name is too long.");

export const agencyStateField = z.string().trim().min(1, "Select or enter a state.").max(100);

export const agencyFieldsSchema = z.object({
  agencyName: agencyNameField,
  agencyState: agencyStateField,
  agencyWebsite: z.string().trim().max(200).optional(),
  agencyRegistrationNumber: z.string().trim().max(100).optional(),
  agencyGstin: z.string().trim().max(30).optional(),
  // PNG-only, ~500KB-capped data URI — small enough to ride along as JSON, no
  // upload endpoint needed. Required (see parseAgencyLogo below for the
  // server-side re-validation that actually enforces format/size — size only,
  // no pixel-dimension check).
  agencyLogoDataUrl: z.string().min(1, "Upload your company logo.").max(690_000),
});

export type AgencyFields = z.infer<typeof agencyFieldsSchema>;

// Inline email-verification step 1 — email only, nothing else about the
// application exists yet.
export const b2bEmailOtpRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  turnstileToken: z.string().optional(),
});

// Inline email-verification step 2 — verifies the code and (server-side)
// issues the proof token; no other application fields are involved.
export const b2bEmailOtpVerifySchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

// Final application submit — the full nine fields plus the verificationToken
// proving this email was already confirmed. The account is created here.
export const b2bRegisterSchema = z
  .object({
    name: nameField,
    email: z.string().trim().toLowerCase().email("Please enter a valid email address."),
    phone: phoneField,
    verificationToken: z.string().min(1, "Please verify your email first."),
  })
  .merge(agencyFieldsSchema);

// Server-side re-validation of the logo — never trust the client's PNG/size
// check alone. Format + size only (no pixel-dimension check); returns
// undefined for anything that isn't a small PNG data URI, so the caller can
// reject the request with a clear error (the logo is mandatory).
const MAX_LOGO_BASE64_CHARS = 683_000; // ~500KB decoded, plus base64 overhead
export function parseAgencyLogo(dataUrl: string | undefined): string | undefined {
  if (!dataUrl?.startsWith("data:image/png;base64,")) return undefined;
  const base64 = dataUrl.slice("data:image/png;base64,".length);
  if (!base64 || base64.length > MAX_LOGO_BASE64_CHARS) return undefined;
  return dataUrl;
}
