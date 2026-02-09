/**
 * AnimatedBackground — optional lightweight background gradients.
 *
 * Persists the "effects on" preference to localStorage under the key
 * `heimdall:bg-effects`. When disabled, no extra overlays are rendered.
 */
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "heimdall:bg-effects";

export default function AnimatedBackground() {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Read preference from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "on") setEnabled(true);
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
      {enabled && (
        <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(closest-side_at_18%_22%,rgba(99,102,241,0.18),transparent_70%),radial-gradient(closest-side_at_80%_55%,rgba(59,130,246,0.14),transparent_70%),radial-gradient(closest-side_at_60%_8%,rgba(168,85,247,0.12),transparent_70%)]" />
      )}

      {/* ── Toggle button (bottom-right) ── */}
      {mounted && (
        <button
          onClick={toggle}
          aria-label={enabled ? "Disable background effects" : "Enable background effects"}
          title={enabled ? "Disable background effects" : "Enable background effects"}
          className="fixed bottom-4 right-4 z-50 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700/40 bg-zinc-900 text-zinc-500 transition-all duration-300 hover:border-zinc-600/60 hover:text-zinc-300">
          {enabled ? (
            /* sparkles icon — effects on */
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
              />
            </svg>
          ) : (
            /* sparkles with slash — effects off */
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
