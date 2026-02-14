const INTEGRATION_SEGMENT_TO_PLUGIN: Record<string, string> = {
  minecraft: "minecraft",
  modmail: "modmail",
  tickets: "tickets",
  suggestions: "suggestions",
  tags: "tags",
  rolebuttons: "rolebuttons",
  logging: "logging",
  welcome: "welcome",
  tempvc: "tempvc",
  reminders: "reminders",
  "vc-transcription": "vc-transcription",
  "attachment-blocker": "attachment-blocker",
  moderation: "moderation",
};

export function getIntegrationPluginFromSegment(segment: string | undefined): string | null {
  if (!segment) return null;
  return INTEGRATION_SEGMENT_TO_PLUGIN[segment] ?? null;
}

export function parseEnabledPlugins(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPluginEnabled(enabledPlugins: Set<string>, pluginName: string | null): boolean {
  if (!pluginName) return true;
  return enabledPlugins.has(pluginName.toLowerCase());
}
