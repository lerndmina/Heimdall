/**
 * AnimatedBackground — gradient glow orbs + grid overlay with a user toggle.
 *
 * Persists the "animations off" preference to localStorage under the key
 * `heimdall:bg-animations`.  When disabled the orbs and grid remain visible
 * but all motion (pulse, etc.) is paused.
 */
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "heimdall:bg-animations";

export default function AnimatedBackground() {
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Read preference from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "off") setEnabled(false);
    } catch {
      /* SSR / private-mode — ignore */
    }
    setMounted(true);
  }, []);

  const toggle = () => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <>
      {/* ── Glow orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className={`absolute -left-[10%] top-[15%] h-[500px] w-[500px] rounded-full bg-primary-500/8 blur-[100px] transition-opacity duration-700 ${enabled ? "animate-pulse" : "opacity-60"}`} />
        <div
          className={`absolute right-[0%] top-[50%] h-[400px] w-[400px] rounded-full bg-purple-500/6 blur-[100px] animation-delay-2000 transition-opacity duration-700 ${enabled ? "animate-pulse" : "opacity-60"}`}
        />
        <div
          className={`absolute left-[40%] -top-[5%] h-[350px] w-[350px] rounded-full bg-blue-500/5 blur-[80px] animation-delay-1000 transition-opacity duration-700 ${enabled ? "animate-pulse" : "opacity-60"}`}
        />
        <div
          className={`absolute left-[60%] bottom-[10%] h-[300px] w-[300px] rounded-full bg-primary-600/5 blur-[80px] animation-delay-3000 transition-opacity duration-700 ${enabled ? "animate-pulse" : "opacity-60"}`}
        />
      </div>

      {/* ── Grid pattern overlay ── */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#27272a30_1px,transparent_1px),linear-gradient(to_bottom,#27272a30_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,#000_40%,transparent_100%)] z-0" />

      {/* ── Toggle button (bottom-right) ── */}
      {mounted && (
        <button
          onClick={toggle}
          aria-label={enabled ? "Disable background animations" : "Enable background animations"}
          title={enabled ? "Disable background animations" : "Enable background animations"}
          className="fixed bottom-4 right-4 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/30 bg-zinc-900/60 text-zinc-500 backdrop-blur-xl transition-all duration-300 hover:border-zinc-600/40 hover:text-zinc-300 hover:shadow-lg">
          {enabled ? (
            /* sparkles icon — animations on */
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
              />
            </svg>
          ) : (
            /* sparkles with slash — animations off */
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
              />
              <line x1="3" y1="3" x2="21" y2="21" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}
    </>
  );
}
