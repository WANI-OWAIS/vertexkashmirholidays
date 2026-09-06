"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, X } from "lucide-react";

const MAX_LOGO_BYTES = 500 * 1024; // 500KB

interface Props {
  /** Fires with the validated data URL, or undefined once cleared/invalid. */
  onChange: (dataUrl: string | undefined) => void;
  /** Shown alongside the field's own validation errors (e.g. "required" from the parent form). */
  externalError?: string | null;
}

/**
 * PNG-only company logo picker, capped at 500KB (no pixel-dimension check) —
 * shared by the public B2B registration form and the CRM manual-creation
 * form so the two never validate a logo differently. The server
 * (parseAgencyLogo in src/lib/b2b/schema.ts) re-validates format/size
 * independently before ever storing it — this is client-side UX only.
 */
export function LogoUploadField({ onChange, externalError }: Props) {
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resets the file/preview state only — does NOT touch logoError, since
  // every rejection branch below sets an error message immediately before
  // calling this, and that message must survive the reset.
  function resetFile() {
    setLogoDataUrl(undefined);
    setLogoFileName(null);
    if (inputRef.current) inputRef.current.value = "";
    onChange(undefined);
  }

  function clear() {
    resetFile();
    setLogoError(null);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "image/png") {
      setLogoError("Logo must be a PNG image.");
      resetFile();
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError(`Logo must be under 500KB (this file is ${(file.size / 1024).toFixed(0)}KB).`);
      resetFile();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setLogoDataUrl(dataUrl);
      setLogoFileName(file.name);
      setLogoError(null);
      onChange(dataUrl);
    };
    reader.onerror = () => {
      setLogoError("Couldn't read this file. Please try again.");
      resetFile();
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <label htmlFor="b2bLogo" className="text-[14px] font-semibold">
        Company Logo <span className="text-rose-500">*</span>{" "}
        <span className="font-medium text-muted-foreground">(PNG only, under 500KB)</span>
      </label>
      <div className="mt-1.5 flex items-center gap-3">
        <label
          htmlFor="b2bLogo"
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-2.5 text-[13px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <ImagePlus className="h-4 w-4" strokeWidth={1.9} />
          {logoFileName ? "Change file" : "Choose PNG file"}
        </label>
        <input
          ref={inputRef}
          id="b2bLogo"
          type="file"
          accept="image/png"
          onChange={handleChange}
          className="sr-only"
        />
        {logoDataUrl && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- small (<=500KB) client-side data URI, not a remote asset next/image can optimize */}
            <img
              src={logoDataUrl}
              alt="Logo preview"
              className="h-9 w-9 rounded border border-border object-contain"
            />
            <span className="max-w-[10rem] truncate text-[12px] text-muted-foreground">
              {logoFileName}
            </span>
            <button
              type="button"
              onClick={clear}
              aria-label="Remove logo"
              className="text-muted-foreground hover:text-rose-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {(logoError || externalError) && (
        <p className="mt-1 text-[12px] text-rose-500">{logoError ?? externalError}</p>
      )}
    </div>
  );
}
