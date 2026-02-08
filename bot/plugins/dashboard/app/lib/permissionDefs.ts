/**
 * Permission Definitions — Static registry of all dashboard permission categories and actions.
 *
 * This is the single source of truth for what permissions exist. Both the
 * bot-side resolver and the dashboard settings UI import from here.
 */

export interface PermissionAction {
  /** Unique key within the category, e.g. "manage_config" */
  key: string;
  /** Human-readable label, e.g. "Manage Configuration" */
  label: string;
  /** Brief explanation of what this action allows */
  description: string;
}

export interface PermissionCategory {
  /** Unique category key, e.g. "minecraft" */
  key: string;
  /** Human-readable label, e.g. "Minecraft" */
  label: string;
  /** Brief explanation of the category */
  description: string;
  /** Individual actions within the category */
  actions: PermissionAction[];
}

export const permissionCategories: PermissionCategory[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Control who can manage dashboard permissions and settings.",
    actions: [
      { key: "manage_permissions", label: "Manage Permissions", description: "Add, edit, or remove role permission overrides." },
      { key: "manage_settings", label: "Manage Settings", description: "Toggle dashboard display settings like hiding denied features." },
    ],
  },
  {
    key: "minecraft",
    label: "Minecraft",
    description: "Manage the Minecraft integration, players, and server settings.",
    actions: [
      { key: "view_players", label: "View Players", description: "View the player list and player details." },
      { key: "manage_players", label: "Manage Players", description: "Edit or remove players from the whitelist." },
      { key: "manage_config", label: "Manage Configuration", description: "Edit Minecraft plugin configuration." },
      { key: "approve_whitelist", label: "Approve Whitelist", description: "Approve or deny pending whitelist requests." },
      { key: "manage_status", label: "Manage Status", description: "Start, stop, or restart the Minecraft server." },
      { key: "use_rcon", label: "Use RCON", description: "Send commands to the server via RCON." },
    ],
  },
  {
    key: "tickets",
    label: "Tickets",
    description: "Manage support ticket settings and view ticket data.",
    actions: [
      { key: "view_tickets", label: "View Tickets", description: "View ticket transcripts and statistics." },
      { key: "manage_tickets", label: "Manage Tickets", description: "Close, delete, or modify tickets." },
      { key: "manage_categories", label: "Manage Categories", description: "Create, edit, or delete ticket categories." },
      { key: "manage_openers", label: "Manage Openers", description: "Configure ticket opener panels and settings." },
    ],
  },
  {
    key: "modmail",
    label: "Modmail",
    description: "Manage modmail conversations and configuration.",
    actions: [
      { key: "view_conversations", label: "View Conversations", description: "Read modmail conversations and logs." },
      { key: "manage_config", label: "Manage Configuration", description: "Edit modmail settings and snippets." },
    ],
  },
  {
    key: "suggestions",
    label: "Suggestions",
    description: "Manage the suggestion system and review submissions.",
    actions: [
      { key: "view_suggestions", label: "View Suggestions", description: "View submitted suggestions." },
      { key: "manage_suggestions", label: "Manage Suggestions", description: "Approve, deny, or edit suggestions." },
      { key: "manage_config", label: "Manage Configuration", description: "Edit suggestion system settings." },
      { key: "manage_categories", label: "Manage Categories", description: "Create, edit, or delete suggestion categories." },
    ],
  },
  {
    key: "tags",
    label: "Tags",
    description: "Manage reusable tag/response content.",
    actions: [
      { key: "view_tags", label: "View Tags", description: "View the list of tags and their content." },
      { key: "manage_tags", label: "Manage Tags", description: "Create, edit, or delete tags." },
    ],
  },
  {
    key: "logging",
    label: "Logging",
    description: "Configure event logging channels and categories.",
    actions: [
      { key: "view_config", label: "View Configuration", description: "View the current logging configuration." },
      { key: "manage_config", label: "Manage Configuration", description: "Edit logging channels and subcategory toggles." },
    ],
  },
  {
    key: "welcome",
    label: "Welcome",
    description: "Configure welcome messages and auto-role on join.",
    actions: [
      { key: "view_config", label: "View Configuration", description: "View the current welcome configuration." },
      { key: "manage_config", label: "Manage Configuration", description: "Edit welcome messages, channels, and roles." },
    ],
  },
  {
    key: "tempvc",
    label: "Temporary Voice Channels",
    description: "Configure temporary voice channel creation and settings.",
    actions: [
      { key: "view_config", label: "View Configuration", description: "View the current Temp VC configuration." },
      { key: "manage_config", label: "Manage Configuration", description: "Edit Temp VC settings and generators." },
    ],
  },
  {
    key: "reminders",
    label: "Reminders",
    description: "View and manage server reminders.",
    actions: [
      { key: "view_reminders", label: "View Reminders", description: "View scheduled reminders." },
      { key: "manage_reminders", label: "Manage Reminders", description: "Create, edit, or delete reminders." },
    ],
  },
  {
    key: "vc-transcription",
    label: "Voice Transcription",
    description: "Configure voice message transcription settings.",
    actions: [
      { key: "view_config", label: "View Configuration", description: "View the current transcription configuration." },
      { key: "manage_config", label: "Manage Configuration", description: "Edit transcription mode, provider, model, filters, and API keys." },
    ],
  },
  {
    key: "attachment-blocker",
    label: "Attachment Blocker",
    description: "Configure attachment blocking rules and channel overrides.",
    actions: [
      { key: "view_config", label: "View Configuration", description: "View the current attachment blocker configuration and channel overrides." },
      { key: "manage_config", label: "Manage Configuration", description: "Edit global settings, channel overrides, and opener overrides." },
    ],
  },
  {
    key: "moderation",
    label: "Moderation",
    description: "Manage automod rules, infractions, escalation tiers, and moderation settings.",
    actions: [
      { key: "view_config", label: "View Configuration", description: "View automod rules, infractions, and moderation settings." },
      { key: "manage_rules", label: "Manage Rules", description: "Create, edit, delete, and toggle automod rules." },
      { key: "manage_infractions", label: "Manage Infractions", description: "View and clear user infractions." },
      { key: "manage_config", label: "Manage Configuration", description: "Edit moderation settings, escalation tiers, and immune roles." },
      { key: "manage_presets", label: "Manage Presets", description: "Install and uninstall preset automod rules." },
    ],
  },
];

/**
 * Build a flat set of all valid action keys for quick lookup.
 * E.g. "minecraft.view_players", "dashboard.manage_permissions"
 */
export function getAllActionKeys(): Set<string> {
  const keys = new Set<string>();
  for (const cat of permissionCategories) {
    for (const action of cat.actions) {
      keys.add(`${cat.key}.${action.key}`);
    }
  }
  return keys;
}

/**
 * Get all category keys.
 */
export function getAllCategoryKeys(): Set<string> {
  return new Set(permissionCategories.map((c) => c.key));
}
