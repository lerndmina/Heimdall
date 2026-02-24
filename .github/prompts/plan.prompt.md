## Plan: Unified dev Panel System

The current dev command has standalone subcommands (`mongo-import`, `activity`). This refactors it into a single dev command (no subcommands besides `mongo-import`) that opens an interactive control panel with a main menu and navigable sub-panels.

**Architecture**: A main menu embed with a select menu for navigation + a button row for quick actions. Selecting a category swaps the embed & components to that sub-panel's content. Every sub-panel has a "◀ Back" button to return to the main menu. All panels use ephemeral messages with 15-minute TTL components.

**Steps**

**1. Create `DevPanelContext` type and store core services — index.ts**

During `onLoad`, capture `context.commandManager`, `context.client`, `context.redis`, `context.mongoose`, and the `PluginLoader` load info (by reading `context.client.plugins`). Export a `DevPluginAPI` interface extending `PluginAPI` that exposes `commandManager`, `pluginInfo` (Map of loaded plugin manifests), and `getRedis()` / `getMongoose()` accessors. This way activity.ts and the new panels can access these services through `getPluginAPI<DevPluginAPI>("dev")`.

**2. Create panel infrastructure — `bot/plugins/dev/utils/devPanel.ts`**

A shared framework:

- `DevPanel` interface: `{ buildEmbed(lib, api): EmbedBuilder, buildComponents(lib, api, refresh, navigateTo): ActionRowBuilder[] }`
- `buildMainMenu(lib, api, navigateTo)` function that renders the home panel
- `renderPanel(panelName, ...)` dispatcher that calls the right panel builder
- All panels receive a `refresh()` callback (re-renders current panel) and a `navigateTo(panelName)` callback (swaps to another panel)
- Panels: `"main"`, `"activity"`, `"status"`, `"cache"`, `"database"`, `"commands"`, `"debug"`

**3. Create each sub-panel (one file per panel in `bot/plugins/dev/utils/panels/`)**

- **`mainMenu.ts`** — Home embed showing bot name, uptime summary, quick stats. Select menu with options: Bot Status, Activity, Cache/Redis, Database, Commands, Debug. Buttons: none (select menu drives navigation).

- **`statusPanel.ts`** — Embed fields: Uptime, Memory (heapUsed/rss), Guild count, User count (estimated), Shard info, Node.js version, discord.js version. Second embed or field group: Loaded plugins table (name, version, status). Button: [🔄 Refresh Stats]. No destructive actions.

- **`activityPanel.ts`** — Refactored from current activity.ts. Same functionality (presets, rotation, status, interval), but wrapped in the panel framework with a ◀ Back button added to row 0.

- **`cachePanel.ts`** — Embed: Redis key count (`redis.dbSize()`), memory usage (`redis.info("memory")` → parse `used_memory_human`), a list of known key patterns & their counts (use `redis.keys("pattern*")` for small sets or `SCAN`). Buttons: [🗑️ Purge All Redis] (typed confirmation modal: "PURGE REDIS"), [🧹 Flush Components] (flushes `persistent_component:*` and ephemeral `component:*` keys). Select menu: flush by known category pattern (tickets, modmail, components, etc.).

- **`databasePanel.ts`** — Embed: DB name, total collections, total documents (from `mongoose.connection.db.stats()`), data size. Buttons: [☢️ Drop All Data] (typed confirmation modal: "DROP ALL DATA" — calls existing `dropAllCollections()`), [📊 Collection Stats] (sends a follow-up with per-collection doc counts). Note about `/dev mongo-import` for file imports.

- **`commandsPanel.ts`** — Embed: registered command count (slash + context menu from `commandManager.getStats()`), guild count. Buttons: [🔄 Refresh All Guilds] (calls `commandManager.registerAllCommandsToGuilds()`, shows real-time progress by editing the message per-guild), [🔄 Refresh This Guild] (calls `commandManager.registerCommandsToGuild(interaction.guildId)`), [🗑️ Delete All Commands] (typed confirmation: "DELETE COMMANDS" — iterates guilds with REST.put empty array, then **immediately re-registers** dev to the current guild so the panel stays accessible).

- **`debugPanel.ts`** — Embed: current log level, Sentry status (enabled/DSN configured), WS clients connected, WS guild subscriptions count. Buttons: [🐛 Toggle Debug Logging] (calls `log.configure({ minLevel: ... })`), [🚨 Sentry Test] (calls `captureException(new Error("Dev panel test"))` and confirms), [💓 Health Check] (tests MongoDB ping via `mongoose.connection.db.admin().ping()`, Redis via `redis.ping()`, reports latencies).

**4. Refactor dev command definition — dev.ts**

Keep `mongo-import` as a subcommand (needs file upload). Replace `activity` subcommand with a new `panel` subcommand (or just make dev without subcommand open the panel — but since `mongo-import` exists as a subcommand, Discord requires all to be subcommands). So:

- `/dev panel` — opens the main dev panel
- `/dev mongo-import` — existing file import

**5. Update subcommand router — index.ts**

Route `case "panel"` to a new `handleDevPanel(context)` entry point that builds and replies with the main menu. Remove `case "activity"` (it's now a sub-panel within the dev panel).

**6. Update `onLoad` — index.ts**

Store `commandManager`, `redis`, `mongoose` references in module-level variables. Export them through the `DevPluginAPI` so panels can access them. Keep existing activity restoration logic.

**Verification**

1. `npx tsc --noEmit` — clean build
2. Bot restart — activity restoration still works
3. `/dev panel` — main menu renders with all 6 category options in select menu
4. Navigate to each sub-panel → verify embed content, buttons work, ◀ Back returns to main
5. Bot Status — shows correct guild count, uptime, plugin list
6. Activity — all existing functionality preserved (add/delete presets, rotation, status)
7. Cache — key count displays, purge redis with confirmation modal works
8. Database — stats display, drop all with confirmation works
9. Commands — refresh all guilds shows progress, delete all commands then immediately re-registers dev in current guild
10. Debug — toggle debug logging changes output, sentry test fires, health check pings all services

**Decisions**

- `/dev panel` subcommand (not removing subcommands entirely) — `mongo-import` needs file upload which requires slash command options
- Hybrid UX: select menu for navigation between panels, buttons for actions within panels
- Dangerous actions use typed-confirmation modals (user must type exact phrase)
- Delete All Commands immediately re-registers dev to the invoking guild to maintain access
- Panel state is ephemeral (TTL components) — no persistence needed for the panel itself
- `PluginLoader` info derived from `client.plugins` map (names/APIs) plus manifests captured at `onLoad` time
