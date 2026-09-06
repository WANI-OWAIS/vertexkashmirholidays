"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Turnstile } from "@marsidev/react-turnstile";
import { ShieldCheck, ArrowRight, Loader2, Check, CheckCircle2, Pencil } from "lucide-react";
import type { CountryCode } from "libphonenumber-js";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { toE164 } from "@/lib/auth/validation";
import { nameField, phoneField } from "@/lib/leads/schema";
import { inputBase } from "@/components/leads/LeadForm";
import { HONEYPOT_FIELD, TIMETRAP_FIELD } from "@/lib/security/formGuard";
import { NEXT_PUBLIC_TURNSTILE_SITE_KEY } from "@/lib/env.public";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { trackB2bRegistrationStarted, trackB2bRegistrationSubmitted } from "@/lib/analytics";
import { LogoUploadField } from "./LogoUploadField";

// Exactly nine fields: Travel Company*, Contact Person*, Phone*, Email*,
// Logo*, Website, Reg No, GSTIN, State*. Email is verified INLINE, the
// moment it's entered (request-otp/verify-otp — email only, see
// src/lib/b2b/schema.ts) — not as a separate step after the rest of the form
// is filled in. The final submit (this schema) additionally requires the
// verificationToken that inline verification issues; no password is ever
// collected — real login credentials are only emailed once staff activates
// the account (see src/app/api/admin/b2b-agents/[id]/route.ts).
const schema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Enter your agency/company name.")
    .max(150, "Name is too long."),
  name: nameField,
  phone: phoneField,
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  logoDataUrl: z.string().min(1, "Upload your company logo."),
  website: z.string().trim().max(200).optional(),
  registrationNumber: z.string().trim().max(100).optional(),
  gstin: z.string().trim().max(30).optional(),
  state: z.string().trim().min(1, "Select or enter a state.").max(100),
  agree: z.boolean().refine((v) => v === true, {
    message: "Please accept the B2B Partner Terms & Confidentiality Policy.",
  }),
});
type FormValues = z.input<typeof schema>;

type EmailStatus = "idle" | "sending" | "sent" | "verifying" | "verified";

export function B2bRegistrationForm() {
  const [submitted, setSubmitted] = useState(false);
  const [country, setCountry] = useState<CountryCode>("IN");
  const [national, setNational] = useState("");

  const siteKey = NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const renderedAt = useRef<number>(Date.now());
  const startedRef = useRef(false);

  // Inline email verification — a small state machine attached to the Email
  // field itself, not a separate screen. "sent"/"verifying" show the code
  // input right there; "verified" locks the email and shows a check mark.
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [otpCode, setOtpCode] = useState("");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), mode: "onChange" });

  const emailValue = watch("email");
  const emailFormatValid = !errors.email && !!emailValue;

  function syncPhone(nextNational: string, nextCountry: CountryCode) {
    setNational(nextNational);
    setCountry(nextCountry);
    const e164 = toE164(nextNational, nextCountry);
    setValue("phone", e164 ?? nextNational, { shouldValidate: true });
  }

  function markStarted() {
    if (startedRef.current) return;
    startedRef.current = true;
    trackB2bRegistrationStarted();
  }

  function resetEmailVerification() {
    setEmailStatus("idle");
    setOtpCode("");
    setVerificationToken(null);
    setResendIn(0);
    setEmailNotice(null);
    setEmailOtpError(null);
  }

  async function handleSendCode() {
    if (!emailFormatValid || emailStatus === "sending") return;
    setEmailOtpError(null);
    setEmailStatus("sending");
    try {
      const res = await fetch("/api/auth/b2b-register/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailValue,
          turnstileToken: captchaToken ?? undefined,
          [HONEYPOT_FIELD]: honeypotRef.current?.value ?? "",
          [TIMETRAP_FIELD]: renderedAt.current,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not send the verification code.");
      setEmailStatus("sent");
      setOtpCode("");
      setResendIn(json.cooldown ?? 60);
      setEmailNotice(`We sent a 6-digit code to ${emailValue}. It expires in 10 minutes.`);
    } catch (err) {
      setEmailStatus("idle");
      setEmailOtpError(err instanceof Error ? err.message : "Could not send the verification code.");
    }
  }

  async function handleVerifyCode() {
    if (otpCode.length !== 6 || emailStatus === "verifying") return;
    setEmailOtpError(null);
    setEmailStatus("verifying");
    try {
      const res = await fetch("/api/auth/b2b-register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailValue, code: otpCode }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.verificationToken) {
        throw new Error(json.error ?? "Verification failed. Please try again.");
      }
      setVerificationToken(json.verificationToken);
      setEmailStatus("verified");
      setEmailNotice(null);
    } catch (err) {
      setEmailStatus("sent");
      setEmailOtpError(err instanceof Error ? err.message : "Verification failed. Please try again.");
    }
  }

  async function handleResendCode() {
    if (resendIn > 0 || emailStatus === "sending") return;
    await handleSendCode();
  }

  const onSubmit = async (data: FormValues) => {
    if (emailStatus !== "verified" || !verificationToken) {
      toast.error("Please verify your email before submitting.");
      return;
    }
    try {
      const res = await fetch("/api/auth/b2b-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          phone: data.phone,
          verificationToken,
          agencyName: data.companyName,
          agencyWebsite: data.website || undefined,
          agencyRegistrationNumber: data.registrationNumber || undefined,
          agencyGstin: data.gstin || undefined,
          agencyState: data.state,
          agencyLogoDataUrl: data.logoDataUrl,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.fieldErrors) {
          for (const key of ["name", "phone", "email", "agencyLogoDataUrl"] as const) {
            const msg = json.fieldErrors[key]?.[0];
            if (msg) setError(key === "agencyLogoDataUrl" ? "logoDataUrl" : key, { type: "server", message: msg });
          }
        }
        throw new Error(json.error ?? "Request failed");
      }
      trackB2bRegistrationSubmitted();
      reset();
      setNational("");
      setCaptchaToken(null);
      startedRef.current = false;
      resetEmailVerification();
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  if (submitted) {
    return (
      <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-8 text-center sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <CheckCircle2 className="h-7 w-7 text-green-600" strokeWidth={2} />
        </div>
        <h3 className="mt-4 text-[19px] font-bold text-foreground">Application submitted</h3>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted-foreground">
          Thank you for applying to become a Vertex Kashmir Holidays B2B partner. Our team is
          reviewing your application and will email your login details to the address you
          provided once it&apos;s approved — typically within 1–2 business days.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-6 text-[13px] font-bold text-primary hover:underline"
        >
          Submit another application
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} onFocusCapture={markStarted} noValidate>
        <input
          ref={honeypotRef}
          type="text"
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        />

        <p className="text-[12px] font-bold uppercase tracking-wide text-primary">
          Partner Details
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="b2bCompany" className="text-[14px] font-semibold">
              Travel Company <span className="text-rose-500">*</span>
            </label>
            <input
              id="b2bCompany"
              className={inputBase + " mt-1.5"}
              placeholder="Your agency name"
              {...register("companyName")}
            />
            {errors.companyName && (
              <p className="mt-1 text-[12px] text-rose-500">{errors.companyName.message}</p>
            )}
          </div>
          <div>
            <label htmlFor="b2bName" className="text-[14px] font-semibold">
              Contact Person <span className="text-rose-500">*</span>
            </label>
            <input
              id="b2bName"
              className={inputBase + " mt-1.5"}
              placeholder="Your name"
              {...register("name")}
            />
            {errors.name && <p className="mt-1 text-[12px] text-rose-500">{errors.name.message}</p>}
          </div>
          <div>
            <label htmlFor="b2bPhone" className="text-[14px] font-semibold">
              Phone <span className="text-rose-500">*</span>
            </label>
            <PhoneInput
              id="b2bPhone"
              country={country}
              onCountryChange={(c) => syncPhone(national, c)}
              value={national}
              onChange={(v) => syncPhone(v, country)}
              invalid={!!errors.phone}
            />
            <input type="hidden" {...register("phone")} />
            {errors.phone && <p className="mt-1 text-[12px] text-rose-500">{errors.phone.message}</p>}
          </div>
          <LogoUploadField
            onChange={(dataUrl) => setValue("logoDataUrl", dataUrl ?? "", { shouldValidate: true })}
            externalError={errors.logoDataUrl?.message}
          />

          {/* Full width: email input + inline verify UI needs the room. */}
          <div className="sm:col-span-2">
            <label htmlFor="b2bEmail" className="text-[14px] font-semibold">
              Email <span className="text-rose-500">*</span>
            </label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="flex-1">
                <input
                  id="b2bEmail"
                  type="email"
                  className={inputBase}
                  disabled={emailStatus === "sent" || emailStatus === "verifying" || emailStatus === "verified"}
                  {...register("email", { onChange: resetEmailVerification })}
                />
                {errors.email && <p className="mt-1 text-[12px] text-rose-500">{errors.email.message}</p>}
              </div>
              {emailStatus === "verified" ? (
                <div className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3.5 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600" strokeWidth={2} />
                  <span className="text-[13px] font-bold text-green-600">Verified</span>
                  <button
                    type="button"
                    onClick={resetEmailVerification}
                    aria-label="Change email"
                    className="text-muted-foreground transition hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : emailStatus === "idle" || emailStatus === "sending" ? (
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={
                    !emailFormatValid || emailStatus === "sending" || (!!siteKey && !captchaToken)
                  }
                  title={!!siteKey && !captchaToken ? "Please complete the verification check below first" : undefined}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-primary px-3.5 py-2.5 text-[13px] font-bold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {emailStatus === "sending" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Send Code
                </button>
              ) : null}
            </div>

            {(emailStatus === "sent" || emailStatus === "verifying") && (
              <div className="mt-3 rounded-xl border border-border bg-muted/50 p-3.5">
                {emailNotice && <p className="mb-2 text-[13px] text-muted-foreground">{emailNotice}</p>}
                {emailOtpError && (
                  <p className="mb-2 text-[13px] font-semibold text-rose-500">{emailOtpError}</p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6-digit code"
                    className={inputBase + " text-center font-semibold tracking-[0.4em] sm:w-40"}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={otpCode.length !== 6 || emailStatus === "verifying"}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2.5 text-[13px] font-bold text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {emailStatus === "verifying" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Verify
                  </button>
                  {resendIn > 0 ? (
                    <span className="text-[12px] font-semibold text-muted-foreground">
                      Resend in {resendIn}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendCode}
                      className="text-[12px] font-bold text-primary hover:underline"
                    >
                      Resend code
                    </button>
                  )}
                </div>
              </div>
            )}
            {emailStatus === "idle" && emailOtpError && (
              <p className="mt-1 text-[12px] text-rose-500">{emailOtpError}</p>
            )}

            {siteKey && isOnline && (
              <div className="mt-3">
                <Turnstile
                  siteKey={siteKey}
                  options={{ size: "flexible", theme: "auto" }}
                  onSuccess={(t) => setCaptchaToken(t)}
                  onError={() => setCaptchaToken(null)}
                  onExpire={() => setCaptchaToken(null)}
                />
              </div>
            )}
            {siteKey && !isOnline && (
              <p className="mt-3 text-[12px] text-muted-foreground">
                Waiting for a connection to load verification…
              </p>
            )}
          </div>

          <div>
            <label htmlFor="b2bWebsite" className="text-[14px] font-semibold">
              Website
            </label>
            <input
              id="b2bWebsite"
              className={inputBase + " mt-1.5"}
              placeholder="https://"
              {...register("website")}
            />
          </div>
          <div>
            <label htmlFor="b2bRegNo" className="text-[14px] font-semibold">
              Reg No
            </label>
            <input id="b2bRegNo" className={inputBase + " mt-1.5"} {...register("registrationNumber")} />
          </div>
          <div>
            <label htmlFor="b2bGstin" className="text-[14px] font-semibold">
              GSTIN
            </label>
            <input id="b2bGstin" className={inputBase + " mt-1.5"} {...register("gstin")} />
          </div>
          <div>
            <label htmlFor="b2bState" className="text-[14px] font-semibold">
              State <span className="text-rose-500">*</span>
            </label>
            <input id="b2bState" className={inputBase + " mt-1.5"} {...register("state")} />
            {errors.state && <p className="mt-1 text-[12px] text-rose-500">{errors.state.message}</p>}
          </div>
        </div>

        <div className="!mt-6 rounded-xl bg-muted p-4">
          <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-muted-foreground">
            <input
              type="checkbox"
              className="cbx mt-0.5 shrink-0"
              {...register("agree", { onChange: () => trigger("agree") })}
            />
            <span>
              I agree to the Vertex{" "}
              <Link
                href="/terms-and-conditions"
                target="_blank"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                B2B Partner Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link
                href="#b2b-confidentiality"
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Confidentiality / Acceptable Use Policy
              </Link>
              .
            </span>
          </label>
          {errors.agree && <p className="mt-1 text-[12px] text-rose-500">{errors.agree.message}</p>}
          <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} />
            Access to B2B rates, quotations and partner resources is subject to partner approval —
            we&apos;ll email your login details once your application is approved.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || emailStatus !== "verified"}
          title={emailStatus !== "verified" ? "Verify your email first" : undefined}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3.5 text-[15px] font-bold text-primary-foreground shadow-card transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-8"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Submitting…
            </>
          ) : (
            <>
              Submit B2B Application
              <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
