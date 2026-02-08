/**
 * SetupWizard — reusable multi-step wizard for plugin configuration.
 *
 * Usage:
 * ```tsx
 * const STEPS: WizardStep[] = [
 *   { id: "basic", label: "Basic Settings", content: <BasicStep />, validate: () => draft.name !== "" },
 *   { id: "advanced", label: "Advanced", content: <AdvancedStep /> },
 *   { id: "review",  label: "Review", content: <ReviewStep /> },
 * ];
 *
 * <SetupWizard steps={STEPS} isEdit={false} saving={saving} saveError={err} onSave={save} onCancel={cancel} />
 * ```
 *
 * Also exports helper components: ReviewSection, ReviewRow, FieldDisplay, NotConfigured
 */
"use client";

import React from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";

// ── Types ────────────────────────────────────────────────

export interface WizardStep {
  /** Unique identifier for the step */
  id: string;
  /** Label shown in the step indicator bar */
  label: string;
  /** The form content to render for this step */
  content: React.ReactNode;
  /** Optional validation — return true if the user can proceed past this step. Defaults to true. */
  validate?: () => boolean;
}

export interface SetupWizardProps {
  /** The wizard steps (min 2) */
  steps: WizardStep[];
  /** Current step index (controlled) */
  step: number;
  /** Step setter (controlled) */
  onStepChange: (step: number) => void;
  /** Whether we're editing an existing config vs creating new */
  isEdit: boolean;
  /** Whether the save is in progress */
  saving: boolean;
  /** Error message from the last save attempt */
  saveError: string | null;
  /** Called when the user clicks the final "Save" / "Create" button */
  onSave: () => void;
  /** Called when the user cancels the wizard */
  onCancel: () => void;
  /** Custom label for the save button. Defaults to "Create Configuration" / "Save Changes" */
  saveLabel?: string;
  /** Custom label for the saving state. Defaults to "Saving…" */
  savingLabel?: string;
}

// ── SetupWizard ──────────────────────────────────────────

export default function SetupWizard({ steps, step, onStepChange, isEdit, saving, saveError, onSave, onCancel, saveLabel, savingLabel }: SetupWizardProps) {
  const currentStep = steps[step];
  const canNext = currentStep?.validate ? currentStep.validate() : true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">{isEdit ? "Edit Configuration" : "Setup Wizard"}</h2>
          <p className="text-sm text-zinc-400">
            Step {step + 1} of {steps.length} — {currentStep?.label}
          </p>
        </div>
        <button onClick={onCancel} className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <button
            key={s.id}
            onClick={() => i <= step && onStepChange(i)}
            disabled={i > step && !canNext}
            className={`flex-1 rounded-full py-1 text-xs font-medium transition cursor-pointer ${
              i === step ? "bg-primary-600 text-white" : i < step ? "bg-primary-600/30 text-primary-400 hover:bg-primary-600/50" : "bg-white/5 text-zinc-500 hover:bg-white/10"
            } disabled:cursor-not-allowed disabled:opacity-50`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Step content */}
      <Card>
        <CardContent>{currentStep?.content}</CardContent>
      </Card>

      {/* Error */}
      {saveError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{saveError}</div>}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => (step === 0 ? onCancel() : onStepChange(step - 1))}
          className="rounded-lg border border-zinc-700/30 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5">
          {step === 0 ? "Cancel" : "Back"}
        </button>

        {step < steps.length - 1 ? (
          <button
            onClick={() => onStepChange(step + 1)}
            disabled={!canNext}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed">
            Continue
          </button>
        ) : (
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
            {saving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                <path fill="currentColor" className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? (savingLabel ?? "Saving…") : (saveLabel ?? (isEdit ? "Save Changes" : "Create Configuration"))}
          </button>
        )}
      </div>
    </div>
  );
}

// ── ReviewSection ────────────────────────────────────────

export function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-700/30 bg-white/5 p-4 backdrop-blur-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

// ── ReviewRow ────────────────────────────────────────────

export function ReviewRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      {children ?? <span className="font-medium text-zinc-200">{value ?? "—"}</span>}
    </div>
  );
}

// ── FieldDisplay ─────────────────────────────────────────

export function FieldDisplay({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-1">{children ?? <p className="text-sm text-zinc-200">{value ?? "—"}</p>}</div>
    </div>
  );
}

// ── NotConfigured ────────────────────────────────────────

export function NotConfigured({
  title,
  description,
  icon,
  buttonLabel,
  onSetup,
  canSetup = true,
}: {
  title: string;
  description: string;
  /** SVG icon element (defaults to a gear icon) */
  icon?: React.ReactNode;
  buttonLabel?: string;
  onSetup?: () => void;
  canSetup?: boolean;
}) {
  return (
    <Card className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 rounded-full border border-zinc-700/30 bg-zinc-900/40 p-4 backdrop-blur-xl">
        {icon ?? (
          <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </div>
      <CardTitle>{title}</CardTitle>
      <CardDescription className="mt-2 max-w-md">{description}</CardDescription>
      {canSetup && (
        <button onClick={onSetup} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary-500">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {buttonLabel ?? "Create Configuration"}
        </button>
      )}
    </Card>
  );
}

// ── EditButton ───────────────────────────────────────────

export function EditButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <div className="flex justify-end">
      <button onClick={onClick} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        {label ?? "Edit Configuration"}
      </button>
    </div>
  );
}
