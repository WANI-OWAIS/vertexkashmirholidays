"use client";

import type { ReactNode } from "react";
import { trackWhatsappClick } from "@/lib/analytics";

interface B2bWhatsAppLinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

// Thin client wrapper so the (server) B2B page can still track WhatsApp
// clicks — reuses the same trackWhatsappClick() every other WhatsApp CTA on
// the site goes through, tagged "b2b_page" for this page's CTAs.
export function B2bWhatsAppLink({ href, className, children }: B2bWhatsAppLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsappClick("b2b_page")}
      className={className}
    >
      {children}
    </a>
  );
}
