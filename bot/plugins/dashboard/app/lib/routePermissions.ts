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
  "GET /dashboard-settings": "dashboard.manage_settings",
  "PUT /dashboard-settings": "dashboard.manage_settings",

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
  "PUT /tickets/*": "tickets.manage_tickets",
  "DELETE /tickets/*": "tickets.manage_tickets",
  "POST /tickets/*/close": "tickets.manage_tickets",
  "GET /tickets/categories": "tickets.manage_categories",
  "POST /tickets/categories": "tickets.manage_categories",
  "PUT /tickets/categories/*": "tickets.manage_categories",
  "DELETE /tickets/categories/*": "tickets.manage_categories",
  "GET /tickets/openers": "tickets.manage_openers",
  "POST /tickets/openers": "tickets.manage_openers",
  "PUT /tickets/openers/*": "tickets.manage_openers",
  "DELETE /tickets/openers/*": "tickets.manage_openers",

  // ── Modmail ──
  "GET /modmail/conversations": "modmail.view_conversations",
  "GET /modmail/conversations/*": "modmail.view_conversations",
  "GET /modmail/config": "modmail.manage_config",
  "PUT /modmail/config": "modmail.manage_config",

  // ── Suggestions ──
  "GET /suggestions": "suggestions.view_suggestions",
  "GET /suggestions/*": "suggestions.view_suggestions",
  "PUT /suggestions/*": "suggestions.manage_suggestions",
  "POST /suggestions/*/approve": "suggestions.manage_suggestions",
  "POST /suggestions/*/deny": "suggestions.manage_suggestions",
  "GET /suggestions/config": "suggestions.manage_config",
  "PUT /suggestions/config": "suggestions.manage_config",
  "GET /suggestions/categories": "suggestions.manage_categories",
  "POST /suggestions/categories": "suggestions.manage_categories",
  "PUT /suggestions/categories/*": "suggestions.manage_categories",
  "DELETE /suggestions/categories/*": "suggestions.manage_categories",

  // ── Tags ──
  "GET /tags": "tags.view_tags",
  "GET /tags/*": "tags.view_tags",
  "POST /tags": "tags.manage_tags",
  "PUT /tags/*": "tags.manage_tags",
  "DELETE /tags/*": "tags.manage_tags",

  // ── Logging ──
  "GET /logging": "logging.view_config",
  "GET /logging/config": "logging.view_config",
  "PUT /logging/config": "logging.manage_config",
  "POST /logging/config": "logging.manage_config",
  "PUT /logging/*": "logging.manage_config",

  // ── Welcome ──
  "GET /welcome": "welcome.view_config",
  "GET /welcome/config": "welcome.view_config",
  "PUT /welcome/config": "welcome.manage_config",
  "POST /welcome/config": "welcome.manage_config",

  // ── Temp VC ──
  "GET /tempvc": "tempvc.view_config",
  "GET /tempvc/config": "tempvc.view_config",
  "PUT /tempvc/config": "tempvc.manage_config",
  "POST /tempvc/config": "tempvc.manage_config",

  // ── Reminders ──
  "GET /reminders": "reminders.view_reminders",
  "GET /reminders/*": "reminders.view_reminders",
  "POST /reminders": "reminders.manage_reminders",
  "PUT /reminders/*": "reminders.manage_reminders",
  "DELETE /reminders/*": "reminders.manage_reminders",
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
    const pattern = pathSegments
      .map((seg, i) => (i === wildcardPos ? "*" : seg))
      .join("/");
    const key = `${upperMethod} /${pattern}`;
    if (routeMap[key]) return routeMap[key];
  }

  // 4. No restriction found — route is open to any authenticated member
  return null;
}
