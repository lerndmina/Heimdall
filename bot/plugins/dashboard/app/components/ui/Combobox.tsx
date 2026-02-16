/**
 * Combobox — searchable dropdown inspired by shadcn/ui combobox.
 *
 * Features:
 * - Search / filter
 * - Keyboard navigation (↑ ↓ Enter Escape)
 * - Click-outside to close
 * - Dark zinc theme matching the rest of the dashboard
 */
"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Small badge rendered before the label text. */
  prefix?: React.ReactNode;
  /** Small badge rendered after the label text. */
  suffix?: React.ReactNode;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: boolean;
  /** When provided, a refresh button is shown at the top of the dropdown. */
  onRefresh?: () => void;
}

export default function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No results found.",
  disabled = false,
  loading = false,
  error = false,
  onRefresh,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Position state for portal-based popover
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const selectedOption = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [filtered.length]);

  // Focus the search input when opening & calculate popover position
  useEffect(() => {
    if (open) {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPopoverStyle({
          position: "fixed",
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          zIndex: 9999,
        });
      }
      // Small delay so the popover is rendered
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setSearch("");
    }
  }, [open]);

  // Click outside — check both container and popover
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target) && popoverRef.current && !popoverRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  const select = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIndex]) select(filtered[highlightIndex].value);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full" onKeyDown={handleKeyDown}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm outline-none transition ${
          error ? "border-red-500 ring-1 ring-red-500/30" : open ? "border-primary-500 ring-1 ring-primary-500" : "border-zinc-700 hover:border-zinc-600"
        } bg-white/5 backdrop-blur-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
        <span className={`flex items-center gap-1.5 ${selectedOption ? "text-zinc-100" : "text-zinc-500"}`}>
          {loading ? (
            "Loading…"
          ) : selectedOption ? (
            <>
              {selectedOption.prefix}
              {selectedOption.label}
              {selectedOption.suffix}
            </>
          ) : (
            placeholder
          )}
        </span>
        {/* Chevron */}
        <svg className={`ml-2 h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Popover — rendered via portal to escape overflow containers */}
      {open &&
        createPortal(
          <div ref={popoverRef} style={popoverStyle} className="rounded-lg border border-zinc-700/30 bg-zinc-900/90 shadow-xl shadow-black/40 backdrop-blur-2xl" onKeyDown={handleKeyDown}>
            {/* Refresh button */}
            {onRefresh && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRefresh();
                }}
                className="flex w-full items-center gap-2 border-b border-zinc-700/30 px-3 py-2 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200">
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh list
              </button>
            )}

            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-zinc-700/30 px-3 py-2">
              <svg className="h-4 w-4 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
              />
            </div>

            {/* List */}
            <div ref={listRef} className="max-h-52 overflow-y-auto p-1">
              {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-zinc-500">{emptyMessage}</p>}
              {filtered.map((opt, i) => {
                const isSelected = opt.value === value;
                const isHighlighted = i === highlightIndex;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => select(opt.value)}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition ${isHighlighted ? "bg-white/10 text-zinc-100" : "text-zinc-300 hover:bg-white/5"}`}>
                    {/* Checkmark */}
                    <svg className={`h-4 w-4 shrink-0 ${isSelected ? "text-primary-400" : "text-transparent"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="flex items-center gap-1.5 truncate">
                      {opt.prefix}
                      <span className="truncate">{opt.label}</span>
                      {opt.suffix}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
