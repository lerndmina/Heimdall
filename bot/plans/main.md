# Heimdall v1 — Remaining Features Plan

_Created: February 6, 2026_

---

## Status

### ✅ Complete

- Core infrastructure (PluginLoader, CommandManager, EventManager, ApiManager, ComponentCallbackService, GuildEnvService, OwnerCommands, Sentry)
- `lib` plugin — Shared utilities (ThingGetter, Heimdall builders, BasicEmbed, parseTime, tryCatch, etc.)
- `support-core` plugin — SupportBan model + service
- `tickets` plugin — Full ticket system (categories, questions, flows, lifecycle, reminders, API)
- `modmail` plugin — Full modmail system (DM relay, categories, forms, config panel, background service, API)
- `tempvc` plugin — Temporary voice channels (join-to-create, control panel, cleanup, API)
- `ping` plugin — Latency check
- `dev` plugin — Owner tools (mongo-import)

### 🔲 Remaining (this plan)

| #     | Feature              | Type                | V0 Lines  | Complexity       |
| ----- | -------------------- | ------------------- | --------- | ---------------- | ------- |
| ~~1~~ | ~~Uptime command~~   | ~~Core (base bot)~~ | ~~89~~    | ~~Trivial~~      | ✅ Done |
| ~~2~~ | ~~Userinfo command~~ | ~~Core (base bot)~~ | ~~199~~   | ~~Small~~        | ✅ Done |
| ~~3~~ | ~~Welcome~~          | ~~Plugin~~          | ~~870~~   | ~~Small~~        | ✅ Done |
| ~~4~~ | ~~Tags~~             | ~~Plugin~~          | ~~908~~   | ~~Small-Medium~~ | ✅ Done |
| ~~5~~ | ~~Reminders~~        | ~~Plugin~~          | ~~1,633~~ | ~~Medium~~       | ✅ Done |
| ~~6~~ | ~~Logging~~          | ~~Plugin~~          | ~~1,906~~ | ~~Large~~        | ✅ Done |
| ~~7~~ | ~~Suggestions~~      | ~~Plugin~~          | ~~4,739~~ | ~~Large~~        | ✅ Done |
| ~~8~~ | ~~Minigames~~        | ~~Plugin~~          | ~~2,198~~ | ~~Large~~        | ✅ Done |
| 9     | Minecraft            | Plugin              | 2,485     | Large            | ✅ Done |

**Total remaining: ~15,000 lines across 96 v0 files**

---

## Step 1: Uptime Command (Core)

**Add to base bot, not a plugin.** Similar to how OwnerCommands lives in core.

### V0 Reference

- `bot/src/commands/utility/uptime.ts` (89 lines)
- Uses Redis key for `startedAt` timestamp
- Displays uptime in human-readable format

### Implementation

Add as a slash command in the `ping` plugin (natural home — both are simple bot status commands).

**Files to create/modify:**

- `plugins/ping/commands/uptime.ts` — New command file

**Command:** `/uptime`

- Reads `process.uptime()` (no need for Redis key — simpler)
- Displays formatted duration
- Shows started-at timestamp
- Owner-only or public (match v0 behavior)

---

## Step 2: Userinfo Command (Core)

**Add to the `ping` plugin** (rename it to a general `utility` plugin, or just keep it in `ping` since it's a simple info command).

### V0 Reference

- `bot/src/commands/utility/userinfo.ts` (199 lines)
- Optional `user` parameter (defaults to self)
- Guild-only
- Shows: avatar, display name, account created, joined server, roles, key permissions, badges

### Implementation

**Files to create:**

- `plugins/ping/commands/userinfo.ts` — New command file

**Command:** `/userinfo [user]`

- `user` option: optional User type
- Use `lib.thingGetter.getMember()` for full member data
- Build embed with: avatar, dates (account created, joined), role list, key permissions
- Guild-only (`allowInDMs: false`)

---

## Step 3: Welcome Plugin

### V0 Reference (870 lines, 10 files)

| Component         | V0 File                               | Lines |
| ----------------- | ------------------------------------- | ----- |
| Command           | `commands/community/welcome.ts`       | 186   |
| Model             | `models/WelcomeMessage.ts`            | 30    |
| Service           | `services/WelcomeMessageService.ts`   | 93    |
| Event             | `events/guildMemberAdd/welcome.ts`    | 38    |
| API index         | `api/routes/welcome/index.ts`         | 23    |
| API config-get    | `api/routes/welcome/config-get.ts`    | 103   |
| API config-update | `api/routes/welcome/config-update.ts` | 103   |
| API config-delete | `api/routes/welcome/config-delete.ts` | 59    |
| API test          | `api/routes/welcome/test.ts`          | 112   |
| API variables     | `api/routes/welcome/variables.ts`     | 123   |

### Architecture

```
plugins/welcome/
├── manifest.json
├── index.ts
├── models/
│   └── WelcomeMessage.ts         # guildId, channelId, message, enabled
├── services/
│   └── WelcomeService.ts         # Config CRUD, message variable replacement, send
├── commands/
│   └── welcome.ts                # /welcome setup|remove|view|test|variables
├── subcommands/
│   └── welcome/
│       ├── index.ts
│       ├── setup.ts
│       ├── remove.ts
│       ├── view.ts
│       ├── test.ts
│       └── variables.ts
├── events/
│   └── guildMemberAdd/
│       └── welcome-message.ts    # Send welcome on member join
└── api/
    ├── index.ts
    ├── config-get.ts
    ├── config-update.ts
    ├── config-delete.ts
    ├── test.ts
    └── variables.ts
```

### Model Schema

```typescript
{
  guildId: string; // unique, indexed
  channelId: string; // Channel to send welcome message
  message: string; // Message template with {variables}
  enabled: boolean; // Toggle
}
```

### Variable System

Template variables replaced at send time:

- `{user}` → mention
- `{user.name}` → username
- `{user.tag}` → tag
- `{server}` → guild name
- `{server.count}` → member count
- `{user.avatar}` → avatar URL

### Dependencies

- `lib` — ThingGetter, EmbedBuilder

---

## Step 4: Tags Plugin

### V0 Reference (908 lines, 9 files)

| Component  | V0 File                     | Lines |
| ---------- | --------------------------- | ----- |
| Command    | `commands/fun/tag.ts`       | 228   |
| Model      | `models/Tag.ts`             | 49    |
| API index  | `api/routes/tags/index.ts`  | 17    |
| API create | `api/routes/tags/create.ts` | 113   |
| API list   | `api/routes/tags/list.ts`   | 130   |
| API get    | `api/routes/tags/get.ts`    | 87    |
| API delete | `api/routes/tags/delete.ts` | 90    |
| API update | `api/routes/tags/update.ts` | 104   |
| API use    | `api/routes/tags/use.ts`    | 90    |

### Architecture

```
plugins/tags/
├── manifest.json
├── index.ts
├── models/
│   └── Tag.ts                    # guildId, name, content, createdBy, uses
├── services/
│   └── TagService.ts             # CRUD, use tracking, autocomplete search
├── commands/
│   └── tag.ts                    # /tag use|create|edit|delete|list
├── subcommands/
│   └── tag/
│       ├── index.ts
│       ├── use.ts                # Send tag content (with autocomplete)
│       ├── create.ts
│       ├── edit.ts
│       ├── delete.ts
│       └── list.ts
└── api/
    ├── index.ts
    ├── create.ts
    ├── list.ts
    ├── get.ts
    ├── update.ts
    ├── delete.ts
    └── use.ts
```

### Model Schema

```typescript
{
  guildId: string; // indexed
  name: string; // indexed, lowercase
  content: string; // Tag content (up to 2000 chars)
  createdBy: string; // User ID
  uses: number; // Usage counter
  // Compound unique index: { guildId, name }
}
```

### Key Behaviors

- Autocomplete on `/tag use` — fuzzy search by name within guild
- Usage counter incremented on each use
- Only tag creator or admins can edit/delete
- List shows all guild tags with use counts

### Dependencies

- `lib` — EmbedBuilder

---

## Step 5: Reminders Plugin ✅ Done

### V0 Reference (1,633 lines, 11 files)

| Component         | V0 File                              | Lines |
| ----------------- | ------------------------------------ | ----- |
| Command (set)     | `commands/utility/remindme.ts`       | 127   |
| Command (manage)  | `commands/utility/reminders.ts`      | 481   |
| Model             | `models/Reminder.ts`                 | 91    |
| Service (polling) | `services/ReminderService.ts`        | 217   |
| Service (context) | `services/ReminderContextService.ts` | 128   |
| API index         | `api/routes/reminders/index.ts`      | 19    |
| API create        | `api/routes/reminders/create.ts`     | 125   |
| API delete        | `api/routes/reminders/delete.ts`     | 85    |
| API update        | `api/routes/reminders/update.ts`     | 132   |
| API list          | `api/routes/reminders/list.ts`       | 141   |
| API get           | `api/routes/reminders/get.ts`        | 87    |

### Architecture

```
plugins/reminders/
├── manifest.json
├── index.ts
├── models/
│   └── Reminder.ts               # userId, guildId, channelId, message, remindAt, context
├── services/
│   ├── ReminderService.ts        # Background polling (10s interval), fire reminders
│   └── ReminderContextService.ts # Detect ticket/modmail context at creation time
├── commands/
│   ├── remindme.ts               # /remindme <time> <message>
│   └── reminders.ts              # /reminders — interactive CRUD panel
├── subcommands/
│   └── remindme/
│       └── index.ts
└── api/
    ├── index.ts
    ├── create.ts
    ├── list.ts
    ├── get.ts
    ├── update.ts
    └── delete.ts
```

### Model Schema

```typescript
{
  odvisualId: string;       // Short display ID
  userId: string;           // Who set it
  guildId: string;          // Where it was set
  channelId: string;        // Channel to remind in
  message: string;          // Reminder text
  remindAt: Date;           // When to fire
  fired: boolean;           // Has it been sent
  context?: {               // Optional: where it was set
    type: "ticket" | "modmail" | "channel";
    id: string;             // Thread/ticket ID
    name: string;           // Display name
  };
}
```

### Key Behaviors

- **Time parsing:** Use `lib.parseTime()` (already available in lib plugin)
- **Background service:** 10-second polling interval, queries `{ fired: false, remindAt: { $lte: now } }`
- **Context detection:** At creation time, check if user is in a ticket/modmail thread and store link
- **CRUD panel:** `/reminders` shows paginated list with edit/delete buttons (ephemeral, TTL-based)
- **DM fallback:** If channel is inaccessible, DM the user

### Dependencies

- `lib` — parseTime, EmbedBuilder, ThingGetter
- `tickets` (optional) — For context detection
- `modmail` (optional) — For context detection

---

## Step 6: Logging Plugin ✅ Done

### V0 Reference (1,906 lines, 14 files)

| Component         | V0 File                               | Lines |
| ----------------- | ------------------------------------- | ----- |
| Command           | `commands/moderation/logging.ts`      | 137   |
| Sub: setup        | `subcommands/logging/setup.ts`        | 95    |
| Sub: view         | `subcommands/logging/view.ts`         | 108   |
| Sub: toggle       | `subcommands/logging/toggle.ts`       | 60    |
| Sub: disable      | `subcommands/logging/disable.ts`      | 62    |
| Model             | `models/LoggingConfig.ts`             | 91    |
| Service (config)  | `services/LoggingService.ts`          | 232   |
| Service (events)  | `services/LoggingEventService.ts`     | 494   |
| API index         | `api/routes/logging/index.ts`         | 16    |
| API config-get    | `api/routes/logging/config-get.ts`    | 111   |
| API config-update | `api/routes/logging/config-update.ts` | 158   |
| API config-delete | `api/routes/logging/config-delete.ts` | 76    |
| API test          | `api/routes/logging/test.ts`          | 136   |
| API events        | `api/routes/logging/events.ts`        | 130   |

### Architecture

```
plugins/logging/
├── manifest.json
├── index.ts
├── models/
│   └── LoggingConfig.ts          # guildId, categories[] { type, channelId, subcategories[] }
├── services/
│   ├── LoggingService.ts         # Config CRUD, category management
│   └── LoggingEventService.ts    # Builds log embeds, sends to configured channels
├── commands/
│   └── logging.ts                # /logging setup|view|toggle|disable
├── subcommands/
│   └── logging/
│       ├── index.ts
│       ├── setup.ts
│       ├── view.ts
│       ├── toggle.ts
│       └── disable.ts
├── events/
│   ├── messageDelete/
│   │   └── log-message-delete.ts
│   ├── messageUpdate/
│   │   └── log-message-edit.ts
│   ├── guildMemberAdd/
│   │   └── log-member-join.ts
│   ├── guildMemberRemove/
│   │   └── log-member-leave.ts
│   ├── guildBanAdd/
│   │   └── log-ban.ts
│   └── guildBanRemove/
│       └── log-unban.ts
└── api/
    ├── index.ts
    ├── config-get.ts
    ├── config-update.ts
    ├── config-delete.ts
    ├── test.ts
    └── events.ts                 # GET — returns available event types metadata
```

### Model Schema

```typescript
{
  guildId: string;                // unique, indexed
  categories: [{
    type: LogCategory;            // "messages" | "users" | "moderation"
    channelId: string;            // Channel to send logs to
    enabled: boolean;
    subcategories: [{
      type: LogSubcategory;       // e.g., "message_delete", "message_edit", "member_join"
      enabled: boolean;
    }];
  }];
}
```

### Category/Subcategory Mapping

| Category     | Subcategories                                           | Events                                               |
| ------------ | ------------------------------------------------------- | ---------------------------------------------------- |
| `messages`   | `message_delete`, `message_edit`, `message_bulk_delete` | messageDelete, messageUpdate, messageDeleteBulk      |
| `users`      | `member_join`, `member_leave`, `member_update`          | guildMemberAdd, guildMemberRemove, guildMemberUpdate |
| `moderation` | `ban`, `unban`, `timeout`                               | guildBanAdd, guildBanRemove, guildMemberUpdate       |

### Key Behaviors

- **Per-category channels:** Each log category can go to a different channel
- **Subcategory toggles:** Granular control (e.g., log deletes but not edits)
- **Debouncing:** LoggingEventService debounces rapid events (bulk deletes)
- **Rich embeds:** Each event type has its own embed format with diff display for edits

### Dependencies

- `lib` — ThingGetter, EmbedBuilder

### Required Gateway Intents

Already present: `GuildMembers`, `GuildMessages`, `MessageContent`
May need to add: `GuildModeration` (for ban events)

---

## Step 7: Suggestions Plugin ✅ Done

### V0 Reference (4,739 lines, 13 files)

| Component              | V0 File                                            | Lines |
| ---------------------- | -------------------------------------------------- | ----- |
| Command (submit)       | `commands/community/suggest.ts`                    | 65    |
| Command (config)       | `commands/community/suggestion-config.ts`          | 519   |
| Command (categories)   | `commands/community/suggestion-categories.ts`      | 473   |
| Model (suggestion)     | `models/Suggestions.ts`                            | 157   |
| Model (config)         | `models/SuggestionConfig.ts`                       | 466   |
| Model (opener)         | `models/SuggestionOpener.ts`                       | 52    |
| Service                | `services/SuggestionService.ts`                    | 715   |
| Embeds util            | `utils/suggestions/SuggestionEmbeds.ts`            | 201   |
| Validation util        | `utils/suggestions/SuggestionValidation.ts`        | 154   |
| AI util                | `utils/suggestions/AIHelper.ts`                    | 104   |
| Event (thread delete)  | `events/threadDelete/suggestionThreadCleanup.ts`   | 24    |
| Event (channel delete) | `events/channelDelete/suggestionChannelCleanup.ts` | 24    |
| API (monolithic)       | `api/routes/suggestions/index.ts`                  | 1,785 |

### Architecture

```
plugins/suggestions/
├── manifest.json
├── index.ts
├── models/
│   ├── Suggestion.ts             # guildId, authorId, title, content, status, votes, threadId
│   ├── SuggestionConfig.ts       # guildId, mode, channelId, categories[], settings
│   └── SuggestionOpener.ts       # guildId, channelId, messageId (persistent panel)
├── services/
│   └── SuggestionService.ts      # Create, vote, manage, status changes, opener panels
├── utils/
│   ├── SuggestionEmbeds.ts       # Embed builders for suggestion display
│   ├── SuggestionValidation.ts   # Input validation helpers
│   └── AIHelper.ts               # OpenAI title generation (optional)
├── commands/
│   ├── suggest.ts                # /suggest — submit a suggestion
│   ├── suggestion-config.ts      # /suggestion-config — setup, settings
│   └── suggestion-categories.ts  # /suggestion-categories — add/edit/remove/reorder/list
├── subcommands/
│   ├── suggest/
│   │   └── index.ts
│   ├── suggestion-config/
│   │   ├── index.ts
│   │   ├── setup.ts
│   │   ├── channel.ts
│   │   ├── mode.ts
│   │   ├── settings.ts
│   │   └── view.ts
│   └── suggestion-categories/
│       ├── index.ts
│       ├── add.ts
│       ├── edit.ts
│       ├── remove.ts
│       ├── reorder.ts
│       └── list.ts
├── events/
│   ├── threadDelete/
│   │   └── suggestion-cleanup.ts
│   └── channelDelete/
│       └── suggestion-channel-cleanup.ts
└── api/
    ├── index.ts
    ├── config-get.ts
    ├── config-update.ts
    ├── suggestions-list.ts
    ├── suggestion-get.ts
    ├── suggestion-create.ts
    ├── suggestion-update.ts
    ├── suggestion-vote.ts
    ├── opener-get.ts
    ├── opener-create.ts
    └── opener-delete.ts
```

### Model Schemas

**Suggestion:**

```typescript
{
  guildId: string;
  suggestionId: string;         // Short unique ID
  authorId: string;
  title: string;                // AI-generated or user-provided
  content: string;
  status: "pending" | "approved" | "denied" | "implemented" | "in_progress";
  statusReason?: string;
  votes: { up: string[], down: string[] };
  categoryId?: string;
  channelId: string;            // Suggestion channel
  messageId?: string;           // Embed message ID
  threadId?: string;            // Discussion thread ID
}
```

**SuggestionConfig:**

```typescript
{
  guildId: string;              // unique
  mode: "embed" | "forum";     // Display mode
  channelId: string;            // Target channel
  categories: [{
    id: string;
    name: string;
    emoji?: string;
    description?: string;
  }];
  settings: {
    allowAnonymous: boolean;
    requireCategory: boolean;
    autoThread: boolean;        // Create discussion thread
    aiTitles: boolean;          // Use OpenAI for title generation
    votingEnabled: boolean;
    cooldownSeconds: number;
  };
}
```

**SuggestionOpener:**

```typescript
{
  guildId: string;
  channelId: string; // Where opener panel lives
  messageId: string; // Persistent message with button/select
}
```

### Key Behaviors

- **Two modes:** Embed mode (posts embed in channel) or Forum mode (creates forum post)
- **Categories:** Optional categorization with emoji, select menu in opener
- **Voting:** Upvote/downvote buttons on suggestion embeds (persistent handlers)
- **Status management:** Staff can approve/deny/implement with reason
- **AI titles:** Optional OpenAI-generated title from suggestion content
- **Opener panels:** Persistent "Submit Suggestion" button/select in a channel
- **Cleanup events:** Remove DB records when threads/channels are deleted

### Dependencies

- `lib` — ThingGetter, EmbedBuilder, ComponentCallbackService
- OpenAI API key (optional, for AI titles)

---

## Step 8: Minigames Plugin ✅ Done

### V0 Reference (2,198 lines, 17 files)

This is actually several sub-features. Can be one plugin with grouped commands.

| Component          | V0 File                                   | Lines |
| ------------------ | ----------------------------------------- | ----- |
| Connect4 cmd       | `commands/fun/connect4.ts`                | 70    |
| TicTacToe cmd      | `commands/fun/tictactoe.ts`               | 70    |
| Dice cmd           | `commands/fun/dice.ts`                    | 686   |
| Coinflip cmd       | `commands/fun/coinflip.ts`                | 15    |
| Emojify cmd        | `commands/fun/emojify.ts`                 | 78    |
| Poke cmd           | `commands/fun/poke.ts`                    | 36    |
| TheRules cmd       | `commands/fun/therules.ts`                | 20    |
| RandBetween cmd    | `commands/fun/randbetween.ts`             | 36    |
| Balance cmd        | `commands/fun/balance.ts`                 | 49    |
| DailyCoins cmd     | `commands/fun/dailycoins.ts`              | 50    |
| Game Admin cmd     | `commands/fun/game-admin.ts`              | 164   |
| Connect4 model     | `models/Connect4.ts`                      | 69    |
| TicTacToe model    | `models/TicTacToe.ts`                     | 66    |
| HeimdallCoin model | `models/HeimdallCoin.ts`                  | 31    |
| GameButtonService  | `services/GameButtonService.ts`           | 477   |
| Game helpers       | `utils/gameHelpers.ts`                    | 182   |
| Coin buttons event | `events/interactionCreate/coinButtons.ts` | 99    |

### Architecture

```
plugins/minigames/
├── manifest.json
├── index.ts
├── models/
│   ├── Connect4.ts               # Board state, players, TTL 24h
│   ├── TicTacToe.ts              # Board state, players, TTL 24h
│   └── HeimdallCoin.ts           # userId, balance, lastDaily
├── services/
│   ├── GameService.ts            # Connect4 + TicTacToe game logic & button rendering
│   └── EconomyService.ts         # Balance, daily claims, transfers
├── utils/
│   └── gameHelpers.ts            # Win detection, board rendering, emoji maps
├── commands/
│   ├── connect4.ts               # /connect4 <opponent>
│   ├── tictactoe.ts              # /tictactoe <opponent>
│   ├── dice.ts                   # /dice <bet> — gambling mini-game
│   ├── coinflip.ts               # /coinflip — simple heads/tails
│   ├── emojify.ts                # /emojify <text> — convert text to emoji
│   ├── poke.ts                   # /poke <user> — poke someone
│   ├── therules.ts               # /therules — display the rules
│   ├── randbetween.ts            # /randbetween <min> <max>
│   ├── balance.ts                # /balance [user]
│   ├── dailycoins.ts             # /dailycoins — claim daily
│   └── game-admin.ts             # Context menu: manage active games (owner)
└── events/
    (none needed — use ComponentCallbackService persistent handlers for game buttons)
```

### Model Schemas

**Connect4:**

```typescript
{
  guildId: string;
  channelId: string;
  messageId: string;
  players: [string, string];      // [red, yellow]
  board: number[][];              // 6x7 grid, 0=empty, 1=red, 2=yellow
  currentTurn: number;            // 0 or 1
  status: "active" | "finished";
  winner?: string;
  // TTL: 24 hours
}
```

**TicTacToe:**

```typescript
{
  guildId: string;
  channelId: string;
  messageId: string;
  players: [string, string];      // [X, O]
  board: number[];                // 9 cells, 0=empty, 1=X, 2=O
  currentTurn: number;
  status: "active" | "finished";
  winner?: string;
  // TTL: 24 hours
}
```

**HeimdallCoin:**

```typescript
{
  odvisualId: string;
  balance: number; // Default: 0
  lastDaily: Date; // Last daily claim
  // Instance methods: addCoins(n), removeCoins(n)
}
```

### Key Behaviors

- **Board games:** Persistent button grids via ComponentCallbackService. Game state in MongoDB with 24h TTL auto-cleanup.
- **Dice:** Complex gambling game with bet system, uses economy. Multiple button interactions for game flow.
- **Economy:** HeimdallCoin balance per user. Daily claims with 24h cooldown. Used by dice betting.
- **Simple commands:** coinflip, emojify, poke, therules, randbetween — stateless, no DB.
- **Game admin:** Owner-only context menu to force-end or inspect active games.

### Dependencies

- `lib` — EmbedBuilder, ComponentCallbackService

---

## Step 9: Minecraft Plugin ✅ Done

### V0 Reference (2,485 lines, 19 files)

| Component               | V0 File                                                  | Lines |
| ----------------------- | -------------------------------------------------------- | ----- |
| Link cmd                | `commands/minecraft/LinkCommand.ts`                      | 191   |
| Confirm cmd             | `commands/minecraft/ConfirmCodeCommand.ts`               | 138   |
| Status cmd              | `commands/minecraft/StatusCommand.ts`                    | 85    |
| Setup cmd               | `commands/minecraft/SetupCommand.ts`                     | 112   |
| Config model            | `models/minecraft/MinecraftConfig.ts`                    | 198   |
| Player model            | `models/minecraft/MinecraftPlayer.ts`                    | 196   |
| RoleSyncLog model       | `models/minecraft/RoleSyncLog.ts`                        | 79    |
| RoleSyncService         | `services/minecraft/RoleSyncService.ts`                  | 241   |
| LeaveService            | `services/minecraft/MinecraftLeaveService.ts`            | 214   |
| Event: auto-whitelist   | `events/guildMemberAdd/minecraft-auto-whitelist.ts`      | 27    |
| Event: leave revocation | `events/guildMemberRemove/minecraft-leave-revocation.ts` | 27    |
| API index               | `api/routes/minecraft/index.ts`                          | 19    |
| API config              | `api/routes/minecraft/config.ts`                         | 79    |
| API connection          | `api/routes/minecraft/connection.ts`                     | 221   |
| API link                | `api/routes/minecraft/link.ts`                           | 98    |
| API players             | `api/routes/minecraft/players.ts`                        | 337   |
| API rcon                | `api/routes/minecraft/rcon.ts`                           | 33    |
| API requests            | `api/routes/minecraft/requests.ts`                       | 137   |
| API rolesync            | `api/routes/minecraft/rolesync.ts`                       | 53    |

### Architecture

```
plugins/minecraft/
├── manifest.json
├── index.ts
├── models/
│   ├── MinecraftConfig.ts        # guildId, server connection, RCON, role sync rules, leave policy
│   ├── MinecraftPlayer.ts        # discordId, minecraftUuid, username, linked status, whitelist
│   └── RoleSyncLog.ts            # Sync operation audit log
├── services/
│   ├── MinecraftService.ts       # Config CRUD, player linking flow, RCON wrapper
│   ├── RoleSyncService.ts        # Discord role ↔ MC group sync
│   └── MinecraftLeaveService.ts  # Handle member departures (whitelist revocation)
├── commands/
│   ├── minecraft-link.ts         # /minecraft-link <username> — start linking flow
│   ├── minecraft-confirm.ts      # /minecraft-confirm <code> — confirm link with auth code
│   ├── minecraft-status.ts       # /minecraft-status — show link status + server info
│   └── minecraft-setup.ts        # /minecraft-setup — configure server connection (admin)
├── subcommands/
│   └── (inline — commands are simple enough to not need subcommand files)
├── events/
│   ├── guildMemberAdd/
│   │   └── minecraft-auto-whitelist.ts   # Auto-whitelist linked players on join
│   └── guildMemberRemove/
│       └── minecraft-leave-revocation.ts # Revoke whitelist on leave
└── api/
    ├── index.ts
    ├── config.ts                 # GET/PUT server config
    ├── connection.ts             # POST test connection, RCON execute
    ├── link.ts                   # POST link/unlink player
    ├── players.ts                # GET/POST/PUT/DELETE player CRUD
    ├── rcon.ts                   # POST RCON command
    ├── requests.ts               # GET/POST pending auth requests
    └── rolesync.ts               # POST trigger role sync
```

### Model Schemas

**MinecraftConfig:**

```typescript
{
  guildId: string;              // unique
  server: {
    host: string;               // MC server IP
    port: number;               // MC server port
    rconPort: number;           // RCON port
    rconPassword: string;       // Encrypted via GuildEnv
  };
  settings: {
    autoWhitelist: boolean;     // Whitelist on Discord join
    revokeOnLeave: boolean;     // Remove whitelist on Discord leave
    requireRole?: string;       // Role required to link
    linkedRole?: string;        // Role granted after linking
  };
  roleSync: {
    enabled: boolean;
    rules: [{
      discordRoleId: string;
      minecraftGroup: string;   // Permission group name
      syncDirection: "discord_to_mc" | "mc_to_discord" | "both";
    }];
  };
}
```

**MinecraftPlayer:**

```typescript
{
  odvisualId: string;
  discordId: string;            // indexed
  guildId: string;              // indexed
  minecraftUuid: string;        // indexed
  minecraftUsername: string;
  linked: boolean;
  whitelisted: boolean;
  linkedAt?: Date;
  authCode?: string;            // Temporary auth code for linking
  authCodeExpiresAt?: Date;
  // Compound index: { discordId, guildId } unique
}
```

**RoleSyncLog:**

```typescript
{
  guildId: string;
  discordId: string;
  action: "add" | "remove";
  discordRole: string;
  minecraftGroup: string;
  success: boolean;
  error?: string;
  timestamp: Date;
}
```

### Key Behaviors

- **Linking flow:** User runs `/minecraft-link <username>` → bot generates auth code → user runs `/confirm <code>` in MC (via Java plugin API call) OR runs `/minecraft-confirm <code>` in Discord → accounts linked
- **RCON:** Bot connects to MC server via RCON to execute commands (whitelist add/remove, group sync)
- **Auto-whitelist:** When a linked user joins the Discord server, auto-whitelist them on MC
- **Leave revocation:** When a user leaves Discord, optionally revoke their MC whitelist
- **Role sync:** Map Discord roles to MC permission groups, sync bidirectionally
- **Java plugin parity:** The API routes are consumed by the `minecraft-plugin/` Java plugin for auth code verification, player status checks, and whitelist operations

### API Route Parity with Java Plugin

The Java plugin (`minecraft-plugin/`) calls these bot API endpoints:

| Java Plugin Action       | API Endpoint                                | Method |
| ------------------------ | ------------------------------------------- | ------ |
| Verify auth code         | `/api/guilds/:guildId/minecraft/requests`   | POST   |
| Check player whitelist   | `/api/guilds/:guildId/minecraft/players`    | GET    |
| Report player join/leave | `/api/guilds/:guildId/minecraft/connection` | POST   |
| Trigger role sync        | `/api/guilds/:guildId/minecraft/rolesync`   | POST   |

### Dependencies

- `lib` — ThingGetter, EmbedBuilder, GuildEnvService (for RCON password encryption)
- RCON library (e.g., `rcon-client` — check v0 package.json)

### Required Environment

- `ENABLE_MINECRAFT_SYSTEMS` — Feature toggle (optional, skip registration if false)

---

## Implementation Order

Recommended sequence based on dependencies and complexity:

| Order | Feature     | Est. Files | Reason                                                        |
| ----- | ----------- | ---------- | ------------------------------------------------------------- |
| 1     | Uptime      | 1          | Trivial, instant win                                          |
| 2     | Userinfo    | 1          | Trivial, instant win                                          |
| 3     | Welcome     | ~16        | Small, no dependencies beyond lib                             |
| 4     | Tags        | ~14        | Small-medium, standalone                                      |
| 5     | Reminders   | ~14        | Medium, optional deps on tickets/modmail                      |
| 6     | Logging     | ~18        | Large but self-contained, may need new intent                 |
| 7     | Minigames   | ~18        | Large, many commands but mostly independent                   |
| 8     | Suggestions | ~25        | Largest, complex service + multi-mode                         |
| 9     | Minecraft   | ~20        | Large, external integration, needs Java plugin parity testing |

---

## Notes

- All plugins follow the established pattern: `manifest.json` + `index.ts` (onLoad/onDisable) + `commands/` + `events/` + `api/`
- All API routes mount under `/api/guilds/:guildId/<prefix>` via ApiManager
- All models use hot-reload safe pattern: `mongoose.models.X || model("X", schema)`
- All interactions use ComponentCallbackService (ephemeral TTL or persistent handlers)
- All Discord entity fetches use `lib.thingGetter`
- No feature gating — plugins are enabled by being installed
