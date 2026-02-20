/**
 * RowActionMenu — portal-based, viewport-aware action menu for table rows.
 *
 * Renders into document.body via a portal so it never gets clipped by
 * table overflow or parent containers. Position adjusts automatically
 * so the menu stays inside the viewport even near the bottom of the page.
 *
 * Usage:
 *   const [menuState, setMenuState] = useState<{ id: string; el: HTMLButtonElement } | null>(null);
 *
 *   // In the trigger button:
 *   onClick={(e) => setMenuState(prev => prev?.id === row.id ? null : { id: row.id, el: e.currentTarget })}
 *
 *   // Once (outside the row map):
 *   <RowActionMenu open={!!menuState} anchorEl={menuState?.el ?? null} onClose={() => setMenuState(null)}>
 *     <RowActionItem onClick={...} variant="warning">Revoke</RowActionItem>
 *     <RowActionItem onClick={...} variant="danger">Delete</RowActionItem>
 *   </RowActionMenu>
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ── RowActionMenu ──────────────────────────────────────────────

interface RowActionMenuProps {
  open: boolean;
  /** The button element that triggered the menu — used to calculate position. */
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: React.ReactNode;
  /** Menu width in px. Defaults to 176 (Tailwind w-44). */
  width?: number;
}

export function RowActionMenu({ open, anchorEl, onClose, children, width = 176 }: RowActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [visible, setVisible] = useState(false);

  // Recalculate position whenever the menu opens or the anchor changes.
  // Uses requestAnimationFrame so the menu div is in the DOM and measurable
  // before we finalize position, preventing any visible "jump".
  useEffect(() => {
    if (!open || !anchorEl) {
      setVisible(false);
      setPosition(null);
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);

    // Set an initial position so the portal renders (hidden) for measurement.
    setPosition({ top: rect.bottom + 6, left });
    setVisible(false);

    requestAnimationFrame(() => {
      if (!menuRef.current) return;
      const menuHeight = menuRef.current.getBoundingClientRect().height || 0;
      const below = rect.bottom + 6;
      const above = rect.top - menuHeight - 6;
      const top = below + menuHeight > window.innerHeight - 8 ? Math.max(8, above) : below;
      setPosition({ top, left });
      setVisible(true);
    });
  }, [open, anchorEl, width]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, anchorEl, onClose]);

  if (!open || !position || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width,
        zIndex: 9999,
      }}
      className={`rounded-lg border border-zinc-700/30 bg-zinc-900/95 py-1 shadow-xl backdrop-blur-sm transition-opacity duration-75 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      {children}
    </div>,
    document.body,
  );
}

// ── RowActionItem ──────────────────────────────────────────────

const ITEM_COLORS = {
  default: "text-zinc-300 hover:text-zinc-100",
  warning: "text-orange-400 hover:text-orange-300",
  danger: "text-red-400 hover:text-red-300",
} as const;

interface RowActionItemProps {
  onClick: () => void;
  variant?: keyof typeof ITEM_COLORS;
  children: React.ReactNode;
  disabled?: boolean;
}

export function RowActionItem({ onClick, variant = "default", children, disabled }: RowActionItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 ${ITEM_COLORS[variant]}`}>
      {children}
    </button>
  );
}

// ── RowActionSeparator ─────────────────────────────────────────

export function RowActionSeparator() {
  return <div className="my-1 border-t border-zinc-700/30" />;
}
