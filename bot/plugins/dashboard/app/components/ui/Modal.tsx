/**
 * Modal — overlay dialog with backdrop.
 */
"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Footer with action buttons */
  footer?: ReactNode;
  /** Max width class (default: max-w-lg) */
  maxWidth?: string;
}

export default function Modal({ open, onClose, title, children, footer, maxWidth = "max-w-lg" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ui-bg-overlay)]">
      <div className={`ui-panel-flat mx-4 w-full ${maxWidth} rounded-2xl border`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--color-ui-border)_70%,transparent)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[var(--color-ui-text-primary)]">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--color-ui-text-faint)] transition hover:bg-[var(--color-ui-bg-surface-hover)] hover:text-[var(--color-ui-text-primary)]">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">{children}</div>

        {/* Footer */}
        {footer && <div className="flex items-center justify-end gap-3 border-t border-[color-mix(in_srgb,var(--color-ui-border)_70%,transparent)] px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
