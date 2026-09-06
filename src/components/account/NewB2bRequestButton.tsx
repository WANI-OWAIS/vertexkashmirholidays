"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/organisms/dialog";
import { B2bRequestForm } from "./B2bRequestForm";

interface Props {
  label?: string;
  className?: string;
}

export function NewB2bRequestButton({ label = "New Request", className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:brightness-110",
          className,
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        {label}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Package Request</DialogTitle>
          </DialogHeader>
          <B2bRequestForm mode="create" onSuccess={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
