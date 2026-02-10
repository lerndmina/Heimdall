## Plan: Command + Interaction Permissions

You want every non-dev slash command to export a static permission descriptor, with per-subcommand granularity, and have the bot enforce these role overrides at runtime. The dashboard should read permission definitions from the server. Keys should be namespaced as `commands.plugin.command` and `interactions.plugin.interaction`, and dynamic tag commands should be handled per instance. The existing role hierarchy resolution already matches “higher role wins even over deny,” so we can reuse it. The work will add a server-side permission registry for command/interaction actions, wire it into command loading and component handling, expose it via API for the dashboard, and update the dashboard UI to consume the server registry instead of a static list. Runtime enforcement will be added to command execution and component callbacks so the dashboard’s allow/deny settings actually gate usage.

**Steps**

1. Define a server-side permission registry that can add dynamic actions and return categories/actions for resolution and UI. Extend or replace the static list in [bot/src/core/dashboardPermissionDefs.ts](bot/src/core/dashboardPermissionDefs.ts) with a registry module that supports adding `commands` and `interactions` actions at runtime, and can still include the existing dashboard categories.
2. Extend command typing to carry permission metadata and load it from command modules. Update [bot/src/core/CommandManager.ts](bot/src/core/CommandManager.ts) to include optional permission descriptors in `PluginCommand`, and modify [bot/src/core/PluginLoader.ts](bot/src/core/PluginLoader.ts#L340-L430) to read a new export from each command module (e.g., a static descriptor with a `subcommands` map) and register action keys like `commands.<plugin>.<command>` or `commands.<plugin>.<command>.<subcommand>` in the registry. Skip the dev plugin when registering.
3. Implement runtime enforcement for slash commands and context menus. Add a permission evaluator that resolves role overrides using the existing logic in [bot/src/core/dashboardPermissions.ts](bot/src/core/dashboardPermissions.ts), then gate command execution in [bot/src/core/InteractionHandler.ts](bot/src/core/InteractionHandler.ts#L60-L180) based on the computed action key for the command + subcommand.
4. Add interaction permission mapping and enforcement for persistent and ephemeral components. Extend [bot/src/core/services/ComponentCallbackService.ts](bot/src/core/services/ComponentCallbackService.ts) so `registerPersistentHandler` and `register` can receive an optional permission action key and store it alongside the handler; check permissions before executing callbacks. For persistent component IDs, map customId → handlerId → permission action. For interaction keys, register actions as `interactions.<plugin>.<interaction>`.
5. Handle dynamic tag commands per instance. Update [bot/plugins/tags/services/TagSlashCommandService.ts](bot/plugins/tags/services/TagSlashCommandService.ts) to register/unregister per-tag permission actions when tags are toggled as slash commands, and ensure resolution uses the per-tag key.
6. Expose permission definitions to the dashboard via API and consume them in the UI. Add a new endpoint in [bot/src/core/ApiManager.ts](bot/src/core/ApiManager.ts) that returns permission categories/actions from the server registry. Update dashboard usage in [bot/plugins/dashboard/app/lib/permissions.ts](bot/plugins/dashboard/app/lib/permissions.ts) and [bot/plugins/dashboard/app/app/[guildId]/settings/SettingsPage.tsx](bot/plugins/dashboard/app/app/%5BguildId%5D/settings/SettingsPage.tsx) to fetch server definitions and render them instead of the static import.

**Verification**

- Run `npm run build` in bot and `npm run build:dashboard` in bot to ensure TypeScript and dashboard compile.
- Manual: verify a role deny on a command prevents execution and that higher-role allow overrides a lower deny; confirm interaction buttons (e.g., suggestion manage) are blocked when denied.

**Decisions**

- Per-subcommand permission keys, with dynamic per-instance keys for tag commands.
- Enforce at runtime for commands and interactions.
- Keys: `commands.<plugin>.<command>[.<subcommand>]` and `interactions.<plugin>.<interaction>`.
- Dashboard reads definitions from a server registry.
