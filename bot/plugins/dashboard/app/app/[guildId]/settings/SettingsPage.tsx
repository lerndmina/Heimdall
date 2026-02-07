/**
 * SettingsPage — Client component for managing dashboard permissions and settings.
 *
 * Two sections:
 * 1. General settings (hideDeniedFeatures toggle)
 * 2. Role permissions editor (role list + Discord-style permission grid)
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import Toggle from "@/components/ui/Toggle";
import Combobox from "@/components/ui/Combobox";
import TriStateSlider, { type TriState } from "@/components/ui/TriStateSlider";
import Spinner from "@/components/ui/Spinner";
import { fetchApi } from "@/lib/api";
import { permissionCategories } from "@/lib/permissionDefs";
import { usePermissions } from "@/components/providers/PermissionsProvider";

interface Role {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface PermissionDoc {
  guildId: string;
  discordRoleId: string;
  roleName: string;
  overrides: Record<string, "allow" | "deny">;
}

interface SettingsPageProps {
  guildId: string;
}

export default function SettingsPage({ guildId }: SettingsPageProps) {
  const { isOwner, isAdministrator, permissions, refresh: refreshUserPerms } = usePermissions();
  const canManagePermissions = isOwner || permissions["dashboard.manage_permissions"];
  const canManageSettings = isOwner || permissions["dashboard.manage_settings"];

  // ── State ────────────────────────────────────────────────
  const [roles, setRoles] = useState<Role[]>([]);
  const [permDocs, setPermDocs] = useState<PermissionDoc[]>([]);
  const [hideDeniedFeatures, setHideDeniedFeatures] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // ── Load data ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes, settingsRes] = await Promise.all([
        fetchApi<{ roles: Role[] }>(guildId, "roles"),
        fetchApi<{ permissions: PermissionDoc[] }>(guildId, "dashboard-permissions"),
        fetchApi<{ settings: { hideDeniedFeatures: boolean } }>(guildId, "dashboard-settings"),
      ]);

      if (rolesRes.success && rolesRes.data) setRoles(rolesRes.data.roles);
      if (permsRes.success && permsRes.data) setPermDocs(permsRes.data.permissions);
      if (settingsRes.success && settingsRes.data) setHideDeniedFeatures(settingsRes.data.settings.hideDeniedFeatures);
    } catch {
      showToast("Failed to load settings", "error");
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Helpers ──────────────────────────────────────────────
  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const selectedDoc = permDocs.find((d) => d.discordRoleId === selectedRoleId);
  const overrides = selectedDoc?.overrides ?? {};

  function getActionState(categoryKey: string, actionKey: string): TriState {
    const fullKey = `${categoryKey}.${actionKey}`;
    if (overrides[fullKey] === "allow") return "allow";
    if (overrides[fullKey] === "deny") return "deny";
    return "inherit";
  }

  function getCategoryState(categoryKey: string): { state: TriState; mixed: boolean } {
    const cat = permissionCategories.find((c) => c.key === categoryKey);
    if (!cat) return { state: "inherit", mixed: false };

    // Check category-level override first
    const catOverride = overrides[categoryKey];

    // Check action-level overrides
    const actionStates = cat.actions.map((a) => {
      const fullKey = `${categoryKey}.${a.key}`;
      return overrides[fullKey] ?? null;
    });

    const hasActionOverrides = actionStates.some((s) => s !== null);

    if (!hasActionOverrides && catOverride) {
      return { state: catOverride as TriState, mixed: false };
    }

    if (hasActionOverrides) {
      // Compute effective states
      const effective = cat.actions.map((a) => {
        const fullKey = `${categoryKey}.${a.key}`;
        const actionVal = overrides[fullKey];
        if (actionVal) return actionVal;
        if (catOverride) return catOverride;
        return "inherit";
      });
      const unique = new Set(effective);
      if (unique.size === 1) return { state: effective[0] as TriState, mixed: false };
      return { state: "inherit", mixed: true };
    }

    return { state: "inherit", mixed: false };
  }

  // ── Save overrides ──────────────────────────────────────
  async function saveOverrides(roleId: string, newOverrides: Record<string, "allow" | "deny">) {
    setSaving(true);
    const role = roles.find((r) => r.id === roleId);
    try {
      const res = await fetchApi(guildId, `dashboard-permissions/${roleId}`, {
        method: "PUT",
        body: JSON.stringify({ roleName: role?.name ?? roleId, overrides: newOverrides }),
      });
      if (res.success) {
        setPermDocs((prev) => {
          const idx = prev.findIndex((d) => d.discordRoleId === roleId);
          const updated: PermissionDoc = {
            guildId,
            discordRoleId: roleId,
            roleName: role?.name ?? roleId,
            overrides: newOverrides,
          };
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = updated;
            return copy;
          }
          return [...prev, updated];
        });
        showToast("Permissions saved", "success");
      } else {
        showToast("Failed to save permissions", "error");
      }
    } catch {
      showToast("Failed to save permissions", "error");
    } finally {
      setSaving(false);
    }
  }

  function setActionState(categoryKey: string, actionKey: string, state: TriState) {
    const fullKey = `${categoryKey}.${actionKey}`;
    const newOverrides = { ...overrides };
    if (state === "inherit") {
      delete newOverrides[fullKey];
    } else {
      newOverrides[fullKey] = state;
    }
    saveOverrides(selectedRoleId, newOverrides);
  }

  function setCategoryState(categoryKey: string, state: TriState) {
    const cat = permissionCategories.find((c) => c.key === categoryKey);
    if (!cat) return;

    const newOverrides = { ...overrides };

    // Remove all action-level overrides for this category
    for (const action of cat.actions) {
      delete newOverrides[`${categoryKey}.${action.key}`];
    }

    if (state === "inherit") {
      // Remove category-level override too
      delete newOverrides[categoryKey];
    } else {
      newOverrides[categoryKey] = state;
    }
    saveOverrides(selectedRoleId, newOverrides);
  }

  // ── Delete role overrides ────────────────────────────────
  async function deleteRoleOverrides(roleId: string) {
    try {
      const res = await fetchApi(guildId, `dashboard-permissions/${roleId}`, { method: "DELETE" });
      if (res.success) {
        setPermDocs((prev) => prev.filter((d) => d.discordRoleId !== roleId));
        if (selectedRoleId === roleId) setSelectedRoleId("");
        showToast("Role permissions removed", "success");
      }
    } catch {
      showToast("Failed to delete role permissions", "error");
    }
  }

  // ── Save settings ───────────────────────────────────────
  async function saveSettings(hide: boolean) {
    try {
      const res = await fetchApi(guildId, "dashboard-settings", {
        method: "PUT",
        body: JSON.stringify({ hideDeniedFeatures: hide }),
      });
      if (res.success) {
        setHideDeniedFeatures(hide);
        showToast("Settings saved", "success");
      }
    } catch {
      showToast("Failed to save settings", "error");
    }
  }

  // ── Refresh permissions ──────────────────────────────────
  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadData(), refreshUserPerms()]);
    setRefreshing(false);
    showToast("Permissions refreshed", "success");
  }

  // ── Toggle category expand ──────────────────────────────
  function toggleCategory(key: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── Roles that already have overrides ───────────────────
  const configuredRoleIds = new Set(permDocs.map((d) => d.discordRoleId));
  const availableRoles = roles.filter((r) => !configuredRoleIds.has(r.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (!canManagePermissions && !canManageSettings) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
          <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-zinc-200">Access Denied</h2>
        <p className="mt-1 text-sm text-zinc-500">You don't have permission to manage dashboard settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Dashboard Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">Configure dashboard permissions and display settings.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50">
          <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? "Refreshing…" : "Refresh Permissions"}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-lg border px-4 py-3 text-sm shadow-lg transition-all ${
            toast.type === "success" ? "border-emerald-800 bg-emerald-900/80 text-emerald-200" : "border-red-800 bg-red-900/80 text-red-200"
          }`}>
          {toast.message}
        </div>
      )}

      {/* General Settings */}
      {canManageSettings && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Control how the dashboard appears for users with limited permissions.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Toggle
              label="Hide denied features"
              description="When enabled, sidebar items the user cannot access are hidden entirely. When disabled, they appear grayed out with a lock icon."
              checked={hideDeniedFeatures}
              onChange={(v) => saveSettings(v)}
            />
          </CardContent>
        </Card>
      )}

      {/* Role Permissions */}
      {canManagePermissions && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Role Permissions</CardTitle>
              <CardDescription>Configure which Discord roles can access dashboard features.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              {/* Left panel — Role list */}
              <div className="w-64 shrink-0 space-y-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Add Role</p>
                  <Combobox
                    options={availableRoles.map((r) => ({ value: r.id, label: r.name }))}
                    value=""
                    onChange={(roleId) => {
                      setSelectedRoleId(roleId);
                      // Create empty overrides for the role
                      const role = roles.find((r) => r.id === roleId);
                      if (role && !configuredRoleIds.has(roleId)) {
                        saveOverrides(roleId, {});
                      }
                    }}
                    placeholder="Select a role…"
                    searchPlaceholder="Search roles…"
                    emptyMessage="No roles available"
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Configured Roles</p>
                  {permDocs.length === 0 && <p className="py-4 text-center text-xs text-zinc-600">No roles configured yet.</p>}
                  {permDocs.map((doc) => {
                    const role = roles.find((r) => r.id === doc.discordRoleId);
                    const isSelected = doc.discordRoleId === selectedRoleId;
                    return (
                      <button
                        key={doc.discordRoleId}
                        onClick={() => setSelectedRoleId(doc.discordRoleId)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                          isSelected ? "bg-primary-500/10 text-primary-400" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        }`}>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: role?.color ?? "#99aab5" }} />
                          <span className="truncate">{doc.roleName}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRoleOverrides(doc.discordRoleId);
                          }}
                          className="text-zinc-600 transition hover:text-red-400"
                          title="Remove role permissions">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right panel — Permission grid */}
              <div className="min-w-0 flex-1">
                {!selectedRoleId ? (
                  <div className="flex items-center justify-center py-20 text-zinc-600">
                    <p className="text-sm">Select a role to configure permissions</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {saving && (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <Spinner /> Saving…
                      </div>
                    )}
                    {permissionCategories.map((cat) => {
                      const isExpanded = expandedCategories.has(cat.key);
                      const { state: catState, mixed } = getCategoryState(cat.key);

                      return (
                        <div key={cat.key} className="rounded-lg border border-zinc-800 bg-zinc-900/50">
                          {/* Category header */}
                          <div className="flex items-center justify-between px-4 py-3">
                            <button onClick={() => toggleCategory(cat.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                              <svg className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-zinc-200">{cat.label}</p>
                                <p className="text-xs text-zinc-500">{cat.description}</p>
                              </div>
                            </button>
                            <TriStateSlider value={catState} onChange={(v) => setCategoryState(cat.key, v)} mixed={mixed} />
                          </div>

                          {/* Action rows */}
                          {isExpanded && (
                            <div className="border-t border-zinc-800">
                              {cat.actions.map((action) => {
                                const actionState = getActionState(cat.key, action.key);
                                return (
                                  <div key={action.key} className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-2.5 pl-10 last:border-b-0">
                                    <div className="min-w-0">
                                      <p className="text-sm text-zinc-300">{action.label}</p>
                                      <p className="text-xs text-zinc-600">{action.description}</p>
                                    </div>
                                    <TriStateSlider value={actionState} onChange={(v) => setActionState(cat.key, action.key, v)} />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
