/**
 * DayTimePicker — pick a day of the week + hour/minute in UTC.
 *
 * Stores day as 0–6 (Sun–Sat) and time as total minutes from midnight (0–1439).
 * Days are displayed Mon→Sun. Styled to match the dashboard's dark zinc theme.
 */
"use client";

import { useMemo } from "react";
import Combobox from "@/components/ui/Combobox";

/** Internal index → label mapping (JS 0=Sun convention) */
const DAY_LABELS: Record<number, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

/** Display order: Mon (1) → Sun (0) */
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((i) => ({
  value: String(i),
  label: DAY_LABELS[i]!,
}));

interface DayTimePickerProps {
  label?: string;
  description?: string;
  day: number;
  /** Minutes from midnight UTC (0–1439) */
  timeMinutes: number;
  onDayChange: (day: number) => void;
  onTimeChange: (minutes: number) => void;
}

export default function DayTimePicker({ label, description, day, timeMinutes, onDayChange, onTimeChange }: DayTimePickerProps) {
  const hours = Math.floor(timeMinutes / 60);
  const minutes = timeMinutes % 60;

  /** Build the HH:MM string for the time input */
  const timeValue = useMemo(() => {
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    return `${hh}:${mm}`;
  }, [hours, minutes]);

  const handleTimeChange = (raw: string) => {
    const [h, m] = raw.split(":").map(Number);
    if (h == null || m == null || isNaN(h) || isNaN(m)) return;
    onTimeChange(Math.min(h * 60 + m, 1439));
  };

  return (
    <div className="space-y-1.5">
      {label && <p className="block text-sm font-medium text-zinc-200">{label}</p>}
      {description && <p className="text-xs text-zinc-500">{description}</p>}

      <div className="flex gap-3">
        {/* Day selector */}
        <div className="flex-1">
          <label className="mb-1 block text-xs text-zinc-500">Day</label>
          <Combobox options={DAY_OPTIONS} value={String(day)} onChange={(v) => onDayChange(Number(v))} placeholder="Select a day…" searchPlaceholder="Search day…" />
        </div>

        {/* Time selector */}
        <div className="w-36">
          <label className="mb-1 block text-xs text-zinc-500">Time (UTC)</label>
          <input
            type="time"
            value={timeValue}
            onChange={(e) => handleTimeChange(e.target.value)}
            className="w-full rounded-lg border border-zinc-700/30 bg-white/5 px-3 py-2 text-sm text-zinc-100 outline-none backdrop-blur-sm transition focus:border-primary-500 focus:ring-1 focus:ring-primary-500 scheme-dark"
          />
        </div>
      </div>

      <p className="text-[11px] text-zinc-600">
        All pending registrations will be whitelisted every {DAY_LABELS[day]} at {timeValue} UTC.
      </p>
    </div>
  );
}
