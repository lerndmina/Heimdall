# Heimdall Bot — Agent Knowledge Base

## Overview

Heimdall is a **personal Discord bot** with a plugin-based architecture. It runs on **Bun** with **TypeScript**, uses **Discord.js 14**, **Express 5** for API, **MongoDB** (Mongoose) for persistence, and **Redis** for caching.

- **Runtime**: Bun (not Node.js) — use `bun run`, `bun install`, no `npm`/`npx`
- **Entry point**: `src/index.ts`
- **Dev command**: `bun run dev` from `bot/`
- **Ports**: API on `3001` (Express), Dashboard on `3000` (Next.js)

## Dashboard Environment Rules

- Any `NEXT_PUBLIC_*` value referenced in client code is baked into the Next.js build.
- If a value must be configurable per deployment, expose it via `/api/runtime-config` and read it from `plugins/dashboard/app/lib/runtimeConfig.ts`.
- Prefer `WS_PUBLIC_URL` (runtime) over adding new `NEXT_PUBLIC_*` variables when the value must vary by server.

---

## Project Structure

```
bot/
├── src/                    # Core bot infrastructure
│   ├── index.ts            # Main entry — phased init (env → DB → Discord → plugins)
│   ├── core/
│   │   ├── PluginLoader.ts     # Scans plugins/, resolves deps (Kahn's algo), loads in order
│   │   ├── CommandManager.ts   # Collects commands, guild-scoped registration
│   │   ├── EventManager.ts     # Discord event routing to plugins
│   │   ├── InteractionHandler.ts # Routes interactions → commands/components
│   │   ├── ApiManager.ts       # Express server, route mounting, Swagger, auth middleware
│   │   ├── OwnerCommands.ts    # Prefix commands for bot owner (`.reload`, `.eval`, etc.)
│   │   └── services/
│   │       ├── ComponentCallbackService.ts  # Button/menu callback registry
│   │       └── GuildEnvService.ts           # Encrypted per-guild env vars
│   ├── types/
│   │   ├── Plugin.ts       # PluginManifest, PluginContext, PluginModule, PluginAPI
│   │   ├── Client.ts       # HeimdallClient (Discord.js Client + plugins Map)
│   │   └── Env.ts          # GlobalEnv interface
│   └── utils/
│       ├── env.ts          # Environment loader with validation
│       ├── logger.ts       # Logging utility
│       └── sentry.ts       # Error tracking
├── plugins/                # All plugins live here
│   ├── lib/                # Shared utility plugin (always loads first)
│   ├── dev/                # Owner-only dev commands
│   ├── logging/            # Per-guild event logging
│   ├── minecraft/          # MC whitelist, linking, RCON, role sync
│   ├── minigames/          # Fun games
│   ├── ping/               # Simple ping command
│   ├── suggestions/        # Suggestion system with categories
│   ├── support-core/       # Shared support infrastructure
│   ├── tags/               # Custom tag/response system
│   ├── tempvc/             # Temporary voice channels
│   ├── welcome/            # Welcome messages and config
│   ├── modmail/            # DM-based modmail system
│   ├── tickets/            # Channel-based ticket system
│   ├── reminders/          # Scheduled reminders
│   └── dashboard/          # Next.js web dashboard
└── plans/                  # Planning documents
```

---

## Plugin System

### How Plugins Work

Each plugin is a folder in `plugins/` with at minimum:

1. **`manifest.json`** — metadata, dependencies, env requirements
2. **`index.ts`** — entry point with `onLoad`/`onDisable` exports

### Plugin Manifest (`manifest.json`)

```json
{
  "name": "example",
  "version": "1.0.0",
  "description": "What it does",
  "dependencies": ["lib"],
  "optionalDependencies": [],
  "requiredEnv": [],
  "optionalEnv": [],
  "apiRoutePrefix": "/example",
  "disabled": false
}
```

- `dependencies` — plugins that MUST load before this one (hard requirement)
- `optionalDependencies` — plugins that load first IF present (soft requirement)
- `requiredEnv` — env vars that must exist or the plugin refuses to load
- `optionalEnv` — env vars the plugin can use but doesn't require
- `apiRoutePrefix` — required if the plugin exposes API routes (sets the URL prefix)
- `disabled` — set `true` to skip loading

### Disabling Plugins via Environment

You can disable plugins at runtime using:

- `DISABLED_PLUGINS=pluginA,pluginB`

Notes:

- Comma-separated plugin names
- Case-insensitive matching
- Applied before dependency resolution and command/event registration
- Defaults to empty (no plugins disabled)

### Plugin Entry Point (`index.ts`)

```ts
import type { PluginContext, PluginAPI, PluginLogger } from "../../src/types/Plugin.js";
import type { LibAPI } from "../lib/index.js";

export interface MyPluginAPI extends PluginAPI {
  version: string;
  myService: MyService;
  lib: LibAPI;
}

export async function onLoad(context: PluginContext): Promise<MyPluginAPI> {
  const { client, logger, dependencies, getEnv } = context;
  const lib = dependencies.get("lib") as LibAPI;
  // ... initialize services, models, etc.
  return { version: "1.0.0", myService, lib };
}

export async function onDisable(logger: PluginLogger): Promise<void> {
  // cleanup
}

// These string exports tell PluginLoader where to scan
export const commands = "./commands"; // optional
export const events = "./events"; // optional
export const api = "./api"; // optional — requires apiRoutePrefix in manifest
```

### Load Order

PluginLoader resolves dependencies using **Kahn's algorithm** (topological sort). `lib` always loads first since every other plugin depends on it.

### PluginContext

Passed to `onLoad`. Provides:

- `client` — Discord.js client with `plugins` Map
- `mongoose` — Mongoose instance
- `redis` — Redis client
- `logger` — Scoped logger (`[pluginName]`)
- `dependencies` — `Map<string, PluginAPI>` of resolved dependency APIs
- `getEnv(key)` / `hasEnv(key)` — environment variable access
- `pluginPath` — absolute path to the plugin folder
- `componentCallbackService` — register button/menu handlers
- `guildEnvService` — encrypted per-guild env vars
- `commandManager`, `eventManager`, `apiManager` — core services

---

## Commands

### File Convention

- Place command files in `commands/` directory
- Each file exports `data` (SlashCommandBuilder) and `execute` (handler function)
- Optionally export `autocomplete` and `config`

### Subcommand Pattern

For commands with subcommands (e.g., `/logging setup`, `/logging view`):

1. **`commands/commandname.ts`** — exports `data` (SlashCommandBuilder with `.addSubcommand()`) but NO `execute`
2. **`subcommands/commandname/index.ts`** — exports `execute` that routes to sub-handlers
3. **`subcommands/commandname/setup.ts`** (etc.) — individual subcommand handlers

The PluginLoader auto-discovers the subcommand router: when a command file has `data` but no `execute`, it looks for `subcommands/{commandName}/index.ts` and uses its `execute`.

### Autocomplete

- **`commands/_autocomplete.ts`** — helper file exporting an `autocomplete` function
- Re-exported by the parent command: `export { autocomplete } from "./_autocomplete.js"`
- Files prefixed with `_` are skipped by the command scanner (they're helpers, not standalone commands)

### CommandContext

```ts
interface CommandContext {
  interaction: ChatInputCommandInteraction;
  client: HeimdallClient;
  getPluginAPI: <T>(pluginName: string) => T | undefined;
}
```

---

## API Routes

### Auto-Mounting

Plugins with API routes follow this pattern:

1. Add `export const api = "./api"` in plugin `index.ts`
2. Add `"apiRoutePrefix": "/example"` in `manifest.json`
3. Create `api/index.ts` exporting `createRouter(api: PluginAPI): Router`

PluginLoader auto-mounts the router at `/api/guilds/:guildId{prefix}` and auto-discovers Swagger JSDoc from all `.ts` files in the `api/` directory.

### Auth Middleware

All `/api/guilds/*` routes are protected by `X-API-Key` header validation against `INTERNAL_API_KEY`. Health (`/`, `/api/health`) and Swagger (`/api-docs`) are unprotected.

### Router Factory Pattern

```ts
// api/index.ts
import { Router } from "express";
import type { MyPluginAPI } from "../index.js";

export function createRouter(api: MyPluginAPI): Router {
  const router = Router({ mergeParams: true });
  // ... define routes
  return router;
}
```

### Response Envelope

All API responses use:

```ts
// Success
{ success: true, data: { ... } }
// Error
{ success: false, error: { code: "ERROR_CODE", message: "..." } }
```

---

## Dashboard Plugin

The dashboard is a **Next.js 15** app embedded as a plugin. It runs on its own port (default `3000`) and proxies API calls to the bot's Express server on port `3001`.

### Structure

```
plugins/dashboard/
├── manifest.json          # deps: lib, optionalDeps: all feature plugins
├── index.ts               # Boots Next.js via http.createServer
└── app/                   # Next.js app directory (has its own tsconfig.json)
    ├── next.config.mjs
    ├── tsconfig.json       # App-local config with DOM lib, @/* path aliases
    ├── tailwind.config.ts  # Discord brand colors, dark mode
    ├── middleware.ts        # NextAuth route protection
    ├── app/
    │   ├── layout.tsx       # Root layout with SessionProvider
    │   ├── page.tsx         # Guild selector grid
    │   ├── login/page.tsx   # Discord OAuth login
    │   ├── api/auth/[...nextauth]/route.ts
    │   ├── api/guilds/[guildId]/[...path]/route.ts  # Proxy to bot API
    │   └── [guildId]/
    │       ├── layout.tsx         # Guild layout with sidebar
    │       ├── page.tsx           # Guild overview
    │       └── minecraft/
    │           ├── page.tsx       # Tabbed view
    │           ├── PlayersTab.tsx
    │           ├── ConfigTab.tsx
    │           └── StatusTab.tsx
    ├── components/
    │   ├── icons.tsx
    │   ├── providers/       # SessionProvider, GuildProvider
    │   ├── layout/          # Sidebar
    │   └── ui/              # Card, DataTable, StatusBadge, Tabs
    ├── lib/
    │   ├── auth.ts          # NextAuth v5 config (Discord OAuth, JWT, guild filtering)
    │   ├── api.ts           # fetchApi() helper
    │   └── discord.ts       # CDN URL helpers
    └── types/
        └── next-auth.d.ts   # Extended session/JWT types
```

### Key Details

- **Auth**: NextAuth v5 beta with Discord provider, JWT sessions (no DB adapter), guild list filtered by ManageGuild/Owner permission
- **Proxy**: Dashboard frontend calls `/api/guilds/{guildId}/{path}` which forwards to `localhost:3001` with `X-API-Key`
- **TypeScript**: The dashboard app is **excluded** from the root `tsconfig.json` and uses its own. VS Code may show false-positive import errors for files inside `plugins/dashboard/app/` — these resolve correctly at Next.js runtime.
- **Tailwind**: v4 with `@import "tailwindcss"` syntax, Discord blurple brand colors
- **Environment variables**: Next.js has its own `.env` loading that only looks in its `dir` (the `app/` folder), NOT the bot root. The dashboard plugin **automatically generates `.env.local`** in `plugins/dashboard/app/` before booting Next.js. It reads `requiredEnv` + `optionalEnv` from `manifest.json` and forwards their values from `process.env`. To expose a new env var to the dashboard, simply add it to the dashboard's `manifest.json` under `requiredEnv` or `optionalEnv` — no need to touch `next.config.mjs` or create files manually. Implicit vars (`AUTH_SECRET`, `NEXTAUTH_URL`, `NODE_ENV`, `API_PORT`) are also forwarded automatically.

---

## Lib Plugin

The `lib` plugin is the shared utility layer. Every other plugin depends on it. Key exports:

- **ThingGetter** — fetch Discord entities (users, channels, guilds, roles, members) with caching
- **Component builders** — `createEmbedBuilder()`, `createButtonBuilder()`, `createStringSelectMenuBuilder()`, etc. — with both ephemeral (TTL-based callback) and persistent (handler ID) variants
- **ComponentCallbackService** — register/resolve button and menu interaction handlers
- **parseTime / parseDuration** — natural language time parsing
- **tryCatch / tryCatchSync** — Result-type error handling utilities
- **Footer messages** — random footer text with April Fools support

---

## Environment Variables

### Required (Global)

| Variable           | Description                                     |
| ------------------ | ----------------------------------------------- |
| `BOT_TOKEN`        | Discord bot token                               |
| `OWNER_IDS`        | Comma-separated Discord user IDs                |
| `MONGODB_URI`      | MongoDB connection string                       |
| `MONGODB_DATABASE` | Database name                                   |
| `REDIS_URL`        | Redis connection URL                            |
| `ENCRYPTION_KEY`   | 32-byte hex key for guild env encryption        |
| `INTERNAL_API_KEY` | Shared secret for API auth (`X-API-Key` header) |

### Optional (Global)

| Variable     | Description                         |
| ------------ | ----------------------------------- |
| `API_PORT`   | Express API port (default: `3001`)  |
| `DEBUG_LOG`  | Enable debug logging                |
| `SENTRY_DSN` | Sentry error tracking DSN           |
| `PREFIX`     | Owner command prefix (default: `.`) |

### Dashboard-specific

| Variable                | Required | Description                      |
| ----------------------- | -------- | -------------------------------- |
| `NEXTAUTH_SECRET`       | ✅       | NextAuth JWT secret              |
| `DISCORD_CLIENT_ID`     | ✅       | Discord OAuth client ID          |
| `DISCORD_CLIENT_SECRET` | ✅       | Discord OAuth client secret      |
| `DASHBOARD_PORT`        | ❌       | Dashboard port (default: `3000`) |

---

## Database

- **MongoDB** via Mongoose — all models use `mongoose.model()` pattern
- **Redis** — caching layer, passed to plugins via context
- Models are imported at plugin load time to register with Mongoose
- Each plugin owns its own models in `models/` directory

---

## Important Conventions

1. **Imports use `.js` extension** — e.g., `import { Foo } from "./bar.js"` (Bun/ESM requirement)
2. **All plugins get `lib` as a dependency** — it provides core utilities every plugin needs
3. **Express 5** — uses `Router({ mergeParams: true })` for nested route params
4. **Guild-scoped routes** — all API routes are under `/api/guilds/:guildId/`
5. **Component callbacks** — use `registerPersistentHandler(id, handler)` for buttons/menus that survive bot restarts; use TTL-based callbacks for ephemeral interactions
6. **tsconfig excludes dashboard app** — `plugins/dashboard/app` has its own `tsconfig.json` with DOM libs. The root tsconfig is for the bot (server-side only). Errors shown by VS Code for dashboard files are often false positives.
7. **Plugin API pattern** — each plugin's `onLoad` returns an API object that dependent plugins receive via `context.dependencies`

---

## Build & Deployment

### Docker Build Requirements

The Docker build uses `bun install --frozen-lockfile`, which **requires `bun.lock` to be in sync with `package.json`**. Any time you add, remove, or update a dependency, you **must** regenerate the lockfile before committing:

```bash
cd bot
bun install   # regenerates bun.lock
```

**Always use `bun install`** (not `npm install`) to add packages — this updates both `package.json` and `bun.lock` atomically:

```bash
bun add <package>           # adds to dependencies
bun add -d <package>        # adds to devDependencies
```

If `npm install` was used by mistake, run `bun install` afterwards to sync the lockfile.

**Edit-in-place replies** — when the bot sends a status/progress reply (e.g. queue position, download progress), always edit that same message in place with the final result rather than sending a second message.

**Pre-commit checklist:**

- `bun.lock` is up to date (`bun install` produces no changes)
- `bun run build` (or `npx tsc --noEmit`) passes with no type errors

---

## Git Workflow for Agents

After making code changes, **always commit using the git tools** — don't leave changes unstaged.

### Commit approach

- Group related changes into logical commits (one feature/fix per commit) rather than one giant commit per session
- Use [Conventional Commits](https://www.conventionalcommits.org/) format: `feat(scope):`, `fix(scope):`, `chore(scope):`, `perf(scope):`, `refactor(scope):`
- **`fix:` vs `feat:`** — if the motivation was to correct a bug, a performance problem, or unexpected behaviour, use `fix:` even if the solution involved adding new code (a new cache, a new helper, a new config option). `feat:` is for deliberate new user-facing capabilities. When in doubt: ask "was something broken?" — if yes, it's `fix:`.
- Stage and commit each group before moving on to the next area of work

### Using the git tools

```
mcp_gitkraken_git_add_or_commit  action="add"    files=[...]   # stage specific files
mcp_gitkraken_git_add_or_commit  action="commit" message="..." # commit staged files
```

To see what's changed before staging:
```
mcp_gitkraken_git_status  directory="..."
```

### Example groupings

| Group | Files |
|-------|-------|
| New plugin (model + service + API + events) | All files in `plugins/<name>/` |
| Dashboard embed support for one plugin | model + service + api route + dashboard page |
| Shared UI component | `plugins/dashboard/app/components/ui/<Name>.tsx` |
| Core infrastructure changes | `src/core/*.ts`, `src/index.ts` |
| Build/config | `package.json`, `tsconfig.json`, `.gitignore`, etc. |

New untracked files (e.g. new plugins, new components) must be staged explicitly — `git add` of the directory path will include all nested files.
