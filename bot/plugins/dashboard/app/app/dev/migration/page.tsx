/**
 * Migration Page - Two modes: Legacy Import and Instance Clone
 *
 * Allows bot owner to migrate data from an old bot or clone from another Heimdall instance.
 * Owner-only accessible. Progress streamed via WebSocket.
 */
"use client";

import { useState, useEffect } from "react";
import { Card, CardTitle, CardContent } from "@/components/ui/Card";
import { fetchDashboardApi } from "@/lib/api";
import Tabs from "@/components/ui/Tabs";
import LegacyMigrationTab from "@/components/migration/LegacyMigrationTab";
import CloneMigrationTab from "@/components/migration/CloneMigrationTab";

export default function MigrationPage() {
  const [isBotOwner, setIsBotOwner] = useState<boolean | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Data Migration</h1>
        <p className="mt-2 text-sm text-zinc-400">Import data from an old bot or clone from another Heimdall instance</p>
      </div>

      <Tabs
        tabs={[
          {
            id: "legacy",
            label: "Legacy Import",
            icon: <span>📦</span>,
            content: <LegacyMigrationTab />,
          },
          {
            id: "clone",
            label: "Instance Clone",
            icon: <span>🔄</span>,
            content: <CloneMigrationTab />,
          },
        ]}
        defaultTab="legacy"
      />
    </div>
  );
}
