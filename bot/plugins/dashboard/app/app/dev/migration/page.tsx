/**
 * Migration Page - Import data from old bot
 *
 * Allows bot owner to migrate configurations from the old bot database.
 * Owner-only accessible. Streams progress via SSE.
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import TextInput from "@/components/ui/TextInput";
import Toggle from "@/components/ui/Toggle";
import { fetchDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import CategoryAssignmentWizard from "@/components/modmail/CategoryAssignmentWizard";

interface MigrationResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: string[];
}

interface MigrationStats {
  tempVC: MigrationResult;
  activeTempChannels: MigrationResult;
  tags: MigrationResult;
  suggestionConfig: MigrationResult;
  suggestions: MigrationResult;
  modmailConfig: MigrationResult;
  modmail: MigrationResult;
}

type StepKey = keyof MigrationStats;

interface ProgressStep {
  key: StepKey;
  label: string;
  status: "pending" | "running" | "done";
  result?: MigrationResult;
}

const STEP_LABELS: { key: StepKey; label: string; icon: string }[] = [
  { key: "tempVC", label: "Temp Voice Channels", icon: "🔊" },
  { key: "activeTempChannels", label: "Active Temp Channels", icon: "🔊" },
  { key: "tags", label: "Tags", icon: "🏷️" },
  { key: "suggestionConfig", label: "Suggestion Config", icon: "💡" },
  { key: "suggestions", label: "Suggestions", icon: "💡" },
  { key: "modmailConfig", label: "Modmail Config", icon: "📨" },
  { key: "modmail", label: "Modmail Threads", icon: "📨" },
];

export default function MigrationPage() {
  const [oldDbUri, setOldDbUri] = useState("");
  const [guildId, setGuildId] = useState("");
  const [skipModmail, setSkipModmail] = useState(false);
  const [modmailCollection, setModmailCollection] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<MigrationStats | null>(null);
  const [isBotOwner, setIsBotOwner] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  // Check if user is bot owner on mount
  useEffect(() => {
    const checkBotOwner = async () => {
      try {
        const res = await fetchDashboardApi<{ isBotOwner: boolean }>("bot-owner", {
          method: "GET",
        });

        if (res.success && res.data) {
          setIsBotOwner(res.data.isBotOwner);
        } else {
          setIsBotOwner(false);
        }
      } catch {
        setIsBotOwner(false);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkBotOwner();
  }, []);

  const handleMigrate = async () => {
    if (!oldDbUri.trim()) {
      toast.error("Please enter the old database URI");
      return;
    }

    setRunning(true);
    setResults(null);
    setErrorMessage(null);

    // Initialize steps
    const initialSteps: ProgressStep[] = STEP_LABELS.map((s, i) => ({
      key: s.key,
      label: s.label,
      status: i === 0 ? "running" : "pending",
    }));
    setSteps(initialSteps);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/dev/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldDbUri: oldDbUri.trim(),
          guildId: guildId.trim() || undefined,
          skipModmail,
          importOpenThreads: true,
          modmailCollection: modmailCollection.trim() || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && res.body) {
        // Stream SSE events
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));

              if (event.type === "progress") {
                setSteps((prev) =>
                  prev.map((s) => {
                    if (s.key === event.step) {
                      return { ...s, status: "done", result: event.result };
                    }
                    // Mark the next step as running
                    if (event.completed < event.total) {
                      const nextKey = STEP_LABELS[event.completed]?.key;
                      if (s.key === nextKey && s.status === "pending") {
                        return { ...s, status: "running" };
                      }
                    }
                    return s;
                  }),
                );
              } else if (event.type === "complete") {
                setResults(event.stats);
                setSteps((prev) => prev.map((s) => (s.status === "pending" || s.status === "running" ? { ...s, status: "done", result: event.stats[s.key] } : s)));
                toast.success("Migration completed");

                // Show wizard if modmail threads were imported
                if (event.stats.modmail?.imported > 0) {
                  setShowWizard(true);
                }
              } else if (event.type === "error") {
                throw new Error(event.message);
              }
            } catch (e: any) {
              if (e.message && !e.message.includes("JSON")) {
                throw e;
              }
            }
          }
        }
      } else {
        // Fallback: non-streaming JSON response
        const data = await res.json();
        if (data.success && data.data) {
          setResults(data.data);
          setSteps((prev) => prev.map((s) => ({ ...s, status: "done", result: data.data[s.key] })));
          toast.success("Migration completed");
        } else {
          throw new Error(data.error?.message || "Migration failed");
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setErrorMessage(err.message || "Migration failed");
        toast.error(err.message || "Migration failed");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-2xl">🔐</div>
          <p className="text-zinc-400">Checking authorization...</p>
        </div>
      </div>
    );
  }

  // Show access denied if not bot owner
  if (isBotOwner === false) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardTitle>Access Denied</CardTitle>
          <CardContent className="mt-4 space-y-4">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <div className="mb-2 text-4xl">🚫</div>
              <p className="font-semibold">Bot Owner Only</p>
              <p className="mt-2 text-xs text-red-300">This page is only accessible to the bot owner. Data migration is a sensitive operation that requires bot-level permissions.</p>
            </div>
            <button onClick={() => (window.location.href = "/")} className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500">
              Return to Dashboard
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const completedCount = steps.filter((s) => s.status === "done").length;
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Data Migration</h1>
        <p className="mt-2 text-sm text-zinc-400">Import configurations from the old bot database</p>
      </div>
      {/* Configuration */}
      <Card>
        <CardTitle>Migration Settings</CardTitle>
        <CardDescription className="mt-1">Connect to your old bot's MongoDB database to import data</CardDescription>
        <CardContent className="mt-4 space-y-4">
          <TextInput
            label="Old Database URI"
            description="MongoDB connection string for the old bot (e.g., mongodb://localhost:27017/heimdall)"
            value={oldDbUri}
            onChange={setOldDbUri}
            placeholder="mongodb://..."
            disabled={running}
          />
          <TextInput
            label="Guild ID (Optional)"
            description="Leave empty to migrate all guilds, or specify one guild ID"
            value={guildId}
            onChange={setGuildId}
            placeholder="1234567890123456789"
            disabled={running}
          />
          <TextInput
            label="Modmail Collection Name (Optional)"
            description="Custom MongoDB collection name for modmail threads. Leave empty to auto-detect (tries 'modmails' then 'solacemodmails')."
            value={modmailCollection}
            onChange={setModmailCollection}
            placeholder="e.g. solacemodmails"
            disabled={running}
          />
          <Toggle label="Skip Modmail Threads" description="Skip importing modmail conversations (config will still be noted)" checked={skipModmail} onChange={setSkipModmail} disabled={running} />
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-400">
            <strong>⚠️ Important:</strong> This will import data from the old database into the new system. Existing data with the same IDs will be skipped. Make sure you have a backup before
            proceeding.
          </div>
          <button
            onClick={handleMigrate}
            disabled={running}
            className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50">
            {running ? "Migrating..." : "Start Migration"}
          </button>
        </CardContent>
      </Card>
      {/* Live Progress */}
      {steps.length > 0 && (
        <Card>
          <CardTitle>{results ? "Migration Results" : "Migration Progress"}</CardTitle>
          <CardContent className="mt-4">
            {/* Progress bar */}
            {running && (
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
            <div className="space-y-2">
              {steps.map((step) => {
                const meta = STEP_LABELS.find((s) => s.key === step.key);
                return (
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
                        <span className="text-sm font-medium text-zinc-200">
                          {meta?.icon} {step.label}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs">
                        {step.status === "running" && <span className="text-primary-400">Running...</span>}
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
                );
              })}
            </div>

            {/* Error */}
            {errorMessage && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{errorMessage}</div>}

            {/* Summary */}
            {results && (
              <div className="mt-5 space-y-3">
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Total Imported:</span>
                    <span className="font-medium text-emerald-400">{Object.values(results).reduce((sum, r) => sum + r.imported, 0)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Total Skipped:</span>
                    <span className="font-medium text-zinc-400">{Object.values(results).reduce((sum, r) => sum + r.skipped, 0)}</span>
                  </div>
                </div>

                {/* Manual wizard trigger for modmail */}
                {results.modmail && results.modmail.imported > 0 && (
                  <button
                    onClick={() => {
                      if (!guildId) {
                        const enteredGuildId = prompt("Enter the Guild ID to assign categories for:");
                        if (enteredGuildId) {
                          setGuildId(enteredGuildId);
                          setShowWizard(true);
                        }
                      } else {
                        setShowWizard(true);
                      }
                    }}
                    className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 flex items-center justify-center gap-2">
                    <span>📨</span>
                    <span>Assign Categories to Imported Modmail Threads ({results.modmail.imported})</span>
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* Category Assignment Wizard */}
      {showWizard && guildId && (
        <CategoryAssignmentWizard
          guildId={guildId}
          onClose={() => setShowWizard(false)}
          onComplete={() => {
            setShowWizard(false);
            toast.success("Categories assigned successfully! Imported threads can now be used.");
          }}
        />
      )}
      {/* No Guild ID Warning */}
      {showWizard && !guildId && results?.modmail && results.modmail.imported > 0 && (
        <Card>
          <CardTitle>⚠️ Category Assignment Required</CardTitle>
          <CardContent className="mt-4 space-y-4">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
              <p className="font-semibold">Imported modmail threads need category assignment</p>
              <p className="mt-2 text-xs text-yellow-300">
                {results.modmail.imported} modmail threads were imported, but they reference old category IDs that won't work with your new configuration. To make these threads functional (so staff
                can send messages), you need to assign them to new categories.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-zinc-300">What to do:</h3>
              <ol className="space-y-2 text-sm text-zinc-400">
                <li className="flex gap-2">
                  <span className="text-primary-400 font-bold">1.</span>
                  <span>First, set up your modmail categories in the Modmail Config page (create forum channels and webhooks)</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-400 font-bold">2.</span>
                  <span>Then, return to this page and run the migration again WITH a Guild ID specified</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-primary-400 font-bold">3.</span>
                  <span>The category assignment wizard will appear after migration completes, allowing you to bulk-assign all imported threads</span>
                </li>
              </ol>
            </div>

            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm">
              <p className="font-medium text-zinc-300">💡 Tip: Scroll up and add your Guild ID</p>
              <p className="mt-2 text-xs text-zinc-500">
                The Guild ID field is marked as optional, but it's required for the category assignment wizard to work. You can find your Guild ID by right-clicking your server in Discord (with
                Developer Mode enabled).
              </p>
            </div>

            <button onClick={() => setShowWizard(false)} className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500">
              Got it
            </button>
          </CardContent>
        </Card>
      )}
      {/* Info */}
      <Card>
        <CardTitle>What Gets Migrated?</CardTitle>
        <CardContent className="mt-4">
          <ul className="space-y-2 text-sm text-zinc-400">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>
                <strong className="text-zinc-300">Temp Voice Channels:</strong> Creator channel configs, sequential naming settings
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>
                <strong className="text-zinc-300">Tags:</strong> All guild-specific text tags
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>
                <strong className="text-zinc-300">Suggestions:</strong> Config and all existing suggestions with votes
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>
                <strong className="text-zinc-300">Modmail Threads:</strong> All conversations (open and closed) with full message history — open threads remain open
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>
                <strong className="text-zinc-300">Modmail Config:</strong> Settings, ticket numbering, auto-close config, staff roles (categories need manual reconfiguration for webhooks/forum
                channels)
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-zinc-500">ℹ</span>
              <span>
                <strong className="text-zinc-300">Category Mapping:</strong> Old modmail category IDs won't match new system - threads will need to be reassigned post-migration
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>{" "}
    </div>
  );
}
