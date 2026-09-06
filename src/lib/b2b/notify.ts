// B2B agent lifecycle notifications. Kept separate from
// src/lib/bookings/notify.tsx (scoped to booking notifications specifically)
// — this is an account-lifecycle email, not a booking one.
import { sendMail, b2bAgentActivationHtml, b2bAgentActivationText } from "@/lib/mail";

/**
 * Sent exactly once per activation event — whenever a B2B agent's
 * agencyStatus transitions to ACTIVE (see PATCH /api/admin/b2b-agents/[id]).
 * Best-effort: never throws, matching every other transactional-email helper
 * in this codebase (a mail failure must never fail the underlying action).
 */
export async function sendB2bAgentActivationEmail(
  email: string,
  contactName: string,
  agencyName: string,
  tempPassword: string,
): Promise<{ delivered: boolean }> {
  try {
    const res = await sendMail({
      to: email,
      subject: "Your Vertex Kashmir Holidays B2B Partner account is active",
      html: b2bAgentActivationHtml({ contactName, agencyName, email, tempPassword }),
      text: b2bAgentActivationText({ contactName, agencyName, email, tempPassword }),
    });
    return { delivered: res.delivered };
  } catch (err) {
    console.error("[b2b/notify] agent activation email failed", err);
    return { delivered: false };
  }
}
