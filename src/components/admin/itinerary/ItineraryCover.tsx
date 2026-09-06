"use client";

import { toast } from "sonner";
import { EditableField } from "./EditableField";
import { ImagePicker } from "./ImagePicker";
import { ItineraryIcon } from "./icons";
import type { ItineraryData } from "@/types/itinerary";

type CoverField =
  | "coverTitle"
  | "subtitle"
  | "duration"
  | "preparedFor"
  | "travelDates"
  | "travelers"
  | "packageType"
  | "totalCost"
  | "preparedByName"
  | "preparedByPhone";

interface ItineraryCoverProps {
  data: Pick<ItineraryData, CoverField | "coverImage">;
  onUpdate: (field: CoverField, value: string) => void;
  onImageChange: (src: string) => void;
  /** Lead-linked itineraries derive these fields from the lead — show as read-only. */
  readOnlyDerived?: boolean;
  /**
   * Lead- or booking-linked itineraries keep the customer name in sync with
   * that record — locked here, with a warning toast on attempted edit, so it
   * can never drift from the lead/booking it belongs to.
   */
  nameLocked?: "lead" | "booking" | null;
  /** Website booking itineraries — total cost is fixed at checkout, show as read-only. */
  lockCost?: boolean;
}

export function ItineraryCover({
  data,
  onUpdate,
  onImageChange,
  readOnlyDerived = false,
  nameLocked = null,
  lockCost = false,
}: ItineraryCoverProps) {
  function warnNameLocked() {
    toast.warning(
      `This itinerary is already linked to a ${nameLocked} — the customer name can't be changed here.`,
    );
  }
  return (
    <article className="page cover relative min-h-[640px] overflow-hidden rounded-xl bg-gradient-to-br from-[#0f261b] via-[#1a3a2a] to-[#0f261b] sm:min-h-[880px] md:min-h-[1160px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.coverImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg,rgba(12,28,22,.45) 0%,rgba(12,28,22,.18) 32%,rgba(10,24,18,.55) 70%,rgba(8,20,15,.85) 100%)",
        }}
      />

      <ImagePicker
        value={data.coverImage}
        onChange={onImageChange}
        className="absolute right-4 top-4 z-20"
        label="Cover image"
      />

      <div className="relative flex min-h-[640px] flex-col p-6 text-white sm:min-h-[880px] sm:p-9 md:min-h-[1160px] md:p-12">
        <div className="flex items-start justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/png/horizontal/vertex-horizontal-dark-1600w.png"
            alt="Vertex Kashmir Holidays"
            className="h-12 w-auto object-contain sm:h-14"
          />
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold tracking-[0.28em] text-white/70">
              PREPARED BY
            </p>
            <EditableField
              value={data.preparedByName}
              onValueChange={(v) => onUpdate("preparedByName", v)}
              className="text-right text-sm font-bold text-white"
            />
            <EditableField
              value={data.preparedByPhone}
              onValueChange={(v) => onUpdate("preparedByPhone", v)}
              className="text-right text-[12px] text-white/80"
            />
          </div>
        </div>

        <div className="mt-12 sm:mt-20 md:mt-24">
          <EditableField
            value={data.coverTitle}
            onValueChange={(v) => onUpdate("coverTitle", v)}
            className="font-serif text-[40px] font-semibold leading-[0.95] tracking-[0.06em] text-white sm:text-[58px] md:text-[78px]"
          />
          <EditableField
            value={data.subtitle}
            onValueChange={(v) => onUpdate("subtitle", v)}
            className="-mt-2 font-script text-[32px] leading-none text-[hsl(146_35%_55%)] sm:-mt-3 sm:text-[46px] md:text-[58px]"
          />
          <div className="mt-6 flex items-center gap-4">
            <span className="h-px w-12 bg-white/60" />
            {readOnlyDerived ? (
              <span className="font-serif max-w-[260px] text-sm font-semibold tracking-[0.3em] text-white">
                {data.duration}
              </span>
            ) : (
              <EditableField
                value={data.duration}
                onValueChange={(v) => onUpdate("duration", v)}
                className="font-serif max-w-[260px] text-sm font-semibold tracking-[0.3em] text-white"
              />
            )}
            <span className="text-white/60">✦</span>
          </div>
        </div>

        <div className="mt-auto">
          <p className="text-center text-[12px] font-semibold tracking-[0.32em] text-white/70">
            PREPARED FOR
          </p>
          {nameLocked ? (
            <EditableField
              value={data.preparedFor}
              readOnly
              onClick={warnNameLocked}
              className="font-serif mt-1.5 cursor-not-allowed text-center text-2xl font-semibold text-white sm:text-3xl md:text-4xl"
            />
          ) : readOnlyDerived ? (
            <p className="font-serif mt-1.5 text-center text-2xl font-semibold text-white sm:text-3xl md:text-4xl">
              {data.preparedFor}
            </p>
          ) : (
            <EditableField
              value={data.preparedFor}
              onValueChange={(v) => onUpdate("preparedFor", v)}
              className="font-serif mt-1.5 text-center text-2xl font-semibold text-white sm:text-3xl md:text-4xl"
            />
          )}

          <div className="mt-7 grid grid-cols-1 gap-4 border-t border-white/20 pt-6 sm:mt-9 sm:grid-cols-3">
            <div className="flex items-start gap-3">
              <ItineraryIcon
                icon="calendar"
                className="mt-0.5 h-6 w-6 shrink-0 text-[hsl(146_35%_55%)]"
              />
              <div className="min-w-0">
                {readOnlyDerived ? (
                  <p className="text-sm font-bold text-white">{data.travelDates}</p>
                ) : (
                  <EditableField
                    value={data.travelDates}
                    onValueChange={(v) => onUpdate("travelDates", v)}
                    className="text-sm font-bold text-white"
                  />
                )}
                <p className="text-[12px] tracking-wide text-white/65">TRAVEL DATES</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ItineraryIcon
                icon="support"
                className="mt-0.5 h-6 w-6 shrink-0 text-[hsl(146_35%_55%)]"
              />
              <div className="min-w-0">
                {readOnlyDerived ? (
                  <p className="text-sm font-bold text-white">{data.travelers}</p>
                ) : (
                  <EditableField
                    value={data.travelers}
                    onValueChange={(v) => onUpdate("travelers", v)}
                    className="text-sm font-bold text-white"
                  />
                )}
                <p className="text-[12px] tracking-wide text-white/65">TRAVELLERS</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ItineraryIcon
                icon="star"
                className="mt-0.5 h-6 w-6 shrink-0 text-[hsl(146_35%_55%)]"
              />
              <div className="min-w-0">
                {readOnlyDerived ? (
                  <p className="text-sm font-bold text-white">{data.packageType}</p>
                ) : (
                  <EditableField
                    value={data.packageType}
                    onValueChange={(v) => onUpdate("packageType", v)}
                    className="text-sm font-bold text-white"
                  />
                )}
                <p className="text-[12px] tracking-wide text-white/65">PACKAGE TYPE</p>
              </div>
            </div>
          </div>

          <div className="mt-7 rounded-xl bg-[hsl(158_46%_14%)]/85 py-5 text-center ring-1 ring-white/10 backdrop-blur">
            {lockCost ? (
              <p className="font-serif text-center text-2xl font-bold text-white sm:text-3xl">
                {data.totalCost}
              </p>
            ) : (
              <EditableField
                value={data.totalCost}
                onValueChange={(v) => onUpdate("totalCost", v)}
                className="font-serif text-center text-2xl font-bold text-white sm:text-3xl"
              />
            )}
            <p className="text-[12px] font-semibold tracking-[0.28em] text-white/70">
              TOTAL PACKAGE COST
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
