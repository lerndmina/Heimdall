# Copilot Instructions for Heimdall

Heimdall is a production Discord bot monorepo with an Express REST API, Next.js dashboard, and custom command handler. Built for personal use with emphasis on modular architecture and feature flags.

## Architecture Overview

### Monorepo Structure

- **command-handler/** - Custom Discord.js command handler (replaces CommandKit) with ButtonKit reactive system
- **bot/** - Discord.js 14+ bot with Express API server (guild-installable)
- **dashboard/** - Next.js 14 App Router with Discord OAuth
- **helpie-userbot/** - User-installable Discord bot with AI assistance and context system
- **minecraft-plugin/** - Java Spigot/Paper plugin for whitelist integration
- **logger/** - Shared logging package
- **scripts/** - Build and deployment automation

### Data Flow & Integration Points

1. **Bot ↔ Dashboard**: Bot exposes REST API (port 3001), dashboard consumes via proxy (lib/api.ts)
2. **Bot ↔ Database**: MongoDB (Mongoose) for persistence, Redis for caching/cooldowns
3. **Bot ↔ Minecraft**: Java plugin calls bot API for whitelist checks (scoped API keys)
4. **Dashboard ↔ Bot API**: Server-side calls use INTERNAL_API_KEY, client-side goes through Next.js API routes

## Critical Development Patterns

### Command Handler (Bot Commands)

**Two supported patterns** - Legacy (CommandKit-compatible) and Modern:

```typescript
// Legacy pattern - use for most commands
export const data = new SlashCommandBuilder().setName("command").setDescription("Description");

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  await interaction.reply("Response");
}
```

### User Commands (User-Installable Commands)

**Location:** `bot/src/commands/user/**/*.ts`

Commands in the `commands/user/` directory are **user-installable** - they can be installed on a Discord user's profile and used across any server or in DMs. These commands MUST work as user commands first and foremost, but can optionally support guild installation too.

**Required Pattern:**

```typescript
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("usercommand")
  .setDescription("A user-installable command")
  // REQUIRED: Must include UserInstall for commands in commands/user/
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  // Specify where command can be used
  .setContexts([
    InteractionContextType.Guild, // Can use in servers
    InteractionContextType.BotDM, // Can use in bot DMs
    InteractionContextType.PrivateChannel, // Can use in private channels
  ]);
```

**Key Rules:**

1. **Integration Types** - Must include `ApplicationIntegrationType.UserInstall`
2. **Contexts** - Choose based on command needs (guild-only, DM-only, or all)
3. **Guild Validation** - Handler auto-validates based on contexts (if contexts=[Guild only], guild must exist)
4. **Dev-Only** - Uses owner ID checks at execution time (not registration restriction)
5. **Hybrid Commands** - Can add `ApplicationIntegrationType.GuildInstall` for dual installation

**Context Patterns:**

```typescript
// Pattern 1: All contexts (most flexible)
.setContexts([
  InteractionContextType.Guild,
  InteractionContextType.BotDM,
  InteractionContextType.PrivateChannel,
]);

// Pattern 2: Guild-only (auto-validates guild exists)
.setContexts([InteractionContextType.Guild]);

// Pattern 3: DM-only (private messages only)
.setContexts([
  InteractionContextType.BotDM,
  InteractionContextType.PrivateChannel,
]);

// Pattern 4: Hybrid installation (user + guild)
.setIntegrationTypes([
  ApplicationIntegrationType.UserInstall,
  ApplicationIntegrationType.GuildInstall,
])
```

**Dev-Only User Commands:**

```typescript
export const options: LegacyCommandOptions = {
  devOnly: true, // Enforced via owner IDs at execution, not registration
};
```

See `bot/src/commands/user/` for complete examples of each pattern.

**ButtonKit for interactive components** - replaces traditional collectors:

```typescript
import { ButtonKit } from "@heimdall/command-handler";

const button = new ButtonKit().setCustomId("my-btn").setStyle(ButtonStyle.Primary).setLabel("Click Me");

// Reactive onClick - no collector needed
button.onClick(
  async (interaction) => {
    await interaction.update({ content: "Clicked!" });
  },
  { message }
); // Pass message for context
```

### Error Handling - tryCatch Pattern

**Always use `tryCatch` for async operations** (bot/src/utils/trycatch.ts):

```typescript
import { tryCatch } from "./utils/trycatch";

const { data, error } = await tryCatch(someAsyncOperation());
if (error) {
  log.error("Operation failed:", error);
  return interaction.reply({ content: "Error occurred", ephemeral: true });
}
// Use data safely here
```

Returns `{ data: T, error: null }` on success or `{ data: null, error: E }` on failure.

### Logging - Use Custom Logger

**Never use console.log** - use the logger from @heimdall/logger:

```typescript
import log from "./utils/log";

log.info("Informational message", { context: "data" });
log.error("Error occurred:", error);
log.debug("Debug info"); // Only shows when DEBUG_LOG=true
```

### API Response Standards

All API endpoints use standardized responses (bot/src/api/utils/apiResponse.ts):

```typescript
import { createSuccessResponse, createErrorResponse } from "../utils/apiResponse";

// Success
return res.json(createSuccessResponse(data, req.requestId));

// Error
return res.status(404).json(createErrorResponse("Not found", 404, req.requestId));
```

Every response includes `success`, `timestamp`, `requestId`, and `data` or `error`.

### API Authentication & Scopes

Middleware stack for protected endpoints:

```typescript
import { authenticateApiKey, requireScope } from "../middleware/auth";

router.post(
  "/endpoint",
  authenticateApiKey, // Validates API key
  requireScope("modmail:write"), // Checks scope
  async (req, res) => {
    // req.apiKey contains key info
    // req.requestId auto-generated
  }
);
```

API keys managed via `/api-keys` Discord command with scopes like `minecraft:connection`, `modmail:read`, `modmail:write`.

### Environment Variables

Centralized in `bot/src/utils/FetchEnvs.ts`. Access via:

```typescript
import fetchEnvs from "./utils/FetchEnvs";
const env = fetchEnvs();
// env.BOT_TOKEN, env.MONGODB_URI, etc.
```

Feature flags: `ENABLE_FIVEM_SYSTEMS`, `ENABLE_MINECRAFT_SYSTEMS`, `ENABLE_GITHUB_SUGGESTIONS`.

### Validation Files

Prefix with `+` for universal validations (bot/src/validations/):

- `+cooldowns.ts` - Applies to all commands
- `validate.commandname.ts` - Command-specific validation

```typescript
// validations/+cooldowns.ts
export default async function cooldownValidation({ interaction, handler }) {
  // Check Redis for cooldown
  // Return false to block command
}
```

### Dashboard API Client

Client-side uses relative URLs (proxies through Next.js), server-side hits bot directly:

```typescript
// dashboard/lib/api.ts
const api = new ApiClient();
await api.validateUser(userId); // Auto-detects client/server context
```

Includes request deduplication and client-side caching (dashboard/lib/client-cache.ts).

## Build & Deployment Workflows

### Local Development

```bash
# From monorepo root
bun run dev              # Both bot and dashboard
bun run dev:bot          # Bot only (port 3001 API)
bun run dev:dashboard    # Dashboard only (port 3000)

# Install all dependencies
bun run install:all
```

### Docker Build

- `scripts/fast-build.sh` - Single platform (fast)
- `scripts/multi-platform-build.sh` - Multi-arch (slow)
- Main Dockerfile builds entire monorepo in single container

### Bot-specific Commands

```bash
cd bot
bun run dev              # Nodemon with hot reload
bun run migrate:uuid-index  # Run DB migration
```

### Dashboard-specific

```bash
cd dashboard
bun run dev              # Next.js dev server
bunx prisma db push      # Sync Prisma schema
```

## Project-Specific Conventions

### File Naming

- Commands: `kebab-case.ts` (e.g., `modmail-setup.ts`)
- Utilities: `PascalCase.ts` for classes, `camelCase.ts` for functions
- React: `PascalCase.tsx` for components
- Next.js pages: `lowercase/page.tsx` per App Router

### Subcommands

Complex commands split into `bot/src/subcommands/commandname/subcommand.ts`. Import and call from main command file.

### Embed Utilities

- `BasicEmbed(client, title, description, fields?, color?)` - Standard embeds
- `ModmailEmbeds.*` - Specialized modmail embeds (error, success, etc.)
- `ThingGetter` - Utility class for fetching Discord entities (guilds, channels, users)

### Database Utility Class

**Core utility for all MongoDB operations** (bot/src/utils/data/database.ts):

```typescript
import Database from "./utils/data/database";

const db = new Database();

// Find one document with Redis caching
const config = await db.findOne(ModmailConfig, { guildId: "123" });

// Find multiple documents
const modmails = await db.find(ModmailModel, { userId: user.id });

// Update with upsert (creates if not exists)
const updated = await db.findOneAndUpdate(ModmailConfig, { guildId: guild.id }, { forumChannelId: channel.id }, { upsert: true, new: true });

// Delete document
await db.deleteOne(ModmailModel, { threadId: thread.id });
```

**Key Features:**

- **Redis Caching**: Automatic caching with configurable TTL (default 1 hour)
- **Cache Invalidation**: Auto-invalidates on updates/deletes
- **Query Key Hashing**: Creates unique cache keys from query parameters
- **Debug Logging**: Detailed logs when `DEBUG_LOG=true`
- **Cache Toggle**: Global `DISABLE_CACHE` flag for testing (currently disabled)

**Cache Key Format**: `{DATABASE}:{ModelName}:{field1:value1}|{field2:value2}`

Always use this class instead of direct Mongoose calls for consistency and caching.

### Modmail System (Core Feature)

Modmail is the bot's primary feature for user support tickets. Located in `bot/src/utils/modmail/`:

#### Architecture Overview

**Hook-Based Creation Flow:**

1. User DMs bot → `gotMail.ts` event handler
2. `HookBasedModmailCreator` executes before-creation hooks
3. Hooks can: select guild, show category menu, collect form responses, run AI triage
4. Thread created in Discord forum channel
5. Bidirectional message relay (user ↔ staff)

#### Key Components

**`HookBasedModmailCreator.ts`** - Main creation orchestrator

- Executes hook chain for pre-creation logic
- Handles multi-guild selection
- Validates user membership
- Creates forum threads with metadata
- **Hook System**: Dynamic, extensible pre-creation logic (AI triage, form collection, etc.)

**`ModmailEmbeds.ts`** - Standardized embeds

```typescript
// All modmail messages use these for consistency
ModmailEmbeds.success(client, "Title", "Description", fields?)
ModmailEmbeds.error(client, "Title", "Description")
ModmailEmbeds.warning(client, "Title", "Description")
ModmailEmbeds.info(client, "Title", "Description")
```

**`CategoryValidation.ts`** - Validates category configs

- Validates category structure (name, description, staff role)
- Validates form fields (type, required, length)
- Checks Discord entities exist (channels, roles)
- Max 5 form fields per category

**`FormFieldManager.ts`** - Handles custom intake forms

- Supports text inputs, select menus, and text areas
- Validates responses against field config
- Stores responses in ticket metadata

**`TicketNumbering.ts`** - Thread naming (singleton)

- Generates unique ticket numbers per guild
- Format: `ticket-{number}-{username}` (e.g., `ticket-0042-john`)
- Thread-safe numbering with MongoDB counters

**`ModmailThreads.ts`** - Safe thread operations

- `createModmailThreadSafe()` - Creates with automatic cleanup on failure
- `cleanupModmailThread()` - Removes thread + DB record on error
- Activity tracking and timestamp management

#### Database Schema

**ModmailConfig** (per-guild config):

- `forumChannelId` - Forum channel for tickets
- `staffRoleId` - Role that can respond
- `categories[]` - Custom categories with forms
- `autoCloseHours` - Auto-close inactive tickets
- `minimumMessageLength` - Prevents spam

**Modmail** (per-ticket):

- `threadId` - Discord forum thread ID
- `userId` - User who created ticket
- `guildId` - Server ticket belongs to
- `status` - open/closed/resolved
- `priority` - low/medium/high/critical
- `formResponses[]` - Collected form data
- `openedBy` - User/Staff
- `closedBy` - Who closed it

#### Common Patterns

**Creating Modmail:**

```typescript
const creator = new HookBasedModmailCreator(client);
const result = await creator.createModmail(user, originalMessage, content);
// Result includes: success, prevented (by AI), error, message
```

**Validation:**

```typescript
import { validateModmailSetup } from "./utils/modmail/ModmailValidation";

const validation = await validateModmailSetup(user, { guild, client, db });
if (!validation.success) {
  return interaction.reply({ embeds: [ModmailEmbeds.error(...)] });
}
// Use validation.data.member, validation.data.config, etc.
```

**Category Management:**
See `CategoryManager.ts` for add/edit/delete category operations.

### Feature Flags System

**Environment-based feature toggles** for optional integrations:

#### Available Flags

| Flag                        | Purpose                                | Related Components                    |
| --------------------------- | -------------------------------------- | ------------------------------------- |
| `ENABLE_MINECRAFT_SYSTEMS`  | Minecraft whitelist integration        | `/minecraft-*` commands, API routes   |
| `ENABLE_FIVEM_SYSTEMS`      | FiveM server integration               | `/fivem` commands, MariaDB connection |
| `ENABLE_GITHUB_SUGGESTIONS` | GitHub issue creation from suggestions | `/suggest` command GitHub sync        |
| `ENABLE_TAW_COMMAND`        | TAW-specific API integration           | `/fivem taw` subcommand               |

#### Implementation Pattern

**In Commands:**

```typescript
// Set deleted: true when flag is false (unregisters command)
export const options: LegacyCommandOptions = {
  deleted: !env.ENABLE_MINECRAFT_SYSTEMS,
};
```

**In Events/Services:**

```typescript
// Guard at file top - prevents entire file loading
if (env.ENABLE_FIVEM_SYSTEMS && env.FIVEM_MYSQL_URI !== DEFAULT_OPTIONAL_STRING) {
  // Event registration logic
}
```

**Runtime Checks:**

```typescript
import { envExists } from "./utils/FetchEnvs";

// Check if feature is properly configured
if (!envExists(env.ENABLE_FIVEM_SYSTEMS) || !envExists(env.FIVEM_MYSQL_URI)) {
  return interaction.reply("FiveM integration not enabled");
}
```

#### Adding New Feature Flags

1. **Add to FetchEnvs.ts interface:**

```typescript
ENABLE_MY_FEATURE: boolean;
```

2. **Add to env object:**

```typescript
ENABLE_MY_FEATURE: process.env.ENABLE_MY_FEATURE === "true",
```

3. **Use in commands:**

```typescript
export const options: LegacyCommandOptions = {
  deleted: !env.ENABLE_MY_FEATURE,
};
```

4. **Document required env vars** in related feature README

**Best Practice**: Always default to `false` for security. Require explicit opt-in via environment variable.

### Testing Philosophy

**Live Testing with Test Bot in Discord Environment**

No traditional unit tests - testing happens in real Discord servers:

1. **Test Servers**: Configure via `TEST_SERVERS` env variable (comma-separated guild IDs)
2. **Dev-Only Commands**: Use `devOnly: true` in command options
3. **Test Bot**: Separate bot instance with same codebase
4. **Debug Logging**: Enable with `DEBUG_LOG=true` for verbose output

**Testing Workflow:**

```bash
# 1. Set up test environment
# .env:
TEST_SERVERS=1234567890,0987654321
OWNER_IDS=your_user_id
DEBUG_LOG=true

# 2. Run dev mode with hot reload
bun run dev

# 3. Test in Discord test server
# - Use devOnly commands
# - Check logs for errors
# - Verify interactions work

# 4. Deploy to production after validation
```

**Why No Mocking?**

- Discord.js interactions are stateful and complex
- Real Discord environment catches edge cases
- ButtonKit/collectors need actual Discord connections
- Database operations tested against real Redis/MongoDB

**Debug Tools:**

- `log.debug()` - Verbose debug output (only when DEBUG_LOG=true)
- `tryCatch` utility - Captures and logs all errors
- Bot API `/health` endpoint - Check service status
- Redis caching can be disabled globally for testing

### Minecraft Integration

Java plugin (minecraft-plugin/) calls bot API. Plugin config includes `enabled` flag (defaults false for security).

## Helpie Userbot (User-Installable Bot)

**Location:** `helpie-userbot/`

Helpie is a **user-installable Discord bot** - installed on user profiles rather than guilds. Users can use Helpie commands across any server, in DMs, or in private channels.

### Key Differences from Main Bot

1. **Installation Type**: User-installable (not guild-installable)
2. **Command Handler**: Uses `SimpleCommandHandler` instead of full CommandHandler
3. **Command Structure**: All commands grouped under `/helpie` parent command with subcommands
4. **No ButtonKit**: Uses standard Discord.js interaction patterns (simpler architecture)

### SimpleCommandHandler System

**Auto-groups commands under `/helpie` parent command:**

```typescript
// File: commands/user/ping.ts → Becomes: /helpie ping
// File: commands/user/context/set.ts → Becomes: /helpie context set
```

**Command file structure remains the same:**

```typescript
export const data = new SlashCommandBuilder()
  .setName("ping") // Will become /helpie ping
  .setDescription("Check bot latency");

export const options = { devOnly: false, deleted: false };

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Command logic
}
```

**Directory-based grouping** - subdirectories become subcommand groups automatically:

- `commands/user/ping.ts` → `/helpie ping`
- `commands/user/context/set.ts` → `/helpie context set`
- `commands/user/context/list.ts` → `/helpie context list`

### HelpieReplies System

**Universal reply system with animated emoji** (replaces manual embed creation):

```typescript
import HelpieReplies from "../utils/HelpieReplies";

// Two modes: plain text or embed
await HelpieReplies.success(interaction, "Operation successful!"); // Plain text
await HelpieReplies.success(interaction, {
  title: "Success",
  message: "Details here...",
}); // Embed

// Deferred replies for long operations
await HelpieReplies.deferThinking(interaction); // Shows thinking emoji
await HelpieReplies.deferSearching(interaction); // Shows searching emoji

// Edit deferred reply
await HelpieReplies.editSuccess(interaction, "Done!");
```

**Emoji mapping:**

- `success()` → 🤖 mandalorianhello (green embed)
- `error()` → 😔 mandaloriansorry (red embed) - system errors
- `warning()` → 😲 mandalorianshocked (yellow embed) - user errors
- `thinking()` → 🤔 mandalorianwhat (blue embed)
- `searching()` → 👀 mandalorianlooking (blue embed)

**Always use HelpieReplies** - never manual `interaction.reply()` or `interaction.editReply()`.

### AI Context System

**Two types of context:**

1. **Permanent Context (GitHub-based)** - Hierarchical resolution (Global → Guild → User)
2. **Temporary Context (Redis-based)** - Message-specific, 5-minute TTL

**Permanent Context (ContextService):**

```typescript
import { ContextService } from "../services/ContextService";

// Resolve context for AI questions (cascading priority)
const resolvedContext = await ContextService.resolveContextForAsk(userId, guildId);
// Returns: User context > Guild context > Global context > null

// Set context (owner-only)
await ContextService.setContext("global", githubRawUrl, ownerId);
```

**Context storage:**

- **MongoDB**: Stores GitHub URLs and metadata
- **Redis**: Caches fetched content (10 min TTL)
- **GitHub**: Content fetched from raw.githubusercontent.com or gist.githubusercontent.com

**Temporary Context (TemporaryContextManager):**

```typescript
import TemporaryContextManager from "../utils/TemporaryContextManager";

// Store message content temporarily (5-min TTL)
await TemporaryContextManager.store(userId, messageId, content);

// Get all temporary contexts for user (for AI processing)
const contexts = await TemporaryContextManager.getAllForUser(userId);

// Clear all temporary contexts after use
await TemporaryContextManager.deleteAllForUser(userId);
```

**Temporary context features:**

- Users right-click messages to add to temporary context
- Context menu: "AI -> Add Context"
- Automatically prepended to AI questions
- Cleared after successful AI response
- 5-minute TTL in Redis (key: `HelpieContext:{userId}:{messageId}`)

**Context commands** (under `/helpie context`):

- `set` - Set context URL (owner-only)
- `view` - View current context
- `list` - List all contexts (owner-only)
- `refresh` - Force refresh from GitHub
- `remove` - Delete context (owner-only)
- `lookup` - View specific context by ID (owner-only)
- `clear` - Clear all temporary stored contexts (user-scoped)

### AI Integration Pattern

**Shared logic for AI questions** (commands/user/ask.ts and ask-context.ts):

```typescript
import { processAskQuestion } from "../utils/AskHelpie";

// In command
await HelpieReplies.deferThinking(interaction);
await processAskQuestion({
  message: userQuestion,
  userId: interaction.user.id,
  guildId: interaction.guildId,
  interaction,
});
```

**Uses Vercel AI SDK:**

- Model: `gpt-4o-mini` (OpenAI)
- Context injection into system prompt
- Temporary contexts automatically prepended to questions
- 2000 char limit (Discord constraint)

### Environment Variables (Helpie-specific)

```typescript
// Required
BOT_TOKEN: string;
OWNER_IDS: string; // Comma-separated
OPENAI_API_KEY: string;
MONGODB_URI: string;

// Optional
MONGODB_DATABASE: string; // Default: "helpie"
REDIS_URI: string; // Default: "redis://localhost:6379"
SYSTEM_PROMPT: string; // AI system prompt
DEEPL_API_KEY: string; // For translation feature
DEBUG_LOG: boolean;
NODE_ENV: string;
```

### Development Workflow

```bash
cd helpie-userbot
bun install
bun run dev  # Nodemon with hot reload
```

**Hot reload:** SimpleCommandHandler automatically reloads commands on file changes.

### Additional Commands

**Help Command:**

- `/helpie help` - Dynamic help command showing all available commands with clickable links
- Automatically fetches command structure from Discord API
- Shows top-level commands, grouped subcommands, and context menu commands

**Utility Commands:**

- `/helpie ping` - Check bot latency and WebSocket ping
- `/helpie uptime` - Shows bot uptime (owner-only)

### Tags System

**Reusable message templates** with autocomplete and usage tracking:

```typescript
import TagModel from "../../models/Tag";

// Tags have two scopes: user (private) or global (owner-only)
// Create tag
const tag = new TagModel({
  userId: interaction.user.id,
  scope: "user", // or "global"
  name: "tagname",
  content: "Message content here",
});
await tag.save();

// Find tag (checks global first, then user-specific)
let tag = await TagModel.findOne({ scope: "global", name: name });
if (!tag) {
  tag = await TagModel.findOne({ userId: userId, scope: "user", name: name });
}
```

**Tag Commands** (under `/helpie tags`):

- `add` - Create a new tag (with `global` option for owners)
- `list` - List all your tags with usage stats
- `remove` - Delete a tag

**Tag Usage:**

- `/helpie tag <name>` - Send a tag by name with autocomplete
- Optional `target` parameter to ping a user
- Autocomplete shows matching tags (global + user tags)
- Tracks usage count and last used timestamp

**Tag Features:**

- Name validation: lowercase, alphanumeric, dashes/underscores only
- Max 100 chars for name, 2000 chars for content
- Usage statistics (count, last used date)
- Autocomplete integration for quick access
- Context menu: "Tags -> Add Tag" for quick creation from messages

### Translation Feature

**DeepL-powered translation** via context menu:

```typescript
// Context menu: "Utils -> Translate"
// Automatically detects source language and translates to English
// Requires DEEPL_API_KEY environment variable
```

**Features:**

- Right-click any message to translate
- Supports message content and embeds
- Auto-detects source language
- Shows original and translated text side-by-side
- Language detection included in response

### Context Menu Commands

**Separate from slash commands** - standalone context menu actions:

```typescript
import { ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";

export const data = new ContextMenuCommandBuilder().setName("Ask Helpie").setType(ApplicationCommandType.Message); // Or .User

export async function run(interaction: MessageContextMenuCommandInteraction, client: Client) {
  // Command logic
}
```

**Detection:** SimpleCommandHandler auto-detects context menu commands and registers separately (not under `/helpie`).

**Available Context Menu Commands:**

- **AI -> Ask** - Right-click message to ask Helpie about it
- **AI -> Add Context** - Add message to temporary context (5-min TTL)
- **AI -> Clear Context** - Clear temporary context for specific message
- **Utils -> Translate** - Translate message to English using DeepL
- **Tags -> Add Tag** - Quick tag creation from message content

### Key Files

- `src/utils/SimpleCommandHandler.ts` - Command loader and registration
- `src/utils/HelpieReplies.ts` - Universal reply system with emoji
- `src/services/ContextService.ts` - AI context management (permanent/GitHub-based)
- `src/utils/TemporaryContextManager.ts` - Temporary context manager (Redis-based, 5-min TTL)
- `src/utils/AskHelpie.ts` - Shared AI question processing logic
- `src/models/Tag.ts` - Tag model for reusable message templates
- `src/models/HelpieContext.ts` - Permanent context model
- `src/index.ts` - Bot initialization

## Anti-Patterns to Avoid

❌ **Don't**: Write scripts to test features (per project rules)  
❌ **Don't**: Create README, documentation, or guide files unless explicitly requested  
❌ **Don't**: Write documentation markdown files - focus on code implementation only  
❌ **Don't**: Use `console.log` - always use `log.*`  
❌ **Don't**: Silently swallow errors - always log and inform user  
❌ **Don't**: Make direct database calls in bot/ - use Database utility class for Redis caching  
❌ **Don't**: Use traditional Discord.js collectors - prefer ButtonKit (bot only, not helpie)  
❌ **Don't**: Hard-code values - use environment variables via FetchEnvs
❌ **Don't**: Use manual embeds in Helpie - always use HelpieReplies system
❌ **Don't**: Create `/helpie` command manually - SimpleCommandHandler does this automatically
❌ **Don't**: Use ContextService for non-context DB operations - it's only for AI context management
❌ **Don't**: Confuse permanent contexts (ContextService) with temporary contexts (TemporaryContextManager) - they serve different purposes

## Docker Deployment

**Single-container multi-service deployment** with health checks and graceful startup:

### Container Architecture

**Dockerfile Strategy:**

- Multi-stage build: logger → command-handler → bot → dashboard
- Local package linking via symlinks (not npm publish)
- Both services run in single container via `concurrently`
- Bun as primary runtime, Node.js 18 for compatibility

**Build Scripts:**

```bash
scripts/fast-build.sh           # Single platform (local testing)
scripts/multi-platform-build.sh # Multi-arch (amd64 + arm64)
```

### Service Startup (scripts/start.sh)

**Startup Sequence:**

1. Display container debug info (hostname, memory, env vars)
2. **Optional database setup** - Dashboard can run without DB (JWT sessions)
3. Concurrent service startup:
   - Bot: `tsx src/Bot.ts` on port 3001
   - Dashboard: `bun run start` on port 3000

**Database Handling:**

- If `DATABASE_URL` provided → attempts connection (10 retries)
- If connection fails → continues anyway (JWT-only mode)
- Dashboard doesn't require database for core functionality

### Health Checks (scripts/health-check.sh)

**Docker HEALTHCHECK configuration:**

- Interval: 60s between checks
- Timeout: 30s per check
- Start period: 120s (allows full startup)
- Retries: 5 before marking unhealthy

**Health Endpoints:**

- Bot API: `http://localhost:3001/api/health` (must return 200)
- Dashboard: `http://localhost:3000/api/health` (must return 200)

Both must respond successfully for container to be healthy.

### Environment Variables in Production

**Required for Bot:**

```bash
BOT_TOKEN=              # Discord bot token
MONGODB_URI=            # MongoDB connection string
MONGODB_DATABASE=       # Database name
REDIS_URL=              # Redis connection string
OWNER_IDS=              # Comma-separated user IDs
TEST_SERVERS=           # Comma-separated guild IDs
```

**Required for Dashboard:**

```bash
NEXTAUTH_SECRET=        # Secret for JWT signing
NEXTAUTH_URL=           # Public dashboard URL
DISCORD_CLIENT_ID=      # OAuth app ID
DISCORD_CLIENT_SECRET=  # OAuth secret
BOT_API_URL=            # Bot API URL (e.g., http://bot:3001)
INTERNAL_API_KEY=       # Shared secret for bot<->dashboard
AUTH_TRUST_HOST=true    # Required for reverse proxy
```

**Optional (Feature Flags):**

```bash
ENABLE_MINECRAFT_SYSTEMS=true
ENABLE_FIVEM_SYSTEMS=true
ENABLE_GITHUB_SUGGESTIONS=true
DEBUG_LOG=true          # Verbose logging
```

### Exposed Ports

- `3000` - Next.js dashboard (public)
- `3001` - Bot Express API (internal/public based on your setup)

### Resource Considerations

**System Dependencies:**

- FFmpeg (for audio processing)
- Node.js 18.x (compatibility)
- Bun runtime (primary)
- curl/wget (health checks)

**Memory:** Container runs both services - allocate accordingly (recommend 1GB+ for production)

### Deployment Best Practices

1. **Use docker-compose** for easier management:

```yaml
services:
  heimdall:
    image: ghcr.io/lerndmina/heimdall:latest
    ports:
      - "3000:3000"
      - "3001:3001"
    env_file: .env
    depends_on:
      - redis
      - mongo
```

2. **Health check monitoring**: Container won't be marked healthy until both services respond

3. **Graceful shutdown**: `concurrently` handles process termination

4. **Logs**: Use `docker logs -f <container>` to see both services' output

5. **Updates**: Pull latest image and recreate container (stateless design)

## Key Files Reference

- **bot/src/Bot.ts** - Bot initialization, CommandHandler setup
- **bot/src/utils/trycatch.ts** - Error handling utility
- **bot/src/utils/FetchEnvs.ts** - Environment variable manager
- **bot/src/utils/data/database.ts** - Database utility with Redis caching
- **bot/src/api/middleware/auth.ts** - API authentication
- **bot/src/utils/modmail/** - Complete modmail system utilities
- **dashboard/lib/api.ts** - Dashboard API client
- **command-handler/src/ButtonKit.ts** - Reactive button implementation
- **Dockerfile** - Full-stack containerization
- **scripts/start.sh** - Container startup orchestration
- **scripts/health-check.sh** - Health check implementation
