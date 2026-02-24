"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import TextInput from "@/components/ui/TextInput";
import NumberInput from "@/components/ui/NumberInput";
import Toggle from "@/components/ui/Toggle";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import DiscordEmoji from "@/components/ui/DiscordEmoji";
import Modal from "@/components/ui/Modal";
import { fetchApi } from "@/lib/api";
import { useCanManage } from "@/components/providers/PermissionsProvider";

interface StarboardBoard {
  boardId: string;
  name: string;
  emoji: string;
  channelId: string;
  threshold: number;
  enabled: boolean;
  selfStar: boolean;
  removeOnUnreact: boolean;
  allowNSFW: boolean;
  postAsEmbed: boolean;
  moderationEnabled: boolean;
  moderationChannelId: string | null;
}

interface StarboardEntry {
  boardId: string;
  sourceMessageId: string;
  sourceChannelId: string;
  count: number;
  status: string;
  updatedAt: string;
  starboardMessageId?: string | null;
  starboardChannelId?: string | null;
}

interface GuildEmoji {
  id: string;
  name: string;
  identifier: string;
}

const EMPTY_BOARD: StarboardBoard = {
  boardId: "",
  name: "Starboard",
  emoji: "⭐",
  channelId: "",
  threshold: 3,
  enabled: true,
  selfStar: false,
  removeOnUnreact: true,
  allowNSFW: false,
  postAsEmbed: true,
  moderationEnabled: false,
  moderationChannelId: null,
};

interface Props {
  guildId: string;
}

export default function StarboardConfigPage({ guildId }: Props) {
  const canManage = useCanManage("starboard.manage_config");
  const canModerate = useCanManage("starboard.moderate");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<StarboardBoard>(EMPTY_BOARD);
  const [pendingEntries, setPendingEntries] = useState<StarboardEntry[]>([]);
  const [recentEntries, setRecentEntries] = useState<StarboardEntry[]>([]);
  const [serverEmojis, setServerEmojis] = useState<GuildEmoji[]>([]);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  const hasBoard = !!board.boardId;

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, pendingRes, recentRes, emojisRes] = await Promise.all([
        fetchApi<{ boards: StarboardBoard[] }>(guildId, "starboard/config", { skipCache: true }),
        fetchApi<{ entries: StarboardEntry[] }>(guildId, "starboard/entries?status=pending&limit=25", { skipCache: true }),
        fetchApi<{ entries: StarboardEntry[] }>(guildId, "starboard/entries?limit=25", { skipCache: true }),
        fetchApi<{ emojis: GuildEmoji[] }>(guildId, "starboard/emojis", { skipCache: true }),
      ]);

      if (configRes.success) {
        const firstBoard = configRes.data?.boards?.[0];
        setBoard(firstBoard ? { ...EMPTY_BOARD, ...firstBoard } : EMPTY_BOARD);
      }

      if (pendingRes.success) {
        setPendingEntries(pendingRes.data?.entries ?? []);
      }

      if (recentRes.success) {
        const entries = recentRes.data?.entries ?? [];
        setRecentEntries(entries.filter((entry) => entry.status !== "pending"));
      }

      if (emojisRes.success) {
        setServerEmojis(emojisRes.data?.emojis ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  async function saveBoard() {
    if (!canManage) return;
    if (!board.channelId.trim()) {
      toast.error("Please select a starboard channel.");
      return;
    }
    if (!board.emoji.trim()) {
      toast.error("Please set a reaction emoji.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetchApi<{ boards: StarboardBoard[] }>(guildId, "starboard/config/boards", {
        method: "PUT",
        body: JSON.stringify({ board }),
      });

      if (!res.success) {
        toast.error(res.error?.message ?? "Failed to save starboard config.");
        return;
      }

      const savedBoard = res.data?.boards?.find((item) => item.boardId === board.boardId) ?? res.data?.boards?.[0] ?? board;
      setBoard({ ...EMPTY_BOARD, ...savedBoard });
      toast.success("Starboard configuration saved.");
      await fetchConfig();
    } finally {
      setSaving(false);
    }
  }

  async function deleteBoard() {
    if (!canManage || !board.boardId) return;

    setSaving(true);
    try {
      const res = await fetchApi(guildId, `starboard/config/boards/${board.boardId}`, {
        method: "DELETE",
      });

      if (!res.success) {
        toast.error(res.error?.message ?? "Failed to remove board.");
        return;
      }

      setBoard(EMPTY_BOARD);
      toast.success("Starboard board removed.");
      await fetchConfig();
    } finally {
      setSaving(false);
    }
  }

  async function moderate(action: "approve" | "deny", entry: StarboardEntry) {
    if (!canModerate) return;

    const endpoint = `starboard/entries/${entry.boardId}/${entry.sourceMessageId}/${action}`;
    const res = await fetchApi(guildId, endpoint, { method: "POST", body: JSON.stringify({}) });
    if (!res.success) {
      toast.error(res.error?.message ?? `Failed to ${action} entry.`);
      return;
    }

    toast.success(action === "approve" ? "Entry approved." : "Entry denied.");
    await fetchConfig();
  }

  async function resetBackendData() {
    if (!canManage) return;

    setResetting(true);
    try {
      const res = await fetchApi<{ deletedConfigs: number; deletedEntries: number }>(guildId, "starboard/testing/reset-backend", {
        method: "DELETE",
      });

      if (!res.success) {
        toast.error(res.error?.message ?? "Failed to reset starboard backend data.");
        return;
      }

      setShowResetModal(false);
      toast.success(`Starboard backend reset complete (${res.data?.deletedEntries ?? 0} entries removed).`);
      await fetchConfig();
    } finally {
      setResetting(false);
    }
  }

  const topEmojiSuggestions = useMemo(() => serverEmojis.slice(0, 10), [serverEmojis]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Starboard Configuration</CardTitle>
            <CardDescription>This dashboard currently manages one board configuration (emoji, channel, threshold, and moderation).</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextInput label="Board Name" value={board.name} onChange={(value) => setBoard((prev) => ({ ...prev, name: value }))} disabled={!canManage || saving} />

          <TextInput
            label="Reaction Emoji"
            description="Use a Unicode emoji (⭐) or a custom emoji format like <:name:id>."
            value={board.emoji}
            onChange={(value) => setBoard((prev) => ({ ...prev, emoji: value }))}
            disabled={!canManage || saving}
          />

          <div className="-mt-2">
            <p className="text-xs text-zinc-500">Selected emoji</p>
            <div className="mt-1 inline-flex rounded-lg border border-zinc-700/50 bg-zinc-900/40 px-2 py-1">
              <DiscordEmoji value={board.emoji} size={16} />
            </div>
          </div>

          {topEmojiSuggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">Server emoji quick pick</p>
              <div className="flex flex-wrap gap-2">
                {topEmojiSuggestions.map((emoji) => (
                  <button
                    key={emoji.id}
                    type="button"
                    onClick={() => setBoard((prev) => ({ ...prev, emoji: emoji.identifier }))}
                    disabled={!canManage || saving}
                    className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 px-2 py-1 text-sm text-zinc-200 transition hover:border-zinc-600 disabled:opacity-50">
                    <DiscordEmoji value={emoji.identifier} size={16} withLabel label={emoji.name} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <ChannelCombobox
            guildId={guildId}
            value={board.channelId}
            onChange={(value) => setBoard((prev) => ({ ...prev, channelId: value }))}
            channelType="text"
            label="Starboard Channel"
            description="Where approved starboard posts are sent."
            disabled={!canManage || saving}
          />

          <NumberInput
            label="Threshold"
            description="Minimum matching reactions needed to qualify."
            value={board.threshold}
            min={1}
            max={100}
            onChange={(value) => setBoard((prev) => ({ ...prev, threshold: Number.isFinite(value) ? value : prev.threshold }))}
            disabled={!canManage || saving}
          />

          <Toggle label="Enabled" checked={board.enabled} onChange={(checked) => setBoard((prev) => ({ ...prev, enabled: checked }))} disabled={!canManage || saving} />
          <Toggle label="Allow self-stars" checked={board.selfStar} onChange={(checked) => setBoard((prev) => ({ ...prev, selfStar: checked }))} disabled={!canManage || saving} />
          <Toggle label="Remove below threshold" checked={board.removeOnUnreact} onChange={(checked) => setBoard((prev) => ({ ...prev, removeOnUnreact: checked }))} disabled={!canManage || saving} />
          <Toggle label="Allow NSFW source channels" checked={board.allowNSFW} onChange={(checked) => setBoard((prev) => ({ ...prev, allowNSFW: checked }))} disabled={!canManage || saving} />
          <Toggle
            label="Post as embed"
            description="When off, the bot forwards the message as plain text instead of using an embed card."
            checked={board.postAsEmbed}
            onChange={(checked) => setBoard((prev) => ({ ...prev, postAsEmbed: checked }))}
            disabled={!canManage || saving}
          />

          <Toggle
            label="Require moderation approval"
            description="Candidates go to a moderation channel with Approve/Deny buttons before posting."
            checked={board.moderationEnabled}
            onChange={(checked) => setBoard((prev) => ({ ...prev, moderationEnabled: checked }))}
            disabled={!canManage || saving}
          />

          {board.moderationEnabled && (
            <ChannelCombobox
              guildId={guildId}
              value={board.moderationChannelId ?? ""}
              onChange={(value) => setBoard((prev) => ({ ...prev, moderationChannelId: value }))}
              channelType="text"
              label="Moderation Channel"
              description="Queue channel where staff approve or deny candidates."
              disabled={!canManage || saving}
            />
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => void saveBoard()}
              disabled={!canManage || saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-500 disabled:opacity-50">
              {saving ? "Saving..." : hasBoard ? "Save Configuration" : "Create Configuration"}
            </button>

            {hasBoard && (
              <button
                type="button"
                onClick={() => void deleteBoard()}
                disabled={!canManage || saving}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
                Delete Board
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Moderation Queue</CardTitle>
            <CardDescription>Pending starboard candidates awaiting approval.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {pendingEntries.length === 0 ? (
            <p className="text-sm text-zinc-400">No pending entries.</p>
          ) : (
            <div className="space-y-3">
              {pendingEntries.map((entry) => (
                <div
                  key={`${entry.boardId}:${entry.sourceMessageId}`}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-700/40 bg-zinc-900/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-zinc-200">
                    <p>
                      <span className="text-zinc-400">Message:</span> {entry.sourceMessageId}
                    </p>
                    <p>
                      <span className="text-zinc-400">Channel:</span> {entry.sourceChannelId}
                    </p>
                    <p>
                      <span className="text-zinc-400">Count:</span> {entry.count}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void moderate("approve", entry)}
                      disabled={!canModerate}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50">
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void moderate("deny", entry)}
                      disabled={!canModerate}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent Starboard Entries</CardTitle>
            <CardDescription>Tracks messages currently linked to the starboard system.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {recentEntries.length === 0 ? (
            <p className="text-sm text-zinc-400">No posted entries yet.</p>
          ) : (
            <div className="space-y-3">
              {recentEntries.map((entry) => {
                const postUrl = entry.starboardChannelId && entry.starboardMessageId ? `https://discord.com/channels/${guildId}/${entry.starboardChannelId}/${entry.starboardMessageId}` : null;

                return (
                  <div key={`${entry.boardId}:${entry.sourceMessageId}:${entry.updatedAt}`} className="rounded-xl border border-zinc-700/40 bg-zinc-900/30 p-4 text-sm text-zinc-200">
                    <p>
                      <span className="text-zinc-400">Source:</span> {entry.sourceMessageId}
                    </p>
                    <p>
                      <span className="text-zinc-400">Count:</span> {entry.count}
                    </p>
                    <p>
                      <span className="text-zinc-400">Status:</span> {entry.status}
                    </p>
                    {postUrl && (
                      <a href={postUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex text-xs text-primary-400 transition hover:text-primary-300">
                        Open Starboard Post
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Danger Zone</CardTitle>
            <CardDescription>Testing utility to wipe Starboard database records for this guild.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-300">This deletes Starboard backend data (configuration and tracked entries) for this guild. Existing Discord messages are not deleted.</p>
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              disabled={!canManage || resetting}
              className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
              {resetting ? "Resetting..." : "Reset Starboard Backend Data"}
            </button>
          </div>
        </CardContent>
      </Card>

      <Modal
        open={showResetModal}
        onClose={() => {
          if (!resetting) setShowResetModal(false);
        }}
        title="Reset Starboard Backend Data"
        maxWidth="max-w-md"
        footer={
          <>
            <button onClick={() => setShowResetModal(false)} disabled={resetting} className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 disabled:opacity-50">
              Cancel
            </button>
            <button
              onClick={() => void resetBackendData()}
              disabled={!canManage || resetting}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50">
              {resetting ? "Resetting..." : "Delete Backend Data"}
            </button>
          </>
        }>
        <p className="text-sm text-zinc-300">This action removes Starboard configuration and entry records for this guild only.</p>
        <p className="mt-2 text-xs text-zinc-400">Use this for testing resets. Starboard posts already sent in Discord are not removed by this action.</p>
      </Modal>
    </div>
  );
}
