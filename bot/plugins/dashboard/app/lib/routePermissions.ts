/**
 * Route Permissions — Maps API route patterns to required permission action keys.
 *
 * Used by the dashboard proxy to determine which permission is needed
 * before forwarding a request to the bot API.
 */

/**
 * Route pattern → required action key.
 *
 * Patterns use `*` as a single-segment wildcard.
 * Method is prefixed: "GET /path" or "PUT /path/segment".
 *
 * Routes not listed here are allowed for any authenticated guild member
 * (e.g. overview, status checks).
 */
const routeMap: Record<string, string> = {
  // ── Dashboard permissions & settings ──
  "GET /dashboard-permissions": "dashboard.manage_permissions",
  "PUT /dashboard-permissions/*": "dashboard.manage_permissions",
  "DELETE /dashboard-permissions/*": "dashboard.manage_permissions",
  "GET /permission-defs": "dashboard.manage_permissions",
  "GET /dashboard-settings": "dashboard.manage_settings",
  "PUT /dashboard-settings": "dashboard.manage_settings",

  // ── Attachment Blocker ──
  "GET /attachment-blocker/config": "attachment-blocker.view_config",
  "PUT /attachment-blocker/config": "attachment-blocker.manage_config",
  "GET /attachment-blocker/channels": "attachment-blocker.view_config",
  "PUT /attachment-blocker/channels/*": "attachment-blocker.manage_config",
  "DELETE /attachment-blocker/channels/*": "attachment-blocker.manage_config",
  "GET /attachment-blocker/openers": "attachment-blocker.view_config",
  "PUT /attachment-blocker/openers/*": "attachment-blocker.manage_config",
  "DELETE /attachment-blocker/openers/*": "attachment-blocker.manage_config",

  // ── Minecraft ──
  "GET /minecraft/players": "minecraft.view_players",
  "GET /minecraft/players/*": "minecraft.view_players",
  "POST /minecraft/players": "minecraft.manage_players",
  "PUT /minecraft/players/*": "minecraft.manage_players",
  "DELETE /minecraft/players/*": "minecraft.manage_players",
  "POST /minecraft/players/*/approve": "minecraft.approve_whitelist",
  "POST /minecraft/players/*/deny": "minecraft.approve_whitelist",
  "GET /minecraft/config": "minecraft.manage_config",
  "PUT /minecraft/config": "minecraft.manage_config",
  "GET /minecraft/status": "minecraft.manage_status",
  "POST /minecraft/status/*": "minecraft.manage_status",
  "POST /minecraft/rcon": "minecraft.use_rcon",

  // ── Tickets ──
  "GET /tickets": "tickets.view_tickets",
  "GET /tickets/*": "tickets.view_tickets",
  "GET /tickets/stats": "tickets.view_tickets",
  "PUT /tickets/*": "tickets.manage_tickets",
  "PATCH /tickets/*": "tickets.manage_tickets",
  "DELETE /tickets/*": "tickets.manage_tickets",
  "POST /tickets/*/close": "tickets.manage_tickets",
  "PATCH /tickets/*/claim": "tickets.manage_tickets",
  "PATCH /tickets/*/unclaim": "tickets.manage_tickets",
  "PATCH /tickets/*/close": "tickets.manage_tickets",
  "GET /tickets/categories": "tickets.manage_categories",
  "POST /tickets/categories": "tickets.manage_categories",
  "PUT /tickets/categories/*": "tickets.manage_categories",
  "PATCH /tickets/categories/*": "tickets.manage_categories",
  "DELETE /tickets/categories/*": "tickets.manage_categories",
  "GET /tickets/categories/*/questions": "tickets.manage_categories",
  "POST /tickets/categories/*/questions/*": "tickets.manage_categories",
  "PATCH /tickets/categories/*/questions/*": "tickets.manage_categories",
  "DELETE /tickets/categories/*/questions/*": "tickets.manage_categories",
  "GET /tickets/openers": "tickets.manage_openers",
  "POST /tickets/openers": "tickets.manage_openers",
  "PUT /tickets/openers/*": "tickets.manage_openers",
  "PATCH /tickets/openers/*": "tickets.manage_openers",
  "DELETE /tickets/openers/*": "tickets.manage_openers",
  "PATCH /tickets/openers/*/categories": "tickets.manage_openers",
  "GET /tickets/archive-config": "tickets.manage_categories",
  "PATCH /tickets/archive-config": "tickets.manage_categories",

  // ── Modmail ──
  "GET /modmail/conversations": "modmail.view_conversations",
  "GET /modmail/conversations/*": "modmail.view_conversations",
  "GET /modmail/config": "modmail.manage_config",
  "PUT /modmail/config": "modmail.manage_config",
  "GET /modmail/stats": "modmail.view_conversations",
  "PATCH /modmail/conversations/bulk-update-categories": "modmail.manage_config",

  // ── Suggestions ──
  "GET /suggestions": "suggestions.view_suggestions",
  "GET /suggestions/*": "suggestions.view_suggestions",
  "GET /suggestions/stats": "suggestions.view_suggestions",
  "PUT /suggestions/*": "suggestions.manage_suggestions",
  "PATCH /suggestions/*/status": "suggestions.manage_suggestions",
  "POST /suggestions/*/approve": "suggestions.manage_suggestions",
  "POST /suggestions/*/deny": "suggestions.manage_suggestions",
  "GET /suggestions/config": "suggestions.manage_config",
  "PUT /suggestions/config": "suggestions.manage_config",
  "GET /suggestions/categories": "suggestions.manage_categories",
  "POST /suggestions/categories": "suggestions.manage_categories",
  "PUT /suggestions/categories/*": "suggestions.manage_categories",
  "DELETE /suggestions/categories/*": "suggestions.manage_categories",
  "PUT /suggestions/categories/reorder": "suggestions.manage_categories",
  "GET /suggestions/openers": "suggestions.manage_config",
  "DELETE /suggestions/openers/*": "suggestions.manage_config",

  // ── Tags ──
  "GET /tags": "tags.view_tags",
  "GET /tags/*": "tags.view_tags",
  "POST /tags": "tags.manage_tags",
  "PUT /tags/*": "tags.manage_tags",
  "DELETE /tags/*": "tags.manage_tags",
  "POST /tags/*/use": "tags.manage_tags",
  "PATCH /tags/*/slash-command": "tags.manage_tags",

  // ── Role Buttons ──
  "GET /rolebuttons": "rolebuttons.view",
  "GET /rolebuttons/*": "rolebuttons.view",
  "POST /rolebuttons": "rolebuttons.manage",
  "PUT /rolebuttons/*": "rolebuttons.manage",
  "DELETE /rolebuttons/*": "rolebuttons.manage",
  "POST /rolebuttons/*/post": "rolebuttons.manage",
  "POST /rolebuttons/*/update-posts": "rolebuttons.manage",
  "DELETE /rolebuttons/*/posts/*": "rolebuttons.manage",

  // ── Logging ──
  "GET /logging": "logging.view_config",
  "GET /logging/config": "logging.view_config",
  "GET /logging/events": "logging.view_config",
  "PUT /logging/config": "logging.manage_config",
  "POST /logging/config": "logging.manage_config",
  "PUT /logging/*": "logging.manage_config",
  "DELETE /logging/config": "logging.manage_config",
  "POST /logging/test": "logging.manage_config",

  // ── Welcome ──
  "GET /welcome": "welcome.view_config",
  "GET /welcome/config": "welcome.view_config",
  "GET /welcome/variables": "welcome.view_config",
  "PUT /welcome/config": "welcome.manage_config",
  "POST /welcome/config": "welcome.manage_config",
  "DELETE /welcome/config": "welcome.manage_config",
  "POST /welcome/test": "welcome.manage_config",

  // ── Temp VC ──
  "GET /tempvc": "tempvc.view_config",
  "GET /tempvc/config": "tempvc.view_config",
  "GET /tempvc/active": "tempvc.view_config",
  "GET /tempvc/stats": "tempvc.view_config",
  "PUT /tempvc/config": "tempvc.manage_config",
  "POST /tempvc/config": "tempvc.manage_config",
  "DELETE /tempvc/config": "tempvc.manage_config",
  "DELETE /tempvc/channels/*": "tempvc.manage_channels",

  // ── Reminders ──
  "GET /reminders": "reminders.view_reminders",
  "GET /reminders/*": "reminders.view_reminders",
  "POST /reminders": "reminders.manage_reminders",
  "PUT /reminders/*": "reminders.manage_reminders",
  "DELETE /reminders/*": "reminders.manage_reminders",

  // ── VC Transcription ──
  "GET /vc-transcription/config": "vc-transcription.view_config",
  "PUT /vc-transcription/config": "vc-transcription.manage_config",
  "DELETE /vc-transcription/config": "vc-transcription.manage_config",
  "GET /vc-transcription/apikey/status": "vc-transcription.view_config",
  "PUT /vc-transcription/apikey": "vc-transcription.manage_config",
  "DELETE /vc-transcription/apikey": "vc-transcription.manage_config",

  // ── Moderation ──
  "GET /moderation/config": "moderation.view_config",
  "PUT /moderation/config": "moderation.manage_config",
  "GET /moderation/rules": "moderation.view_config",
  "GET /moderation/rules/*": "moderation.view_config",
  "POST /moderation/rules": "moderation.manage_rules",
  "PUT /moderation/rules/*": "moderation.manage_rules",
  "DELETE /moderation/rules/*": "moderation.manage_rules",
  "PATCH /moderation/rules/*/toggle": "moderation.manage_rules",
  "POST /moderation/rules/test": "moderation.manage_rules",
  "GET /moderation/infractions": "moderation.manage_infractions",
  "GET /moderation/infractions/*": "moderation.manage_infractions",
  "DELETE /moderation/infractions/*": "moderation.manage_infractions",
  "GET /moderation/presets": "moderation.view_config",
  "POST /moderation/presets/*/install": "moderation.manage_presets",
  "DELETE /moderation/presets/*": "moderation.manage_presets",
  "GET /moderation/stats": "moderation.view_config",
  "GET /moderation/locks": "moderation.view_config",
  "GET /moderation/locks/*": "moderation.view_config",
  "GET /moderation/locks/config": "moderation.view_config",
  "PUT /moderation/locks/config": "moderation.manage_config",
  "POST /moderation/locks/*/unlock": "moderation.manage_config",

  // ── PlanetSide 2 ──
  "GET /planetside/config": "planetside.view_config",
  "PUT /planetside/config": "planetside.manage_config",
  "GET /planetside/players": "planetside.view_players",
  "GET /planetside/players/*": "planetside.view_players",
  "POST /planetside/players/*": "planetside.manage_players",
  "PUT /planetside/players/*": "planetside.manage_players",
  "DELETE /planetside/players/*": "planetside.manage_players",
  "GET /planetside/census-status": "planetside.view_census_status",
  "POST /planetside/census-status/*": "planetside.view_census_status",
  "GET /planetside/population": "planetside.view_population",
  "GET /planetside/population/*": "planetside.view_population",
  "GET /planetside/outfit-lookup": "planetside.manage_config",
  "POST /planetside/send-panel": "planetside.manage_config",

  // ── Sticky Messages ──
  "GET /moderation/stickies": "moderation.view_config",
  "GET /moderation/stickies/*": "moderation.view_config",
  "PUT /moderation/stickies/*": "moderation.manage_config",
  "DELETE /moderation/stickies/*": "moderation.manage_config",
  "PATCH /moderation/stickies/*/toggle": "moderation.manage_config",
};

/**
 * Given an HTTP method and path segments, find the required permission action key.
 *
 * @param method   HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param pathSegments  The [...path] segments from the catch-all route
 * @returns The required action key (e.g. "minecraft.view_players") or null if no restriction
 */
export function resolveRouteAction(method: string, pathSegments: string[]): string | null {
  const path = "/" + pathSegments.join("/");
  const upperMethod = method.toUpperCase();

  // 1. Try exact match first
  const exactKey = `${upperMethod} ${path}`;
  if (routeMap[exactKey]) return routeMap[exactKey];

  // 2. Try wildcard patterns — replace each segment with * and check
  //    Check from most specific (longest match with wildcards at end) to least specific
  const segments = pathSegments.slice();
  for (let i = segments.length - 1; i >= 0; i--) {
    const original = segments[i];
    segments[i] = "*";
    const wildcardKey = `${upperMethod} /${segments.join("/")}`;
    if (routeMap[wildcardKey]) return routeMap[wildcardKey];
    // Restore for next iteration (to try wildcarding different positions)
    segments[i] = original!;
  }

  // 3. Try with trailing wildcard removed (e.g. "POST /minecraft/players/*/approve")
  //    This handles 3+ segment paths like /players/123/approve
  for (let wildcardPos = 0; wildcardPos < pathSegments.length; wildcardPos++) {
    const pattern = pathSegments.map((seg, i) => (i === wildcardPos ? "*" : seg)).join("/");
    const key = `${upperMethod} /${pattern}`;
    if (routeMap[key]) return routeMap[key];
  }

  // 4. No restriction found — require basic dashboard access for unmapped routes (default-closed)
  return "dashboard.can_access";
}
