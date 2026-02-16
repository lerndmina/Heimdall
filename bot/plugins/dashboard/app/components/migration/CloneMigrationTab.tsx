"use client";

import { useState, useRef } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import TextInput from "@/components/ui/TextInput";
import { toast } from "sonner";
import MigrationProgress from "./MigrationProgress";

export default function CloneMigrationTab() {
  const [sourceDbUri, setSourceDbUri] = useState("");
  const [guildId, setGuildId] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, any> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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

      {/* Live Progress via WebSocket */}
      <MigrationProgress active={running} mode="clone" onComplete={(stats) => setResults(stats)} onError={(err) => setErrorMessage(err)} />

      {/* Error from fetch */}
      {errorMessage && !running && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{errorMessage}</div>}
    </div>
  );
}
