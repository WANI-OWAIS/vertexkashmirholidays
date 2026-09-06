"use client";

import type { ReactNode } from "react";
import { openB2bRegisterModal } from "@/lib/b2b/registerModal";

interface B2bRegisterButtonProps {
  className?: string;
  children: ReactNode;
}

// Every "Register as a B2B Partner" CTA on the page renders one of these —
// clicking any of them opens the single shared <B2bRegisterModal />.
export function B2bRegisterButton({ className, children }: B2bRegisterButtonProps) {
  return (
    <button type="button" onClick={openB2bRegisterModal} className={className}>
      {children}
    </button>
  );
}
