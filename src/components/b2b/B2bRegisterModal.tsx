"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/organisms/dialog";
import { B2bRegistrationForm } from "@/components/b2b/B2bRegistrationForm";
import { B2B_REGISTER_MODAL_EVENT } from "@/lib/b2b/registerModal";

// Mounted once on the B2B page. Every "Register as a B2B Partner" CTA —
// including the one in the global Navbar — opens this same modal via the
// window event in @/lib/b2b/registerModal, so there's one form instance
// regardless of how many trigger buttons exist on the page.
export function B2bRegisterModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(B2B_REGISTER_MODAL_EVENT, handler);
    return () => window.removeEventListener(B2B_REGISTER_MODAL_EVENT, handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[18px]">Register as a B2B Partner</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          Submit your agency details and our B2B team will review your application. Once
          approved, we&apos;ll work with you on your Kashmir requirements, quotations and
          bookings.
        </DialogDescription>
        <B2bRegistrationForm />
      </DialogContent>
    </Dialog>
  );
}
