// B2B request (Lead with b2bAgentId set) validation — shared by the agent
// self-service creation route (src/app/api/account/b2b/requests) and the CRM
// create-on-behalf route (src/app/api/admin/b2b-requests). See .ai B2B
// architecture report, Phase 2: b2bAgentId != null is the sole discriminator,
// no separate B2B lead table/type field.
import { z } from "zod";
import { nameField, phoneField } from "@/lib/leads/schema";

// Guest/traveller details + the approved B2B request fields (days, rooms,
// budget). Lead.name/phone are NOT NULL columns shared with normal leads, so
// a guest name + guest contact number are required here too, exactly as any
// other lead-creation path already requires — not a B2B-specific field.
export const b2bRequestFieldsSchema = z.object({
  guestName: nameField,
  guestPhone: phoneField,
  days: z.coerce.number().int().positive().max(60).optional(),
  pax: z.coerce.number().int().positive().max(50).optional(),
  children: z.coerce.number().int().min(0).max(20).optional(),
  rooms: z.coerce.number().int().positive().max(20).optional(),
  budget: z.coerce.number().min(20000, "Minimum budget is ₹20,000.").optional(),
  startDate: z.string().trim().max(40).optional(),
  endDate: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type B2bRequestFields = z.infer<typeof b2bRequestFieldsSchema>;

// Agent self-service creation — no agentId (the authenticated session IS the
// agent) and no createdById (null = agent self-submitted, per the Lead.createdById
// convention).
export const b2bRequestCreateSchema = b2bRequestFieldsSchema;

// CRM create-on-behalf — additionally requires the target agent's User id.
export const b2bRequestAdminCreateSchema = b2bRequestFieldsSchema.extend({
  agentId: z.string().min(1, "Select a B2B agent."),
});
