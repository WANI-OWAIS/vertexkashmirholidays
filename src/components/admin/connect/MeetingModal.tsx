"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneOff, Loader2, Minimize2, Maximize2, PictureInPicture2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  meetingId: string;
  jitsiRoomId: string;
  displayName: string;
  audioOnly: boolean;
  isCreator: boolean;
  onLeave: () => void;
  onEndForAll: () => void;
  onAnswered?: () => void;
}

interface TokenData {
  jwt: string;
  appId: string;
}

interface JitsiAPI {
  addEventListeners: (listeners: {
    readyToClose?: () => void;
    participantJoined?: () => void;
    screenSharingStatusChanged?: (event: { on: boolean }) => void;
  }) => void;
  getIFrame: () => HTMLIFrameElement;
  dispose: () => void;
}

// Document Picture-in-Picture (Chrome/Edge 116+ only — feature-detected below,
// so Firefox/Safari silently keep the existing in-page corner-minimize
// behaviour with no "Pop out" button shown at all).
interface DocumentPictureInPicture {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: {
      new (domain: string, options: Record<string, unknown>): JitsiAPI;
    };
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

export function MeetingModal({
  meetingId,
  jitsiRoomId,
  displayName,
  audioOnly,
  isCreator,
  onLeave,
  onEndForAll,
  onAnswered,
}: Props) {
  const [token, setToken] = useState<TokenData | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [poppedOut, setPoppedOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const answeredRef = useRef(false);
  const apiRef = useRef<JitsiAPI | null>(null);
  // The real, OS-level always-on-top window once popped out — closed
  // whenever the call itself ends (see the unmount effect below), so a
  // floating call window never outlives its call.
  const pipWindowRef = useRef<Window | null>(null);
  const pipSupported = typeof window !== "undefined" && "documentPictureInPicture" in window;

  // Moves the live Jitsi container back from the (closing) PiP window into
  // its normal spot in-page. Deliberately a raw DOM move, not a state-driven
  // re-render of the container element itself — React never unmounts/recreates
  // that div (see the JSX below), so this is the only place its parent
  // changes, and it can never race with React trying to remove a child that
  // isn't actually there anymore.
  const returnFromPip = useCallback(() => {
    if (containerRef.current && rootRef.current && containerRef.current.parentElement !== rootRef.current) {
      containerRef.current.style.width = "";
      containerRef.current.style.height = "";
      rootRef.current.appendChild(containerRef.current);
    }
    pipWindowRef.current = null;
    setPoppedOut(false);
  }, []);

  // Pops the live call out into a real Document Picture-in-Picture window —
  // an actual always-on-top OS window (like Teams/WhatsApp's floating call
  // bubble), not just a CSS-positioned corner box, so it stays visible across
  // browser tabs and other application windows. Only the raw Jitsi container
  // (which already has its own full call UI — mute/hang-up/etc., rendered
  // inside the iframe by Jitsi itself) is moved; our own React-rendered
  // buttons are never relied on inside the PiP window, since React's
  // synthetic event delegation doesn't span across documents/windows.
  const popOut = useCallback(async () => {
    if (!window.documentPictureInPicture || !containerRef.current) return;
    try {
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 360,
        height: 240,
      });
      pipWindow.document.body.style.margin = "0";
      pipWindow.document.body.style.background = "#1e1e1e";
      pipWindow.document.body.style.overflow = "hidden";
      containerRef.current.style.width = "100%";
      containerRef.current.style.height = "100vh";
      pipWindow.document.body.appendChild(containerRef.current);
      pipWindowRef.current = pipWindow;
      setPoppedOut(true);
      // Fires on user-close, tab close, or our own programmatic .close() —
      // the single path back to the normal in-page view either way.
      pipWindow.addEventListener("pagehide", returnFromPip, { once: true });
    } catch {
      // Dismissed permission/user-activation requirement, or the API failed —
      // silently stay in the normal in-page view.
    }
  }, [returnFromPip]);

  // A floating call must never outlive the call itself.
  useEffect(() => {
    return () => {
      pipWindowRef.current?.close();
    };
  }, []);

  const handleAnswered = useCallback(() => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setAnswered(true);
    onAnswered?.();
  }, [onAnswered]);

  // Fetch JaaS JWT
  useEffect(() => {
    fetch(`/api/connect/meetings/${meetingId}/token`)
      .then((r) => r.json())
      .then((data: { jwt?: string; appId?: string }) => {
        if (data.jwt && data.appId) setToken({ jwt: data.jwt, appId: data.appId });
        else setTokenError(true);
      })
      .catch(() => setTokenError(true));
  }, [meetingId]);

  // Poll participants every 3s to auto-close when meeting ends and fire onAnswered
  useEffect(() => {
    if (!token) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/connect/meetings/${meetingId}/participants`);
        if (!res.ok) return;
        const { active, count } = (await res.json()) as { active: boolean; count: number };
        if (!active) {
          clearInterval(id);
          onLeave();
          return;
        }
        if (count > 1) handleAnswered();
      } catch {
        // best-effort
      }
    }, 3_000);
    return () => clearInterval(id);
  }, [token, meetingId, onLeave, handleAnswered]);

  // Mount JitsiMeetExternalAPI — mirrors the 8x8.vc demo HTML approach
  useEffect(() => {
    if (!token || !containerRef.current) return;

    const initMeeting = () => {
      if (!window.JitsiMeetExternalAPI || !containerRef.current) return;

      const api = new window.JitsiMeetExternalAPI("8x8.vc", {
        roomName: `${token.appId}/${jitsiRoomId}`,
        parentNode: containerRef.current,
        jwt: token.jwt,
        width: "100%",
        height: "100%",
        configOverwrite: {
          startWithVideoMuted: audioOnly,
          startWithAudioMuted: false,
          disableDeepLinking: true,
          prejoinPageEnabled: false,
          disableInviteFunctions: true,
          desktopSharingEnabled: true,
        },
        interfaceConfigOverwrite: {
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_CHROME_EXTENSION_BANNER: false,
        },
        userInfo: { displayName, email: "" },
      });

      // Set allow attribute synchronously before the browser evaluates
      // Permissions Policy — must happen before any getUserMedia call.
      const iframe = api.getIFrame();
      iframe.setAttribute(
        "allow",
        "camera; microphone; autoplay; clipboard-write; display-capture",
      );
      iframe.style.height = "100%";
      iframe.style.width = "100%";

      api.addEventListeners({
        readyToClose: onLeave,
        participantJoined: handleAnswered,
        // Auto-shrink to a corner box when screen sharing starts, so the
        // presenter can navigate the CRM to pick what to show — mirrors
        // the Teams/Zoom "sharing" behaviour. Restoring is manual (Maximize).
        screenSharingStatusChanged: (e) => {
          if (e.on) setMinimized(true);
        },
      });

      apiRef.current = api;
    };

    if (window.JitsiMeetExternalAPI) {
      initMeeting();
    } else {
      const script = document.createElement("script");
      script.src = `https://8x8.vc/${token.appId}/external_api.js`;
      script.async = true;
      script.onload = initMeeting;
      script.onerror = () => setTokenError(true);
      document.head.appendChild(script);
    }

    return () => {
      apiRef.current?.dispose?.();
      apiRef.current = null;
    };
  }, [token, jitsiRoomId, displayName, audioOnly, onLeave, handleAnswered]);

  if (tokenError) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#1e1e1e]">
        <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-2 bg-black/40 backdrop-blur-sm">
          <button
            onClick={onLeave}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            Close
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
          Failed to connect to meeting. Please leave and try again.
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1e1e1e]">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
        <span className="ml-3 text-white/50 text-sm">Connecting…</span>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "fixed z-50 flex flex-col bg-[#1e1e1e] transition-all",
        poppedOut
          ? "bottom-4 right-4 w-72 h-12 rounded-xl overflow-hidden shadow-2xl"
          : minimized
            ? "bottom-4 right-4 w-72 h-44 rounded-xl overflow-hidden shadow-2xl"
            : "inset-0",
      )}
    >
      {/* Top bar — while popped out this becomes a plain "it's floating
          elsewhere" indicator; the real call controls live inside the PiP
          window itself (Jitsi's own built-in UI), since React's synthetic
          events don't reach across into that separate window/document. */}
      <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-2 bg-black/40 backdrop-blur-sm">
        {poppedOut ? (
          <>
            <span className="mr-auto text-xs text-white/60">Call is in a floating window</span>
            <button
              onClick={() => pipWindowRef.current?.close()}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              Bring back
            </button>
          </>
        ) : (
          <>
            {!minimized && isCreator && (
              <button
                onClick={onEndForAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-700 text-white hover:bg-red-800 transition-colors font-medium"
              >
                End for all
              </button>
            )}
            {answered && pipSupported && (
              <button
                onClick={popOut}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label="Pop out call"
                title="Float this call above all windows and tabs"
              >
                <PictureInPicture2 className="w-3.5 h-3.5" />
              </button>
            )}
            {answered && (
              <button
                onClick={() => setMinimized((m) => !m)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label={minimized ? "Expand call" : "Minimize call"}
              >
                {minimized ? (
                  <Maximize2 className="w-3.5 h-3.5" />
                ) : (
                  <Minimize2 className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </>
        )}
        <button
          onClick={onLeave}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
        >
          <PhoneOff className="w-3.5 h-3.5" />
          {!minimized && "Leave"}
        </button>
      </div>

      {/* JaaS iframe fills remaining height. Always rendered here — never
          conditionally unmounted — so React never tries to move/recreate it;
          popOut()/returnFromPip() are the only things that ever change its
          actual DOM parent, via a plain node move outside of React's
          reconciliation. While popped out this node physically lives inside
          the PiP window instead (moved there by popOut()), so there's
          nothing left to show here — no visibility toggle needed, the
          "poppedOut" outer sizing above already collapses to just the top
          bar's height. */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
