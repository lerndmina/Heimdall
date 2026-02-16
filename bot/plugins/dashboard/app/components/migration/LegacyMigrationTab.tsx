"use client";

import { useState, useRef } from "react";
import { Card, CardTitle, CardContent, CardDescription } from "@/components/ui/Card";
import TextInput from "@/components/ui/TextInput";
import Toggle from "@/components/ui/Toggle";
import { toast } from "sonner";
import MigrationProgress from "./MigrationProgress";
import CategoryAssignmentWizard from "@/components/modmail/CategoryAssignmentWizard";

export default function LegacyMigrationTab() {
  const [oldDbUri, setOldDbUri] = useState("");
  const [guildId, setGuildId] = useState("");
  const [skipModmail, setSkipModmail] = useState(false);
  const [modmailCollection, setModmailCollection] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const handleMigrate = async () => {
    if (!oldDbUri.trim()) {
      toast.error("Please enter the old database URI");
      return;
    }

    setRunning(true);
    setResults(null);
    setErrorMessage(null);

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

      const data = await res.json();
      if (data.success && data.data) {
        setResults(data.data);
        toast.success("Migration completed");
        if (data.data.modmail?.imported > 0) {
          setShowWizard(true);
        }
      } else {
        throw new Error(data.error?.message || "Migration failed");
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

  return (
    <div className="space-y-6">
      {/* Configuration */}
      <Card>
        <CardTitle>Legacy Import Settings</CardTitle>
        <CardDescription className="mt-1">Connect to your old bot&apos;s MongoDB database to import data</CardDescription>
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

      {/* Live Progress via WebSocket */}
      <MigrationProgress
        active={running}
        mode="legacy"
        onComplete={(stats) => {
          setResults(stats);
          if (stats?.modmail?.imported > 0) {
            setShowWizard(true);
          }
        }}
        onError={(err) => setErrorMessage(err)}
      />

      {/* Error from fetch */}
      {errorMessage && !running && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{errorMessage}</div>}

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
      {showWizard && !guildId && results?.modmail && results.modmail.imported > 0 && (
        <Card>
          <CardTitle>⚠️ Category Assignment Required</CardTitle>
          <CardContent className="mt-4 space-y-4">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
              <p className="font-semibold">Imported modmail threads need category assignment</p>
              <p className="mt-2 text-xs text-yellow-300">
                {results.modmail.imported} modmail threads were imported, but they reference old category IDs. To make these threads functional, assign them to new categories.
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
                <strong className="text-zinc-300">Modmail Threads:</strong> All conversations with full message history
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400">✓</span>
              <span>
                <strong className="text-zinc-300">Modmail Config:</strong> Settings, ticket numbering, auto-close config, staff roles
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
