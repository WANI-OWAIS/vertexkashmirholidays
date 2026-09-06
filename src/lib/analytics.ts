// Analytics utility — all tracking must flow: site → dataLayer → GTM → GA4.
// Never call gtag() directly; always push structured events to dataLayer so GTM
// remains the single source of truth for tag configuration.
//
// All functions guard against SSR (window check) and log in dev mode.

import type { AnalyticsEvent, LeadType, WhatsAppSource } from "@/types/analytics";
import { isInternalRoute } from "@/lib/internalRoutes";

function push(payload: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  // Defense-in-depth: GTM never loads on internal routes (see src/proxy.ts and
  // src/app/layout.tsx), so this dataLayer push would be a no-op anyway. This
  // guard just makes that explicit at the single choke point every track*
  // function flows through, in case a future admin component ever calls one.
  if (isInternalRoute(window.location.pathname)) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[Analytics] suppressed on internal route", payload);
    }
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload as unknown as Record<string, unknown>);
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[Analytics]", payload);
  }
}

/**
 * Fire after a lead form submits successfully — never on validation errors.
 * `leadId` (the just-created Lead's own database id, returned by POST
 * /api/leads) rides along as `lead_id` so GTM's Facebook Pixel Lead tag can
 * map it to Meta's "Event ID" field for CAPI dedup — see the field comment on
 * `AnalyticsEvent`'s `lead_submit` variant.
 */
export function trackLeadSubmit(
  leadType: LeadType = "itinerary",
  tourName?: string,
  leadId?: string,
): void {
  push({
    event: "lead_submit",
    lead_type: leadType,
    ...(tourName ? { package_name: tourName } : {}),
    ...(leadId ? { lead_id: leadId } : {}),
  });
}

/** Fire when any WhatsApp CTA is clicked. */
export function trackWhatsappClick(source: WhatsAppSource): void {
  push({ event: "whatsapp_click", source });
}

/** Fire when a tel: link is clicked. */
export function trackPhoneClick(): void {
  push({ event: "phone_click" });
}

/** Fire when a mailto: link is clicked. */
export function trackEmailClick(): void {
  push({ event: "email_click" });
}

/** Fire when a tour/package detail page loads. */
export function trackPackageView(packageName: string): void {
  push({ event: "package_view", package_name: packageName });
}

/** Fire when a user opens an inquiry modal / form tab. */
export function trackTourInquiry(tourName?: string, tourId?: string): void {
  push({
    event: "inquiry_started",
    ...(tourName ? { package_name: tourName } : {}),
    ...(tourId ? { tour_id: tourId } : {}),
  });
}

/** Fire when the "Get a Flight/Train Quote" CTA is clicked (opens the quote form). */
export function trackFlightTrainQuoteClick(placement: string, tourName?: string): void {
  push({
    event: "flight_train_quote_click",
    placement,
    ...(tourName ? { package_name: tourName } : {}),
  });
}

/** Fire when a user initiates the booking checkout flow. */
export function trackBookingStarted(packageName?: string): void {
  push({ event: "booking_started", ...(packageName ? { package_name: packageName } : {}) });
}

/** Fire once on the booking success page after payment is confirmed. */
export function trackBookingCompleted(bookingId: string, value: number, packageName: string): void {
  push({
    event: "booking_completed",
    booking_id: bookingId,
    value,
    currency: "INR",
    package_name: packageName,
    items: [{ item_name: packageName, price: value, quantity: 1 }],
  });
}

/** Fire once, on the first field interaction with the B2B registration form. */
export function trackB2bRegistrationStarted(): void {
  push({ event: "b2b_registration_started" });
}

/** Fire once the B2B agent's account is created (OTP verified, agencyStatus PENDING). */
export function trackB2bRegistrationSubmitted(): void {
  push({ event: "b2b_registration_submitted" });
}

/** Fire when the careers listing page loads. */
export function trackCareersViewed(): void {
  push({ event: "careers_viewed" });
}

/** Fire when a job detail page loads. */
export function trackJobViewed(jobTitle: string, jobId: string): void {
  push({ event: "job_viewed", job_title: jobTitle, job_id: jobId });
}

/** Fire once, on the first field interaction with a job's apply form. */
export function trackApplyStarted(jobTitle: string, jobId: string): void {
  push({ event: "apply_started", job_title: jobTitle, job_id: jobId });
}

/** Fire when an apply-form OTP request succeeds. */
export function trackOtpRequested(jobId: string): void {
  push({ event: "otp_requested", job_id: jobId });
}

/** Fire when an apply-form OTP verification succeeds. */
export function trackOtpVerified(jobId: string): void {
  push({ event: "otp_verified", job_id: jobId });
}

/** Fire once a job application is fully submitted (resume + details sent). */
export function trackApplicationSubmitted(jobTitle: string, jobId: string): void {
  push({ event: "application_submitted", job_title: jobTitle, job_id: jobId });
}
