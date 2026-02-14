"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import TextInput from "@/components/ui/TextInput";
import Textarea from "@/components/ui/Textarea";
import Toggle from "@/components/ui/Toggle";
import NumberInput from "@/components/ui/NumberInput";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import Combobox from "@/components/ui/Combobox";
import RoleCombobox from "@/components/ui/RoleCombobox";
import ChannelCombobox from "@/components/ui/ChannelCombobox";
import { useCanManage } from "@/components/providers/PermissionsProvider";
import { useSession } from "next-auth/react";
import { fetchApi } from "@/lib/api";
import { useRealtimeEvent } from "@/hooks/useRealtimeEvent";
import { toast } from "sonner";

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface PanelEmbed {
  title?: string;
  description?: string;
  color?: string;
  image?: string;
  thumbnail?: string;
  footer?: string;
  fields?: EmbedField[];
}

interface PanelButton {
  id: string;
  label: string;
  emoji?: string;
  style: number;
  roleId: string;
  mode: "toggle" | "add" | "remove";
  row: number;
}

interface PanelPost {
  channelId: string;
  messageId: string;
  postedAt: string;
  postedBy: string;
}

interface Panel {
  id: string;
  guildId: string;
  name: string;
  embed: PanelEmbed;
  buttons: PanelButton[];
  exclusive: boolean;
  posts: PanelPost[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const styleOptions = [
  { value: "1", label: "Primary" },
  { value: "2", label: "Secondary" },
  { value: "3", label: "Success" },
  { value: "4", label: "Danger" },
];

const modeOptions = [
  { value: "toggle", label: "Toggle" },
  { value: "add", label: "Add-only" },
  { value: "remove", label: "Remove-only" },
];

export default function RoleButtonsPage({ guildId }: { guildId: string }) {
  const canManage = useCanManage("rolebuttons.manage");
  const { data: session } = useSession();

  const [panels, setPanels] = useState<Panel[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const [postOpen, setPostOpen] = useState(false);
  const [postChannelId, setPostChannelId] = useState("");

  const selected = useMemo(() => panels.find((panel) => panel.id === selectedId) ?? null, [panels, selectedId]);

  const [draft, setDraft] = useState<Panel | null>(null);

  const loadPanels = useCallback(async () => {
    setLoading(true);
    const res = await fetchApi<Panel[]>(guildId, "rolebuttons", { skipCache: true });
    if (!res.success || !res.data) {
      toast.error(res.error?.message ?? "Failed to load role button panels");
      setLoading(false);
      return;
    }

    setPanels(res.data);
    const nextId = selectedId && res.data.some((panel) => panel.id === selectedId) ? selectedId : (res.data[0]?.id ?? "");
    setSelectedId(nextId);
    setLoading(false);
  }, [guildId, selectedId]);

  useEffect(() => {
    loadPanels();
  }, [loadPanels]);

  useEffect(() => {
    setDraft(selected ? JSON.parse(JSON.stringify(selected)) : null);
  }, [selected]);

  useRealtimeEvent("rolebuttons:updated", () => {
    loadPanels();
  });

  const createPanel = async () => {
    if (!newName.trim()) return;
    const res = await fetchApi<Panel>(guildId, "rolebuttons", {
      method: "POST",
      body: JSON.stringify({
        name: newName.trim(),
        createdBy: session?.user?.id ?? "dashboard",
      }),
    });

    if (!res.success || !res.data) {
      toast.error(res.error?.message ?? "Failed to create panel");
      return;
    }

    setCreateOpen(false);
    setNewName("");
    setSelectedId(res.data.id);
    toast.success("Panel created");
    loadPanels();
  };

  const savePanel = async () => {
    if (!draft) return;
    if ((draft.buttons ?? []).length > 25) {
      toast.error("Maximum 25 buttons allowed");
      return;
    }

    setSaving(true);
    const res = await fetchApi<Panel>(guildId, `rolebuttons/${draft.id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: draft.name,
        embed: draft.embed,
        buttons: draft.buttons,
        exclusive: draft.exclusive,
      }),
    });
    setSaving(false);

    if (!res.success || !res.data) {
      toast.error(res.error?.message ?? "Failed to save panel");
      return;
    }

    toast.success("Panel saved");
    loadPanels();
  };

  const postPanel = async () => {
    if (!draft || !postChannelId) return;
    const res = await fetchApi(guildId, `rolebuttons/${draft.id}/post`, {
      method: "POST",
      body: JSON.stringify({ channelId: postChannelId, postedBy: session?.user?.id ?? "dashboard" }),
    });

    if (!res.success) {
      toast.error(res.error?.message ?? "Failed to post panel");
      return;
    }

    setPostOpen(false);
    setPostChannelId("");
    toast.success("Panel posted");
    loadPanels();
  };

  const updatePosts = async () => {
    if (!draft) return;
    const res = await fetchApi(guildId, `rolebuttons/${draft.id}/update-posts`, { method: "POST" });
    if (!res.success) {
      toast.error(res.error?.message ?? "Failed to update posted messages");
      return;
    }
    toast.success("Posted messages updated");
    loadPanels();
  };

  const deletePanel = async () => {
    if (!draft) return;
    const res = await fetchApi(guildId, `rolebuttons/${draft.id}?deletePosts=true`, { method: "DELETE" });
    if (!res.success) {
      toast.error(res.error?.message ?? "Failed to delete panel");
      return;
    }
    toast.success("Panel deleted");
    setDraft(null);
    setSelectedId("");
    loadPanels();
  };

  const deletePost = async (messageId: string) => {
    if (!draft) return;
    const res = await fetchApi(guildId, `rolebuttons/${draft.id}/posts/${messageId}`, { method: "DELETE" });
    if (!res.success) {
      toast.error(res.error?.message ?? "Failed to delete posted instance");
      return;
    }
    loadPanels();
  };

  const addButton = () => {
    if (!draft) return;
    const next = {
      ...draft,
      buttons: [
        ...(draft.buttons ?? []),
        {
          id: crypto.randomUUID(),
          label: "New Button",
          style: 2,
          roleId: "",
          mode: "toggle" as const,
          row: 0,
        },
      ],
    };
    setDraft(next);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner label="Loading role button panels…" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <div className="flex items-center justify-between">
          <CardTitle>Panels</CardTitle>
          {canManage && (
            <button onClick={() => setCreateOpen(true)} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500">
              Create New
            </button>
          )}
        </div>
        <CardContent className="space-y-2">
          {panels.length === 0 ? (
            <CardDescription>No panels yet.</CardDescription>
          ) : (
            panels.map((panel) => (
              <button
                key={panel.id}
                onClick={() => setSelectedId(panel.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${selectedId === panel.id ? "border-primary-500/50 bg-primary-500/10" : "border-zinc-700/30 hover:bg-white/5"}`}>
                <div className="text-sm font-medium text-zinc-100">{panel.name}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {panel.buttons.length} buttons • {panel.posts.length} posts
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        {!draft ? (
          <CardContent>
            <CardDescription>Select or create a role button panel to edit.</CardDescription>
          </CardContent>
        ) : (
          <CardContent className="space-y-6">
            <TextInput label="Panel Name" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} disabled={!canManage} />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-zinc-200">Embed</h3>
              <TextInput label="Title" value={draft.embed?.title ?? ""} onChange={(value) => setDraft({ ...draft, embed: { ...draft.embed, title: value } })} disabled={!canManage} />
              <Textarea
                label="Description"
                value={draft.embed?.description ?? ""}
                onChange={(value) => setDraft({ ...draft, embed: { ...draft.embed, description: value } })}
                disabled={!canManage}
                rows={4}
              />
              <TextInput label="Color (hex)" value={draft.embed?.color ?? ""} onChange={(value) => setDraft({ ...draft, embed: { ...draft.embed, color: value } })} disabled={!canManage} />
              <TextInput label="Image URL" value={draft.embed?.image ?? ""} onChange={(value) => setDraft({ ...draft, embed: { ...draft.embed, image: value } })} disabled={!canManage} />
              <TextInput label="Thumbnail URL" value={draft.embed?.thumbnail ?? ""} onChange={(value) => setDraft({ ...draft, embed: { ...draft.embed, thumbnail: value } })} disabled={!canManage} />
              <TextInput label="Footer" value={draft.embed?.footer ?? ""} onChange={(value) => setDraft({ ...draft, embed: { ...draft.embed, footer: value } })} disabled={!canManage} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">Buttons ({draft.buttons.length}/25)</h3>
                {canManage && (
                  <button onClick={addButton} className="rounded-lg border border-zinc-700/40 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5">
                    Add Button
                  </button>
                )}
              </div>

              {draft.buttons.map((button, index) => (
                <div key={button.id} className="space-y-2 rounded-lg border border-zinc-700/30 p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextInput
                      label={`Label #${index + 1}`}
                      value={button.label}
                      onChange={(value) => {
                        const next = [...draft.buttons];
                        next[index] = { ...button, label: value };
                        setDraft({ ...draft, buttons: next });
                      }}
                      disabled={!canManage}
                    />
                    <TextInput
                      label="Emoji"
                      value={button.emoji ?? ""}
                      onChange={(value) => {
                        const next = [...draft.buttons];
                        next[index] = { ...button, emoji: value };
                        setDraft({ ...draft, buttons: next });
                      }}
                      disabled={!canManage}
                    />
                    <RoleCombobox
                      guildId={guildId}
                      value={button.roleId}
                      onChange={(value) => {
                        const next = [...draft.buttons];
                        next[index] = { ...button, roleId: value };
                        setDraft({ ...draft, buttons: next });
                      }}
                      label="Role"
                      disabled={!canManage}
                    />
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-zinc-200">Style</p>
                      <Combobox
                        options={styleOptions}
                        value={String(button.style)}
                        onChange={(value) => {
                          const next = [...draft.buttons];
                          next[index] = { ...button, style: Number(value) };
                          setDraft({ ...draft, buttons: next });
                        }}
                        disabled={!canManage}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-zinc-200">Mode</p>
                      <Combobox
                        options={modeOptions}
                        value={button.mode}
                        onChange={(value) => {
                          const next = [...draft.buttons];
                          next[index] = { ...button, mode: value as PanelButton["mode"] };
                          setDraft({ ...draft, buttons: next });
                        }}
                        disabled={!canManage}
                      />
                    </div>
                    <NumberInput
                      label="Row"
                      value={button.row}
                      min={0}
                      max={4}
                      onChange={(value) => {
                        const next = [...draft.buttons];
                        next[index] = { ...button, row: Number(value) || 0 };
                        setDraft({ ...draft, buttons: next });
                      }}
                      disabled={!canManage}
                    />
                  </div>
                  {canManage && (
                    <button
                      onClick={() => {
                        const next = draft.buttons.filter((entry) => entry.id !== button.id);
                        setDraft({ ...draft, buttons: next });
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10">
                      Remove Button
                    </button>
                  )}
                </div>
              ))}
            </div>

            <Toggle label="Exclusive" checked={draft.exclusive} onChange={(checked) => setDraft({ ...draft, exclusive: checked })} disabled={!canManage} />

            <div className="space-y-2 rounded-lg border border-zinc-700/30 p-3">
              <h3 className="text-sm font-semibold text-zinc-200">Live Preview</h3>
              <div className="rounded-lg border border-zinc-700/30 bg-zinc-900/30 p-3">
                <p className="text-sm font-semibold text-zinc-100">{draft.embed?.title || "(No title)"}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{draft.embed?.description || "(No description)"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft.buttons.map((button) => (
                    <span key={button.id} className="rounded-md border border-zinc-700/50 px-2.5 py-1 text-xs text-zinc-200">
                      {button.emoji ? `${button.emoji} ` : ""}
                      {button.label || "Button"}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-700/30 pt-3">
              <button onClick={savePanel} disabled={!canManage || saving} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50">
                Save
              </button>
              <button onClick={() => setPostOpen(true)} disabled={!canManage} className="rounded-lg border border-zinc-700/40 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50">
                Post to Channel
              </button>
              <button onClick={updatePosts} disabled={!canManage} className="rounded-lg border border-zinc-700/40 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50">
                Update Posted Messages
              </button>
              <button onClick={deletePanel} disabled={!canManage} className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                Delete
              </button>
            </div>

            <div className="space-y-2 border-t border-zinc-700/30 pt-4">
              <h3 className="text-sm font-semibold text-zinc-200">Posted Instances</h3>
              {(draft.posts ?? []).length === 0 ? (
                <CardDescription>No posted instances.</CardDescription>
              ) : (
                draft.posts.map((post) => (
                  <div key={post.messageId} className="flex items-center justify-between rounded-lg border border-zinc-700/30 p-2">
                    <div className="text-xs text-zinc-300">
                      <div>
                        <span className="text-zinc-500">Channel:</span> {post.channelId}
                      </div>
                      <div>
                        <span className="text-zinc-500">Posted:</span> {new Date(post.postedAt).toLocaleString()}
                      </div>
                    </div>
                    {canManage && (
                      <button onClick={() => deletePost(post.messageId)} className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10">
                        Delete
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Role Button Panel"
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} className="rounded-lg border border-zinc-700/40 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5">
              Cancel
            </button>
            <button onClick={createPanel} disabled={!newName.trim()} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50">
              Create
            </button>
          </>
        }>
        <TextInput label="Panel name" value={newName} onChange={setNewName} placeholder="Color Roles" />
      </Modal>

      <Modal
        open={postOpen}
        onClose={() => setPostOpen(false)}
        title="Post Panel"
        footer={
          <>
            <button onClick={() => setPostOpen(false)} className="rounded-lg border border-zinc-700/40 px-4 py-2 text-sm text-zinc-200 hover:bg-white/5">
              Cancel
            </button>
            <button onClick={postPanel} disabled={!postChannelId} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50">
              Post
            </button>
          </>
        }>
        <ChannelCombobox guildId={guildId} value={postChannelId} onChange={setPostChannelId} channelType="text" label="Channel" />
      </Modal>
    </div>
  );
}
