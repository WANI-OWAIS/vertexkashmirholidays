// Plain constants only — no Node.js imports — so this is safe to import from
// both server PDF-generation code and client preview components alike.
// src/lib/pdf/assets.ts re-exports these for existing server-side callers.

import { REGISTERED_OFFICE_FORMATTED } from "@/lib/businessAddress";

// Brand palette — kept in sync with the itinerary PDF so every document Vertex
// sends looks like it came from the same company.
export const PDF_COLORS = {
  green: "#1d5c43",
  greenDark: "#10261b",
  mint: "#6abf8e",
  lightGreen: "#e3f0e9",
  cream: "#f7f4ee",
  border: "#e4e0d8",
  ink: "#2b2b2b",
  muted: "#7a7a72",
  rose: "#e11d48",
  white: "#ffffff",
};

// Single source of truth for company contact details on outbound documents.
// `address` is a static fallback only — real generation call sites resolve
// the live Corporate Office (or Registered Office) via companyOffice.ts and
// pass it explicitly; this value is used only if that's ever omitted.
export const PDF_CONTACT = {
  company: "Vertex Kashmir Tour & Travels",
  brand: "Vertex Kashmir Holidays",
  reg: "J&K Tourism Registration number - JKEA00001840",
  phone: "+91-7889577789 / +91-9682648388",
  address: REGISTERED_OFFICE_FORMATTED,
  email: "support@vertexkashmirholidays.com",
};

export const inr = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-IN")}`;

// Real social profile URLs (SiteSettings.instagram/facebook/youtube), passed
// through to PDF generators so the footer/closing social icons can link
// somewhere real instead of sitting as inert decoration. Optional/undefined
// fields simply render as a non-clickable icon — never a dead link.
export interface PdfSocialLinks {
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
}
