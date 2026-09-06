"use client";

import { useState } from "react";
import { Play, ExternalLink } from "lucide-react";
import { SafeImage } from "@/components/ui/atoms/SafeImage";

interface B2bYoutubeEmbedProps {
  videoId: string;
  title: string;
}

// Click-to-play thumbnail so the iframe (and its scripts/cookies) only load
// once a visitor actually wants the video — never on page load, never
// autoplaying. "Watch on YouTube" is a separate, plain link that always opens
// in a new tab, so leaving the page is never the only way to watch.
export function B2bYoutubeEmbed({ videoId, title }: B2bYoutubeEmbedProps) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        {playing ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex items-center justify-center"
            aria-label={`Play video: ${title}`}
          >
            <SafeImage
              src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
              alt=""
              fill
              className="object-cover"
              sizes="(min-width: 768px) 768px, 100vw"
            />
            <span className="absolute inset-0 bg-black/30 transition group-hover:bg-black/40" />
            <span className="relative grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow transition group-hover:scale-105">
              <Play className="h-6 w-6 translate-x-0.5" fill="currentColor" strokeWidth={0} />
            </span>
          </button>
        )}
      </div>
      <a
        href={`https://www.youtube.com/watch?v=${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary hover:underline"
      >
        Watch on YouTube <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
