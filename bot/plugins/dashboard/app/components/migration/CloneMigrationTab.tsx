"use client";

import { useState, useRef, useCallback } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import TextInput from "@/components/ui/TextInput";
import Modal from "@/components/ui/Modal";
import { toast } from "sonner";
import MigrationProgress from "./MigrationProgress";

type DropPhase = "idle" | "confirm1" | "confirm2" | "confirm3" | "dropping" | "done";

export default function CloneMigrationTab() {
  const [sourceDbUri, setSourceDbUri] = useState("");
  const [guildId, setGuildId] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, any> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Drop state
  const [dropPhase, setDropPhase] = useState<DropPhase>("idle");
  const [dropConfirmText, setDropConfirmText] = useState("");
  const [dropResults, setDropResults] = useState<Record<string, any> | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);

  const handleClone = async () => {
    if (!sourceDbUri.trim()) {
      toast.error("Please enter the source database URI");
      return;
    }

    setRunning(true);
    setResults(null);
    setErrorMessage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/dev/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDbUri: sourceDbUri.trim(),
          guildId: guildId.trim() || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.success && data.data) {
        setResults(data.data);
        toast.success("Clone migration completed");
      } else {
        throw new Error(data.error?.message || "Clone migration failed");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setErrorMessage(err.message || "Clone migration failed");
        toast.error(err.message || "Clone migration failed");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  // ── Drop All Data flow ──────────────────────────────────────────────────

  const openDropModal = useCallback(() => {
    setDropPhase("confirm1");
    setDropConfirmText("");
    setDropResults(null);
    setDropError(null);
  }, []);

  const closeDropModal = useCallback(() => {
    if (dropPhase === "dropping") return; // can't close while dropping
    setDropPhase("idle");
    setDropConfirmText("");
  }, [dropPhase]);

  const executeDrop = async () => {
    setDropPhase("dropping");
    setDropError(null);

    try {
      const res = await fetch("/api/dev/drop", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Confirm-Drop": "DROP ALL DATA",
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data.success && data.data) {
        setDropResults(data.data);
        setDropPhase("done");
        toast.success(`Dropped ${data.data.totalDeleted.toLocaleString()} documents`);
      } else {
        throw new Error(data.error?.message || "Drop failed");
      }
    } catch (err: any) {
      setDropError(err.message || "Drop failed");
      setDropPhase("confirm3"); // let them see the error
      toast.error(err.message || "Drop failed");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardTitle>Instance Clone Settings</CardTitle>
        <CardDescription className="mt-1">Clone all data from another Heimdall instance&apos;s database</CardDescription>
        <CardContent className="mt-4 space-y-4">
          <TextInput
            label="Source Database URI"
            description="MongoDB connection string for the source Heimdall instance"
            value={sourceDbUri}
            onChange={setSourceDbUri}
            placeholder="mongodb://..."
            disabled={running}
          />
          <TextInput
            label="Guild ID (Optional)"
            description="Leave empty to clone all guilds, or filter to a specific guild"
            value={guildId}
            onChange={setGuildId}
            placeholder="1234567890123456789"
            disabled={running}
          />

          {/* Encryption warning */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-400">
            <strong>🔐 Encryption Key Requirement:</strong> Both instances must use the same <code className="rounded bg-amber-500/20 px-1">ENCRYPTION_KEY</code> environment variable. Encrypted fields
            (guild environment variables, Minecraft RCON passwords, modmail webhook tokens) are copied as raw ciphertext and cannot be decrypted if the keys differ.
          </div>

          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-xs text-blue-400">
            <strong>ℹ️ What gets cloned:</strong> All 35 data models across all plugins — configs, infractions, modmail threads, tickets, suggestions, and more. Ephemeral game state (TicTacToe,
            Connect4) is skipped. Existing records are automatically skipped (idempotent).
          </div>

          <button
            onClick={handleClone}
            disabled={running}
            className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50">
            {running ? "Cloning..." : "Start Clone"}
          </button>
        </CardContent>
      </Card>

      {/* Drop All Data — scary zone */}
      <Card>
        <CardContent>
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-2xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-400">Danger Zone — Drop All Data</h3>
                <p className="mt-1 text-xs text-red-400/70">
                  If cloning skipped everything because the database already has data, you can wipe <strong>all</strong> Heimdall collections first and then re-clone. This permanently deletes every
                  document across all 35 collections. There is no undo.
                </p>
                <button
                  onClick={openDropModal}
                  disabled={running || dropPhase === "dropping"}
                  className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50">
                  Drop All Data...
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Drop Confirmation Modal (3-step) ──────────────────────────────── */}
      <Modal open={dropPhase !== "idle"} onClose={closeDropModal} title={dropPhase === "done" ? "Data Dropped" : "⚠️ Drop All Data"} maxWidth="max-w-md">
        {/* Step 1: Initial warning */}
        {dropPhase === "confirm1" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-400">This will permanently delete ALL data:</p>
              <ul className="mt-2 space-y-1 text-xs text-red-400/80">
                <li>• All guild configurations across every plugin</li>
                <li>• All infractions, modmail threads, tickets, suggestions</li>
                <li>• All Minecraft players, coins, role sync logs</li>
                <li>• All tags, reminders, welcome messages, temp VC configs</li>
                <li>• All dashboard permissions and role button panels</li>
                <li>
                  • <strong>Everything.</strong> Across <strong>all guilds.</strong>
                </li>
              </ul>
            </div>
            <p className="text-xs text-zinc-400">This cannot be undone. Make sure you have a backup or a source database to clone from.</p>
            <div className="flex justify-end gap-3">
              <button onClick={closeDropModal} className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5">
                Cancel
              </button>
              <button onClick={() => setDropPhase("confirm2")} className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20">
                I understand, continue
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Type confirmation */}
        {dropPhase === "confirm2" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              Type <code className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-xs text-red-400">DROP ALL DATA</code> to confirm:
            </p>
            <input
              type="text"
              value={dropConfirmText}
              onChange={(e) => setDropConfirmText(e.target.value)}
              placeholder="DROP ALL DATA"
              autoFocus
              className="w-full rounded-lg border border-zinc-700/30 bg-zinc-800/50 px-3 py-2 font-mono text-sm text-zinc-100 placeholder-zinc-600 outline-none ring-red-500/50 focus:ring-1"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setDropPhase("confirm1")} className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5">
                Back
              </button>
              <button
                onClick={() => setDropPhase("confirm3")}
                disabled={dropConfirmText !== "DROP ALL DATA"}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-30">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Final confirmation */}
        {dropPhase === "confirm3" && (
          <div className="space-y-4">
            {dropError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{dropError}</div>}
            <div className="rounded-lg border border-red-600/50 bg-red-600/10 p-4 text-center">
              <p className="text-lg font-bold text-red-400">Are you absolutely sure?</p>
              <p className="mt-1 text-xs text-red-400/70">This is your last chance. Every document in every Heimdall collection will be permanently deleted.</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={closeDropModal} className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5">
                Cancel
              </button>
              <button onClick={executeDrop} className="rounded-lg border border-red-600/60 bg-red-600/20 px-4 py-2 text-sm font-bold text-red-400 transition hover:bg-red-600/30">
                🗑️ Drop Everything — No Going Back
              </button>
            </div>
          </div>
        )}

        {/* Dropping in progress */}
        {dropPhase === "dropping" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500/30 border-t-red-500" />
            <p className="text-sm text-zinc-400">Dropping all collections...</p>
            <p className="text-xs text-zinc-500">Do not close this window</p>
          </div>
        )}

        {/* Done */}
        {dropPhase === "done" && dropResults && (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
              <p className="text-sm font-semibold text-green-400">All data has been dropped</p>
              <p className="mt-1 text-2xl font-bold text-green-400">{dropResults.totalDeleted.toLocaleString()} documents deleted</p>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-700/30 bg-zinc-800/30 p-3">
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(dropResults.results as Record<string, { deleted: number }>).map(([label, r]) => (
                    <tr key={label} className="border-b border-zinc-700/20 last:border-0">
                      <td className="py-1 text-zinc-400">{label}</td>
                      <td className="py-1 text-right font-mono text-zinc-300">{r.deleted.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-500">You can now run the clone migration to re-import data.</p>
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setDropPhase("idle");
                  setDropConfirmText("");
                }}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500">
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Live Progress via WebSocket */}
      <MigrationProgress active={running} mode="clone" onComplete={(stats) => setResults(stats)} onError={(err) => setErrorMessage(err)} />

      {/* Error from fetch */}
      {errorMessage && !running && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{errorMessage}</div>}
    </div>
  );
}
