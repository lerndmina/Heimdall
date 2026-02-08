## Plan: Unified Moderation Plugin

**TL;DR** — Build a single `moderation` plugin that combines automod (regex-based content filtering, reaction/emoji/username/sticker/link scanning) with manual moderation commands (`/kick`, `/ban`, `/unban`, `/mute`, `/warn`, `/purge`, `/infractions`). Both systems feed into one unified points-based warning/infraction pool with configurable escalation tiers. The logging plugin is extended with two new subcategories (`automod` and `mod_actions`) under `MODERATION` so guilds can toggle automod logs and manual mod logs independently. Dashboard gets a full management page with tabs for rules, escalation, infractions, presets, and settings. The purge command supports filtering by count, time, user, regex, bots-only, attachment type, embeds, and GIF/tenor links, with a 200-message cap.

---

### Steps

**Step 1 — Create plugin scaffold**

Create bot/plugins/moderation/ with this structure:

```
moderation/
├── index.ts
├── manifest.json
├── commands/
│   ├── automod.ts              # /automod enable|disable|view|stats
│   ├── kick.ts                 # /kick <user> [reason]
│   ├── ban.ts                  # /ban <user> [reason] [delete_days]
│   ├── unban.ts                # /unban <user> [reason]
│   ├── mute.ts                 # /mute <user> <duration> [reason]
│   ├── warn.ts                 # /warn <user> [points] [reason]
│   ├── purge.ts                # /purge count|time [filters...]
│   └── infractions.ts          # /infractions <user>
├── subcommands/
│   ├── automod/
│   │   ├── index.ts
│   │   ├── enable.ts
│   │   ├── disable.ts
│   │   ├── view.ts
│   │   └── stats.ts
│   └── purge/
│       ├── index.ts
│       ├── count.ts
│       └── time.ts
├── events/
│   ├── messageCreate/
│   │   └── automod-message.ts
│   ├── messageReactionAdd/
│   │   └── automod-reaction.ts
│   ├── guildMemberAdd/
│   │   └── automod-username-join.ts
│   └── guildMemberUpdate/
│       └── automod-nickname-change.ts
├── models/
│   ├── ModerationConfig.ts       # Guild-wide config (automod + mod settings)
│   ├── AutomodRule.ts            # Regex rules
│   └── Infraction.ts            # Unified infraction log (automod + manual)
├── services/
│   ├── ModerationService.ts     # Config CRUD + cache
│   ├── RuleEngine.ts            # Regex matching logic
│   ├── InfractionService.ts     # Points tracking, decay, history
│   ├── EscalationService.ts     # Threshold checks + action execution
│   ├── ModActionService.ts      # Kick/ban/mute/purge execution + DM + logging
│   └── AutomodEnforcer.ts       # Automod event → check → enforce pipeline
├── utils/
│   ├── regex-engine.ts          # Regex validation, safe execution, content extractors
│   ├── dm-templates.ts          # Template variable rendering (string + embed)
│   ├── presets.ts               # Built-in rule presets (disabled by default)
│   ├── constants.ts             # Shared constants
│   └── purge-filters.ts         # Purge message filter predicates
└── api/
    ├── index.ts
    ├── config-get.ts
    ├── config-update.ts
    ├── rules-crud.ts
    ├── rules-toggle.ts
    ├── rules-test.ts
    ├── infractions-get.ts
    ├── infractions-clear.ts
    ├── escalation-update.ts
    └── presets.ts
```

manifest.json: `dependencies: ["lib"]`, `optionalDependencies: ["logging"]`, `apiRoutePrefix: "/moderation"`, `disabled: false`

---

**Step 2 — Define Mongoose models**

**`ModerationConfig`** — one per guild (models/ModerationConfig.ts):

| Field | Type | Description |
|-------|------|-------------|
| `guildId` | `String` (unique, indexed) | Guild ID |
| `automodEnabled` | `Boolean` (default `false`) | Master switch for automod |
| `logChannelId` | `String?` | Fallback log channel if logging plugin unavailable |
| `pointDecayEnabled` | `Boolean` (default `true`) | Whether points expire |
| `pointDecayDays` | `Number` (default `30`) | Decay window |
| `dmOnInfraction` | `Boolean` (default `true`) | Global DM toggle |
| `defaultDmTemplate` | `String?` | Default DM template string |
| `defaultDmEmbed` | `Object?` | Default DM embed config (title, description, color, fields) |
| `dmMode` | `String` enum `"template" \| "embed"` (default `"template"`) | Which DM format |
| `immuneRoles` | `[String]` | Globally exempt role IDs |
| `escalationTiers` | `[EscalationTier]` subdoc array | Points thresholds + actions |

`EscalationTier` subdocument: `{ name: String, pointsThreshold: Number, action: enum("timeout"|"kick"|"ban"), duration: Number?, dmTemplate: String?, dmEmbed: Object?, dmMode: String? }`

**`AutomodRule`** — many per guild (models/AutomodRule.ts):

| Field | Type | Description |
|-------|------|-------------|
| `guildId` | `String` (indexed) | Guild ID |
| `name` | `String` | Rule name |
| `enabled` | `Boolean` (default `true`) | Toggle |
| `priority` | `Number` (default `0`) | Higher = checked first |
| `target` | `String` enum | `"message_content"`, `"reaction_emoji"`, `"message_emoji"`, `"username"`, `"nickname"`, `"sticker"`, `"link"` |
| `patterns` | `[{ regex: String, flags: String, label: String }]` | Regex patterns |
| `matchMode` | `String` enum `"any" \| "all"` (default `"any"`) | Match logic |
| `actions` | `[String]` enum | `"delete"`, `"remove_reaction"`, `"dm"`, `"warn"`, `"timeout"`, `"kick"`, `"ban"`, `"log"` |
| `warnPoints` | `Number` (default `1`) | Points per trigger |
| `timeoutDuration` | `Number?` | Timeout ms (if timeout action) |
| `channelInclude` / `channelExclude` | `[String]` | Channel scoping |
| `roleInclude` / `roleExclude` | `[String]` | Role scoping |
| `dmTemplate` / `dmEmbed` / `dmMode` | Per-rule DM override |
| `isPreset` / `presetId` | `Boolean` / `String?` | Preset tracking |
| Compound unique index: `{ guildId, name }` |

**`Infraction`** — unified log for both automod and manual actions (models/Infraction.ts):

| Field | Type | Description |
|-------|------|-------------|
| `guildId` | `String` (indexed) | Guild ID |
| `userId` | `String` (indexed) | Target user |
| `moderatorId` | `String?` | Moderator who issued (null for automod) |
| `source` | `String` enum `"automod" \| "manual"` | Origin |
| `type` | `String` enum | `"warn"`, `"kick"`, `"ban"`, `"mute"`, `"automod_delete"`, `"automod_reaction"`, `"automod_username"`, `"escalation"` |
| `reason` | `String?` | Human-readable reason |
| `ruleId` | `ObjectId?` (ref `AutomodRule`) | Triggering rule (automod only) |
| `ruleName` | `String?` | Denormalized rule name |
| `matchedContent` | `String?` | What was matched |
| `matchedPattern` | `String?` | Which regex hit |
| `pointsAssigned` | `Number` (default `0`) | Points from this action |
| `totalPointsAfter` | `Number` | Running total after |
| `escalationTriggered` | `String?` | Tier name if escalation fired |
| `channelId` | `String?` | Where it happened |
| `messageId` | `String?` | Message ID |
| `duration` | `Number?` | Timeout/mute duration in ms |
| `expiresAt` | `Date?` | When points expire (computed from decay config) |
| `active` | `Boolean` (default `true`) | Whether points count (manual clear sets false) |
| `createdAt` | `Date` (timestamps) | When it happened |
| Compound index: `{ guildId, userId }` |

---

**Step 3 — Build services**

**`ModerationService`** (services/ModerationService.ts):
- CRUD for `ModerationConfig` with Redis caching (`moderation:config:{guildId}`, 5-min TTL)
- CRUD for `AutomodRule` with Redis caching (`moderation:rules:{guildId}`)
- Cache invalidation on writes
- Methods: `getConfig()`, `updateConfig()`, `createRule()`, `updateRule()`, `deleteRule()`, `listRules()`, `toggleRule()`

**`RuleEngine`** (services/RuleEngine.ts):
- In-memory compiled `RegExp` cache with invalidation
- Target-specific extractors: message text, emoji (unicode + custom name + animated), reaction emoji, sticker names, URLs, username, nickname
- `evaluateMessage(message, rules)` → first matching rule (priority sorted)
- `evaluateReaction(reaction, rules)` → first matching rule
- `evaluateMember(member, rules, target: "username"|"nickname")` → first matching rule
- Catastrophic backtracking protection (regex execution timeout), max pattern length, validation at creation time

**`InfractionService`** (services/InfractionService.ts):
- `recordInfraction(data)` → creates `Infraction`, computes `expiresAt` from config, returns `{ infraction, activePoints }`
- `getActivePoints(guildId, userId)` → sum points where `active: true` AND (`expiresAt` is null OR in future)
- `getUserInfractions(guildId, userId, opts?)` → paginated, filterable by source/type
- `clearUserInfractions(guildId, userId)` → sets `active: false` on all
- `getGuildStats(guildId)` → aggregate counts for dashboard

**`EscalationService`** (services/EscalationService.ts):
- `checkAndEscalate(guildId, userId, currentPoints, config)` → finds highest matched tier, executes action (timeout/kick/ban), records escalation infraction, sends DM
- Interacts with `ModActionService` for actual Discord actions

**`ModActionService`** (services/ModActionService.ts):
- Central service for executing Discord moderation actions. Every action follows: execute → record infraction → DM user → log
- `kick(guild, member, moderatorId, reason, points?)` → `member.kick(reason)`, records infraction, DMs user, sends log
- `ban(guild, userId, moderatorId, reason, deleteDays?, points?)` → `guild.bans.create(userId, { reason, deleteMessageSeconds })`, records infraction, DMs (before ban), sends log
- `unban(guild, userId, moderatorId, reason)` → `guild.bans.remove(userId, reason)`, logs
- `mute(guild, member, moderatorId, duration, reason, points?)` → `member.timeout(duration, reason)`, records infraction, DMs, logs. Duration capped at 28 days (Discord limit)
- `warn(guild, member, moderatorId, points, reason)` → records infraction only, DMs, logs, checks escalation
- `purge(channel, options)` → fetches messages with filters, bulk deletes in batches of 100 (max 200), returns count. Logs summary
- Each method calls logging plugin if available (via `client.plugins.get("logging")`) using new `sendModLog()` method, falls back to `logChannelId`

**`AutomodEnforcer`** (services/AutomodEnforcer.ts):
- `handleMessage(message)` → get config → get rules → check scoping → evaluate → execute actions → record infraction → check escalation → DM → log
- `handleReaction(reaction, user)` → same flow for reactions
- `handleMemberJoin(member)` → username rules only
- `handleMemberUpdate(oldMember, newMember)` → nickname change detection → nickname rules
- Uses `ModActionService` for timeout/kick/ban actions triggered by rules
- Uses logging plugin with `automod` subcategory (separate from `mod_actions`)

---

**Step 4 — Build utility modules**

**`regex-engine.ts`** (utils/regex-engine.ts):
- `validateRegex(pattern, flags)` → `{ valid, error? }`
- `safeRegexTest(pattern, input, timeoutMs?)` → match result with backtracking protection
- `extractEmoji(content)` → `{ unicode[], custom[] }`
- `extractUrls(content)` → URL strings
- `extractStickerInfo(message)` → sticker names

**`dm-templates.ts`** (utils/dm-templates.ts):
- Variables: `{user}`, `{username}`, `{server}`, `{rule}`, `{channel}`, `{points}`, `{totalPoints}`, `{action}`, `{reason}`, `{moderator}`, `{matchedContent}`, `{timestamp}`, `{duration}`
- `renderTemplate(template, vars)` → interpolated string
- `renderEmbed(embedConfig, vars)` → `EmbedBuilder`
- `sendInfractionDm(user, config, rule?, overrides?, vars)` → resolves DM mode (per-rule → config default → hardcoded), sends DM, catches DM-disabled errors silently

**`presets.ts`** (utils/presets.ts):
- `invite-links` — `discord\.gg|discordapp\.com\/invite`
- `mass-mention` — 5+ mentions
- `excessive-caps` — 70%+ uppercase, 10+ chars
- `repeated-text` — `(.)\1{9,}`
- `external-links` — non-Discord links
- `zalgo-text` — combining character abuse
- All ship disabled by default, one-click enable creates a mutable rule copy

**`purge-filters.ts`** (utils/purge-filters.ts):
- Filter predicate factories — each returns `(message: Message) => boolean`:
  - `byUser(userId)` — messages from specific user
  - `byBots()` — bot messages only
  - `byContent(regex)` — content matches regex
  - `byHasAttachments()` — any attachment present
  - `byAttachmentType(types: string[])` — specific MIME types (image, video, audio, etc.)
  - `byHasEmbeds()` — messages with embeds
  - `byGifsAndTenor()` — GIF attachments or tenor/giphy links
  - `byLinks()` — messages containing URLs
- `combinedFilter(filters[])` → AND-composites all predicates
- Used by the purge subcommands to build the filter chain from user options

---

**Step 5 — Implement moderation commands**

**`/kick <user> [reason]`** (commands/kick.ts):
- `setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)`
- Options: `user` (required User), `reason` (optional String)
- In `execute`: validate hierarchy (bot role > target role, invoker role > target role), defer ephemeral, call `ModActionService.kick()`, reply with confirmation embed

**`/ban <user> [reason] [delete_days]`** (commands/ban.ts):
- `setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)`
- Options: `user` (required User), `reason` (optional String), `delete_days` (optional Integer, 0–7, default 0)
- DM user **before** executing ban (can't DM after they're banned)
- Validate hierarchy same as kick

**`/unban <user> [reason]`** (commands/unban.ts):
- `setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)`
- Options: `user` (required User — ID entry), `reason` (optional String)
- Calls `guild.bans.remove()`

**`/mute <user> <duration> [reason]`** (commands/mute.ts):
- `setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)`
- Options: `user` (required User), `duration` (required String — parsed via `lib.parseDuration()`), `reason` (optional String)
- Uses Discord native timeout (`member.timeout(ms, reason)`), max 28 days, error if over

**`/warn <user> [points] [reason]`** (commands/warn.ts):
- `setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)`
- Options: `user` (required User), `points` (optional Integer, default 1, min 1, max 100), `reason` (optional String)
- Records infraction, checks escalation, DMs user, shows new total points in reply

**`/purge count|time [filters]`** (commands/purge.ts):
- `setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)`
- Two subcommands:
  - `/purge count <amount> [user] [contains] [bots_only] [has_attachments] [attachment_type] [has_embeds] [gifs_only] [has_links]`
  - `/purge time <duration> [user] [contains] [bots_only] [has_attachments] [attachment_type] [has_embeds] [gifs_only] [has_links]`
- `amount`: Integer, 1–200
- `duration`: String parsed via `lib.parseDuration()` (e.g., "2h", "30m")
- Filter options (all optional): `user` (User), `contains` (String — regex), `bots_only` (Boolean), `has_attachments` (Boolean), `attachment_type` (String choice: image/video/audio/gif), `has_embeds` (Boolean), `gifs_only` (Boolean — targets GIF attachments + tenor/giphy links), `has_links` (Boolean)
- Implementation: fetch messages in batches of 100, apply combined filter predicates, bulk delete, skip >14-day-old messages, reply with ephemeral summary (X deleted, Y skipped)

**`/infractions <user> [page]`** (commands/infractions.ts):
- `setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)`
- Options: `user` (required User), `page` (optional Integer, default 1)
- Shows paginated infraction history with active points total, source (automod/manual), type, date, reason
- Includes a "Clear All" button (via `ComponentCallbackService` ephemeral registration)

**`/automod enable|disable|view|stats`** (commands/automod.ts):
- `setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)`
- Quick toggle + status view. Full rule management via dashboard

---

**Step 6 — Implement event handlers**

**`events/messageCreate/automod-message.ts`**: Get `ModerationPluginAPI` from `client.plugins`, call `automodEnforcer.handleMessage(message)`. Guard: skip bots, DMs, config disabled.

**`events/messageReactionAdd/automod-reaction.ts`**: Call `automodEnforcer.handleReaction(reaction, user)`. Guard: skip bots, skip DMs, partial reaction fetch if needed.

**`events/guildMemberAdd/automod-username-join.ts`**: Call `automodEnforcer.handleMemberJoin(member)`. Guard: skip bots.

**`events/guildMemberUpdate/automod-nickname-change.ts`**: Call `automodEnforcer.handleMemberUpdate(oldMember, newMember)`. Guard: skip bots, skip if nickname unchanged.

---

**Step 7 — Extend logging plugin**

Modify 4 files in logging:

1. models/LoggingConfig.ts — Add `AUTOMOD = "automod"` and `MOD_ACTIONS = "mod_actions"` to `ModerationSubcategory` enum

2. services/LoggingService.ts — Add new subcategory defaults in `setupCategory()` for MODERATION category

3. commands/_autocomplete.ts — Add `"AutoMod"` and `"Mod Actions"` choices under moderation case

4. services/LoggingEventService.ts — Add a public method for cross-plugin logging:
   - `sendModLog(guildId: string, subcategory: ModerationSubcategory, embed: EmbedBuilder): Promise<void>` — checks MODERATION category config → checks subcategory toggle → sends to configured channel
   - The moderation plugin calls this via `loggingPlugin.eventService.sendModLog(guildId, "automod", embed)` or `sendModLog(guildId, "mod_actions", embed)`
   - This gives guilds the ability to view automod and manual mod logs together (same channel) or separately (different channels per subcategory — but that's not currently how logging works, it's per-category). The toggle at least lets them enable/disable each independently

Also update the static metadata in api/events.ts to include descriptions for the new subcategories.

---

**Step 8 — Build API routes**

All mounted at `/api/guilds/:guildId/moderation/...`:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/config` | Guild moderation config (automod, escalation, DM defaults) |
| `PUT` | `/config` | Update config |
| `GET` | `/rules` | List all automod rules |
| `POST` | `/rules` | Create rule (validates regex, returns 400 on invalid) |
| `PUT` | `/rules/:ruleId` | Update rule |
| `DELETE` | `/rules/:ruleId` | Delete rule |
| `PUT` | `/rules/:ruleId/toggle` | Quick enable/disable |
| `POST` | `/rules/:ruleId/test` | Test regex against sample input, returns matches |
| `GET` | `/infractions` | List infractions (query: `userId`, `source`, `type`, `page`, `limit`) |
| `DELETE` | `/infractions/:userId` | Clear all active infractions for user |
| `GET` | `/infractions/:userId/points` | Get active points for user |
| `GET` | `/presets` | Available presets with enabled state |
| `POST` | `/presets/:presetId/enable` | Enable preset → creates rule |
| `DELETE` | `/presets/:presetId/disable` | Disable preset → deletes rule |
| `GET` | `/stats` | Guild-wide infraction stats |

---

**Step 9 — Build dashboard page**

**Add to existing dashboard files:**

1. GuildLayoutShell.tsx — Add sidebar entry: `{ label: "Moderation", href: (id) => \`/\${id}/moderation\`, icon: <ShieldIcon />, category: "moderation" }`

2. permissionDefs.ts — Add category `"moderation"` with actions: `view_config`, `manage_config`, `manage_rules`, `view_infractions`, `manage_infractions`

3. routePermissions.ts — Map all `/moderation/*` routes to permission actions

4. dashboard/manifest.json — Add `"moderation"` to `optionalDependencies`

**Create new dashboard page files:**

5. [app/[guildId]/moderation/page.tsx](bot/plugins/dashboard/app/app/%5BguildId%5D/moderation/page.tsx) — Standard `PermissionGate` wrapper

6. [app/[guildId]/moderation/ModerationPage.tsx](bot/plugins/dashboard/app/app/%5BguildId%5D/moderation/ModerationPage.tsx) — Main page with 6 tabs:

   - **Overview** — Automod enabled toggle, total rules/active infractions counts, recent infractions list, quick stats
   - **Rules** — Table of all automod rules with inline toggle, filters by target type. "New Rule" / "Edit" opens a form with: name, target type selector, regex pattern builder (add multiple patterns, each with a test input that highlights matches live), match mode, actions multi-select, warn points, timeout duration, channel include/exclude (combobox), role include/exclude (combobox), DM override toggle (template text area or embed builder with field editor), priority
   - **Presets** — Card grid showing each preset with name, description, regex preview, enabled state toggle. "Customise" button opens rule editor pre-filled with preset values
   - **Escalation** — Table of tiers (add/edit/remove): name, points threshold, action (timeout/kick/ban), duration (for timeout), DM override. Plus decay config (enabled toggle + days input)
   - **Infractions** — Searchable/filterable table: search by user (ID or mention), filter by source (automod/manual), filter by type, date range. Each row shows user, type, source, rule name, points, reason, date. User detail expandable showing active points + full history. "Clear All" button per user
   - **Settings** — Global DM mode toggle (template vs embed), default DM template editor with variable reference + live preview, default DM embed builder (title, description, color, fields — all with variable support), immune roles selector, fallback log channel selector

---

### Verification

1. **Plugin loads** — Bot starts with `moderation` listed, no errors. `client.plugins.get("moderation")` returns the API
2. **Manual commands** — `/kick`, `/ban`, `/unban`, `/mute`, `/warn` each execute the Discord action, record an infraction, DM the user, and log to the moderation channel
3. **Role hierarchy** — `/kick` and `/ban` fail with clear message if target has higher/equal role
4. **Warn + escalation** — `/warn` a user repeatedly until points cross a threshold → escalation fires automatically (timeout/kick/ban), escalation infraction recorded
5. **Point decay** — Set decay to 1 day, record infractions, verify `getActivePoints()` excludes expired ones
6. **Automod message** — Create a message content rule with a regex, send matching message → deleted, DM received, infraction logged
7. **Automod reaction** — Create a reaction emoji rule, add matching reaction → removed, DM received
8. **Automod username/nickname** — Create a username rule, member joins with matching name → DM sent, warn logged
9. **Purge count** — `/purge count 50` → 50 messages deleted, ephemeral summary shown
10. **Purge time** — `/purge time 1h` → all messages in last hour deleted (up to 200 cap)
11. **Purge filters** — `/purge count 100 user:@someone bots_only:false has_attachments:true` → only that user's messages with attachments deleted
12. **Purge gifs** — `/purge count 50 gifs_only:true` → only GIF attachments and tenor/giphy links deleted
13. **Presets** — Enable a preset via dashboard → rule appears. Disable → rule removed. Customise → editable copy
14. **Logging split** — With logging plugin, toggle `automod` subcategory off → automod logs stop but manual mod logs continue (and vice versa)
15. **Dashboard CRUD** — Create, edit, toggle, delete rules. View/clear infractions. Edit escalation tiers. All changes persist and reflect in bot behaviour
16. **Regex test** — In dashboard rule editor, enter a regex and test input → highlighted matches shown inline. Invalid regex shows error before save
17. **DM templates** — Customise DM template with variables, trigger an infraction → DM contains interpolated values

### Decisions

- **Single `moderation` plugin** — Combines automod + manual mod commands so both share the unified `Infraction` model and points pool
- **`Infraction` replaces separate automod/manual models** — Single model with `source: "automod" | "manual"` discriminator covers all use cases
- **Two logging subcategories** — `automod` and `mod_actions` under existing `MODERATION` category, allowing independent toggles without needing separate log channels (logging plugin is per-category, not per-subcategory, for channel routing)
- **`sendModLog()` public method on LoggingEventService** — Clean cross-plugin interface that respects subcategory toggles, rather than moderation plugin sending directly to channels
- **Purge cap at 200** — Two API calls maximum. Discord's 14-day bulk delete limit displayed in error messages for older messages
- **Discord native timeout only for `/mute`** — No mute role complexity. Clear error if duration exceeds 28 days
- **DM before ban** — `/ban` DMs the user before executing the ban since they can't receive DMs after being banned
- **Full rule CRUD via dashboard only** — Slash commands provide enable/disable/view/stats for quick access; regex editing, channel/role scoping, and embed building need the rich dashboard UI
- **Presets are mutable copies** — Enabling a preset creates an independent `AutomodRule` the guild can freely customise. Disabling deletes it. Re-enabling starts fresh