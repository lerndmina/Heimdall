/**
 * DataTable — generic table with search, pagination placeholder, and loading state.
 */
"use client";

import { useState, useMemo, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  /** Render a custom cell value. Defaults to accessing row[key]. */
  render?: (row: T) => ReactNode;
  /** Sortable column (future) */
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Field keys to include in search */
  searchKeys?: (keyof T & string)[];
  searchPlaceholder?: string;
  loading?: boolean;
  emptyMessage?: string;
}

export default function DataTable<T extends object>({ columns, data, searchKeys = [], searchPlaceholder = "Search...", loading = false, emptyMessage = "No data found." }: DataTableProps<T>) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search || searchKeys.length === 0) return data;
    const q = search.toLowerCase();
    return data.filter((row) =>
      searchKeys.some((key) =>
        String((row as Record<string, unknown>)[key] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [data, search, searchKeys]);

  return (
    <div className="space-y-4">
      {/* Search */}
      {searchKeys.length > 0 && (
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 py-2 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-3 text-left font-medium text-zinc-400 ${col.className ?? ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-zinc-500">
                  <div className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                      <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Loading...
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-zinc-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/50 transition hover:bg-zinc-800/30">
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>
                      {col.render ? col.render(row) : ((row as Record<string, unknown>)[col.key] as ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination placeholder */}
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          {filtered.length} {filtered.length === 1 ? "result" : "results"}
        </span>
      </div>
    </div>
  );
}
