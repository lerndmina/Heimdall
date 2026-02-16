"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { useOwnerEvent } from "@/hooks/useOwnerEvent";

interface MigrationResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

interface ProgressStep {
  key: string;
  label: string;
  plugin?: string;
  status: "pending" | "running" | "done";
  result?: MigrationResult;
  recordIndex?: number;
  recordTotal?: number;
}

interface MigrationProgressProps {
  active: boolean;
  mode: "legacy" | "clone";
  onComplete?: (stats: any) => void;
  onError?: (error: string) => void;
}

/**
 * Shared migration progress component — subscribes to WebSocket events
 * and renders live step-by-step progress with per-record progress bars.
 * Works for both Legacy Import and Instance Clone modes.
 */
export default function MigrationProgress({ active, mode, onComplete, onError }: MigrationProgressProps) {
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [overall, setOverall] = useState({ completed: 0, total: 0 });

  // Reset when migration starts
  useEffect(() => {
    if (active) {
      setSteps([]);
      setError(null);
      setOverall({ completed: 0, total: 0 });
    }
  }, [active]);

  const handleStepStart = useCallback(
    (data: any) => {
      if (data.mode !== mode) return;
      setSteps((prev) => {
        const existing = prev.find((s) => s.key === data.step);
        if (existing) {
          return prev.map((s) => (s.key === data.step ? { ...s, status: "running" as const } : s));
        }
        return [...prev, { key: data.step, label: data.label, plugin: data.plugin, status: "running" as const }];
      });
      setOverall({ completed: data.completed, total: data.total });
    },
    [mode],
  );

  const handleStepProgress = useCallback(
    (data: any) => {
      if (data.mode !== mode) return;
      setSteps((prev) => prev.map((s) => (s.key === data.step ? { ...s, recordIndex: data.recordIndex, recordTotal: data.recordTotal } : s)));
    },
    [mode],
  );

  const handleStepComplete = useCallback(
    (data: any) => {
      if (data.mode !== mode) return;
      setSteps((prev) => prev.map((s) => (s.key === data.step ? { ...s, status: "done" as const, result: data.result, recordIndex: undefined, recordTotal: undefined } : s)));
      setOverall({ completed: data.completed, total: data.total });
    },
    [mode],
  );

  const handleComplete = useCallback(
    (data: any) => {
      if (data.mode !== mode) return;
      onComplete?.(data.stats);
    },
    [mode, onComplete],
  );

  const handleError = useCallback(
    (data: any) => {
      if (data.mode !== mode) return;
      setError(data.error);
      onError?.(data.error);
    },
    [mode, onError],
  );

  useOwnerEvent("migration:step_start", handleStepStart);
  useOwnerEvent("migration:step_progress", handleStepProgress);
  useOwnerEvent("migration:step_complete", handleStepComplete);
  useOwnerEvent("migration:complete", handleComplete);
  useOwnerEvent("migration:error", handleError);

  if (steps.length === 0 && !active) return null;

  const completedCount = steps.filter((s) => s.status === "done").length;
  const totalSteps = overall.total || steps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <Card>
      <CardTitle>{completedCount === totalSteps && totalSteps > 0 ? "Migration Results" : "Migration Progress"}</CardTitle>
      <CardContent className="mt-4">
        {/* Overall progress bar */}
        {active && (
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-zinc-400">
                Step {completedCount} of {totalSteps}
              </span>
              <span className="font-medium text-primary-400">{progressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-primary-500 transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        {/* Step list */}
        <div className="max-h-[600px] space-y-2 overflow-y-auto">
          {steps.map((step) => (
            <div
              key={step.key}
              className={`rounded-lg border px-4 py-3 transition-colors duration-300 ${
                step.status === "running" ? "border-primary-500/40 bg-primary-500/5" : step.status === "done" ? "border-zinc-800 bg-zinc-800/30" : "border-zinc-800/50 bg-zinc-900/30 opacity-50"
              }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {step.status === "running" && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />}
                  {step.status === "done" && <span className="text-sm">{step.result?.success ? "✅" : "❌"}</span>}
                  {step.status === "pending" && <span className="text-sm text-zinc-600">⏳</span>}
                  <div>
                    <span className="text-sm font-medium text-zinc-200">{step.label}</span>
                    {step.plugin && <span className="ml-2 text-xs text-zinc-500">{step.plugin}</span>}
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  {step.status === "running" && !step.recordTotal && <span className="text-primary-400">Running...</span>}
                  {step.status === "running" && step.recordTotal != null && step.recordTotal > 0 && (
                    <span className="text-primary-400">
                      {step.recordIndex ?? 0} / {step.recordTotal}
                    </span>
                  )}
                  {step.status === "done" && step.result && (
                    <>
                      {step.result.success ? (
                        <>
                          <span className="text-emerald-400">✓ {step.result.imported} imported</span>
                          {step.result.skipped > 0 && <span className="text-zinc-500">⏭ {step.result.skipped} skipped</span>}
                        </>
                      ) : (
                        <span className="text-red-400">✗ Failed</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Per-record progress bar */}
              {step.status === "running" && step.recordTotal != null && step.recordTotal > 0 && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-primary-400/60 transition-all duration-300" style={{ width: `${Math.round(((step.recordIndex ?? 0) / step.recordTotal) * 100)}%` }} />
                  </div>
                </div>
              )}

              {/* Errors */}
              {step.status === "done" && step.result && step.result.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {step.result.errors.slice(0, 3).map((err, i) => (
                    <p key={i} className="text-xs text-red-400">
                      {err}
                    </p>
                  ))}
                  {step.result.errors.length > 3 && <p className="text-xs text-zinc-500">... and {step.result.errors.length - 3} more errors</p>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

        {/* Summary */}
        {!active && steps.length > 0 && steps.every((s) => s.status === "done") && (
          <div className="mt-5">
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total Imported:</span>
                <span className="font-medium text-emerald-400">{steps.reduce((sum, s) => sum + (s.result?.imported ?? 0), 0)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total Skipped:</span>
                <span className="font-medium text-zinc-400">{steps.reduce((sum, s) => sum + (s.result?.skipped ?? 0), 0)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
