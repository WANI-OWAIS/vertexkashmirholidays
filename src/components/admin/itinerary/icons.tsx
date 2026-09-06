// Safe icon registry for the itinerary document.
// Icons are addressed by a string key (stored in data) and rendered from a
// fixed set of <path> definitions — never from raw HTML — so DB/user-driven
// icon values can't inject markup.

export type ItineraryIconKey =
  | "calendar"
  | "map-pin"
  | "car"
  | "star"
  | "meals"
  | "stay"
  | "highlights"
  | "drop"
  | "home"
  | "shield"
  | "medal"
  | "support"
  | "users"
  | "clock"
  | "check"
  | "minus"
  | "briefcase"
  | "plane"
  | "cloud-snow"
  | "undo"
  | "alert-circle"
  | "qrcode"
  | "user-check"
  | "world"
  | "info"
  | "instagram"
  | "facebook"
  | "youtube"
  | "whatsapp"
  | "bulb";

// Path data verified against lucide-react's published icon set (utensils, bed,
// headset, users, star, shield-check) rather than hand-drawn, so the shapes
// are correct/recognizable — only `calendar`/`car`/`map-pin`/`drop`/`home`/
// `medal` are unchanged from before (already correct, no reason to touch).
export const ITINERARY_ICON_PATHS: Record<ItineraryIconKey, string> = {
  calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
  "map-pin": "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M12 7v0",
  car: "M5 17h14l1-5-2-5H6L4 12Z M7.5 17.5v0 M16.5 17.5v0",
  star: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
  meals: "M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7",
  stay: "M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9",
  highlights: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
  drop: "M12 2s7 7 7 12a7 7 0 0 1-14 0c0-5 7-12 7-12Z",
  home: "m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z M9 21V12h6v9",
  shield: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z M9 12L11 14L15 10",
  medal: "M12 9a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M9 14l-1.5 7L12 18.5 16.5 21 15 14",
  support: "M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z M21 16v2a4 4 0 0 1-4 4h-5",
  // Single filled person silhouette (not a multi-figure "group" glyph) —
  // reads clearly as solid/filled at the small sizes this is used at (the
  // cover's TRAVELLERS stat), matching the visual weight of the solid star
  // beside it. Actual headcount is already in the value text ("2 Adults · 1
  // Child"), so the icon's job is just "traveller", not literally N bodies.
  users: "M12 2a4 4 0 1 0 0 8a4 4 0 1 0 0-8Z M12 12c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6Z",
  // Closed circle (solid-capable) + hour/minute hands as a separate stroke
  // overlay — same "filled body + white overlay stroke" treatment as
  // `shield`'s checkmark. Used for an activity's Time field.
  clock: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0 M12 6L12 12L16 14",

  // Added for the redesigned itinerary document (mockup-driven) — verified
  // against lucide-react's published icon set, same as the block above.
  check: "M20 6 9 17l-5-5",
  minus: "M5 12h14",
  briefcase: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16 M4 6h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
  // Used for both "activity plane" and departure/plane-takeoff contexts.
  plane: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.2.6-.7.5-1.1Z",
  "cloud-snow": "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 M8 15h.01 M12 17h.01 M16 15h.01",
  undo: "M9 14 4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11",
  "alert-circle": "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 8v4 M12 16h.01",
  // Simplified glyph (three corner markers), not a scannable code — this is
  // a small decorative label icon; the document's real payment QR is a
  // generated image (tokenQrDataUrl), not this icon.
  qrcode: "M4 4h6v6H4Z M14 4h6v6h-6Z M4 14h6v6H4Z M15 15h2v2h-2Z M19 15h1v1h-1Z M15 19h1v1h-1Z M17 17h1v1h-1Z M19 19h2v2h-2Z",
  "user-check": "M2 21a8 8 0 0 1 13.292-6 M10 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M16 19l2 2 4-4",
  world: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20 M2 12h20",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M12 16v-4 M12 8h.01",

  // Brand marks — path data copied verbatim from src/components/icons/brand.tsx
  // (the DOM SVG versions already used on the live site) so the PDF's social
  // row matches the real footer icons exactly rather than approximating them.
  instagram:
    "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.332.014 7.052.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  whatsapp:
    "M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3-.6-2.5-1-4.1-3.6-4.2-3.8-.1-.2-1-1.3-1-2.5s.6-1.7.8-2c.2-.2.4-.3.6-.3h.4c.2 0 .4 0 .6.5l.7 1.7c0 .2.1.3 0 .5l-.4.6c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2 1.1.9 2 .9 2.3 1 .2 0 .4 0 .5-.2l.6-.8c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.2.4.3.1.2.1.6-.1 1Z",
  bulb: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5 M9 18h6 M10 22h4",
};

export const ITINERARY_ICON_KEYS = Object.keys(ITINERARY_ICON_PATHS) as ItineraryIconKey[];

/** Resolve an icon key to its path data, falling back to the star glyph —
 *  covers a freshly-added "Detail" meta row (and any other custom label that
 *  doesn't match a known icon key) before staff renames it to something
 *  recognized. */
function pathFor(icon: string): string {
  return ITINERARY_ICON_PATHS[icon as ItineraryIconKey] ?? ITINERARY_ICON_PATHS.star;
}

interface ItineraryIconProps {
  icon: string;
  className?: string;
  strokeWidth?: number;
}

export function ItineraryIcon({
  icon,
  className = "h-6 w-6",
  strokeWidth = 1.6,
}: ItineraryIconProps) {
  const d = pathFor(icon);
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d.split(" M").map((seg, i) => (
        <path key={i} d={i === 0 ? seg : `M${seg}`} />
      ))}
    </svg>
  );
}
