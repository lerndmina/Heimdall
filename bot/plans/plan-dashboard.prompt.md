# Plan: Next.js Dashboard Plugin

Dashboard plugin runs on its own port (e.g., 3000), contacts the bot API at its port (3001) using `INTERNAL_API_KEY` via `X-API-Key` header. Next.js deps in the bot's `package.json`.

## Steps

### Step 1 — Extract plugin-bot to its own repository ✅

Done — bot now lives in its own folder.

### Step 2 — Add API auth + auto-mount API routes

Two sub-tasks:

#### 2a — API key auth middleware

- Add `INTERNAL_API_KEY` to `GlobalEnv` in `src/types/Env.ts` and `src/utils/env.ts` as a **required** env var.
- Create an Express middleware in `ApiManager` that validates `X-API-Key` header against `INTERNAL_API_KEY` and apply it to all guild-scoped routes (before `mountRouters`).
- Health (`/`, `/api/health`) and Swagger (`/api-docs`) routes stay unprotected.
- Expose `getServer(): http.Server` by storing the return value of `app.listen()` (currently discarded) — needed for WebSocket upgrade later.

#### 2b — Auto-mount plugin API routes in PluginLoader

Currently all 8 plugins with API routes (logging, minecraft, reminders, suggestions, tags, tempvc, tickets, welcome) manually import their router factory and call `apiManager.registerRouter(...)` in `onLoad`. Modmail has an `api/` directory but never mounts it — a bug.

**Refactor:**

- Add `export const api = "./api"` convention to `PluginModule` interface in `src/types/Plugin.ts`.
- Add `loadPluginApi()` method to `PluginLoader` that:
  1. Imports the plugin's `api/index.ts`.
  2. Calls the exported `createXxxRouter(deps)` factory. The factory receives the plugin's API object (returned from `onLoad`) as deps — each factory already expects its own `ApiDependencies` interface.
  3. Calls `apiManager.registerRouter({ pluginName, prefix: manifest.apiRoutePrefix, router, swaggerPaths })`.
- Call `loadPluginApi()` after commands/events in `loadPlugin()`, gated on `module.api` existing.
- Remove the manual `apiManager.registerRouter(...)` boilerplate from all 9 plugin `onLoad` functions (logging, minecraft, modmail, reminders, suggestions, tags, tempvc, tickets, welcome).
- Each plugin's `api/index.ts` factory function must accept the plugin's own API object as its deps argument. Standardize the convention: `export function createRouter(deps: PluginAPI): Router`.
- Modmail's router is fixed automatically by this — it already has `api/index.ts` with `createModmailRouter`, it just needs `export const api = "./api"` and `apiRoutePrefix` in its manifest (already present).

### Step 3 — Create `plugins/dashboard/` plugin scaffold

- `manifest.json`:
  - `dependencies`: `["lib"]`
  - `optionalDependencies`: `["minecraft", "modmail", "tickets", "suggestions", "tags", "logging", "welcome", "tempvc", "reminders"]`
  - `requiredEnv`: `["INTERNAL_API_KEY", "NEXTAUTH_SECRET", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"]`
  - `optionalEnv`: `["DASHBOARD_PORT"]`
- `index.ts` `onLoad`:
  - Create Next.js app via `next({ dev: NODE_ENV !== 'production', dir: path.join(pluginPath, 'app') })`.
  - Call `app.prepare()`.
  - Create `http.createServer(app.getRequestHandler())`.
  - Listen on `DASHBOARD_PORT` (default 3000, loaded via `context.getEnv("DASHBOARD_PORT")`).
  - Store the server reference for `onDisable` to call `server.close()`.
- Add `next`, `react`, `react-dom`, `next-auth@beta` to the bot's `package.json`.

### Step 4 — Build the Next.js app at `plugins/dashboard/app/` (scaffold)

Start small — get guild selector + minecraft views scaffolded so we can iterate on design.

#### Auth

- NextAuth v5 Discord OAuth, JWT sessions (no DB adapter).
- Stores `userId`, `accessToken`, guild list (filtered to ManageGuild permission).
- Env vars `NEXTAUTH_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` loaded via manifest `requiredEnv`.

#### Proxy API

- `app/api/guilds/[guildId]/[...path]/route.ts` — catch-all.
- Validates NextAuth session → forwards to `http://localhost:{API_PORT}/api/guilds/{guildId}/{path}` with `X-API-Key` header.
- Permission checks deferred to a later step.

#### Pages (scaffold)

- **Guild Selector** — `app/(dashboard)/page.tsx`: grid of accessible guilds from session.
- **Guild Layout** — `app/(dashboard)/[guildId]/layout.tsx`: sidebar with feature links, guild header.
- **Minecraft** — `app/(dashboard)/[guildId]/minecraft/page.tsx`: tabbed view scaffold.
  - **Players** — DataTable placeholder with search.
  - **Config** — settings form placeholder.
  - **Server Status** — server list placeholder.

#### Shared Components

- `GuildProvider`, `DataTable`, `StatusBadge`, basic shadcn primitives.
- Designed for other plugin pages to slot in later.

### Step 5 — WebSocket support (future)

- Socket.IO server attached to the dashboard's own `http.createServer` (dashboard port handles both Next.js + WS).
- Authenticated with session token, guild-scoped event rooms.
- Bot-side emits events via the existing `ModmailWebSocketService` pattern — pass the Socket.IO server instance to it.

### Step 6 — DashboardPermission model + command (future)

- Schema: `{ guildId, userId, permissions: Map<feature, 'read' | 'write' | 'none'> }`.
- Guild owner defaults to all `write`, ManageGuild users default to all `read`.
- CRUD via `/api/guilds/:guildId/dashboard/permissions` API route.
- `/permissions` slash command for guild admins to manage access from Discord.
- Proxy API route in Step 4 gates requests by permission level.

## Design Decisions

### Dependencies in bot's `package.json`

Put `next`, `react`, `react-dom`, and `next-auth` directly in the bot's `package.json`. The dashboard is a plugin but it's not optional in the same way Minecraft is — you either deploy with a dashboard or you don't. Keeping deps at the top level avoids a nested install step and simplifies the Dockerfile build stage. If we later want to make it truly optional, a plugin-level `package.json` with a pre-install hook is the escape hatch.

### API route auto-mounting

All plugins follow the same router factory pattern (`api/index.ts` exports `createXxxRouter(deps)`). Rather than each plugin manually importing and registering its router, `PluginLoader` handles it automatically when a plugin exports `api = "./api"`. This eliminates boilerplate, fixes the modmail bug, and makes adding API routes to new plugins trivial.

### `INTERNAL_API_KEY` as static env var

The `INTERNAL_API_KEY` is a user-provided secret in `.env`, required globally. Both the API middleware and the dashboard plugin read it — the API validates incoming requests, the dashboard sends it with outgoing requests. This is simpler and more transparent than auto-generation.

### WebSocket architecture

Attach Socket.IO to the dashboard's own `http.createServer` (Option B). The dashboard already owns a port and the WS is only consumed by dashboard clients. The bot-side just needs to emit events — the existing `ModmailWebSocketService` pattern works (pass the Socket.IO server instance to it).

### Dockerfile changes

The new standalone Dockerfile needs a build stage: `next build` inside `plugins/dashboard/app/` during container build, then `onLoad` starts Next.js in production mode pointing at the `.next` output. Add `EXPOSE 3000 3001` for both ports.

### Separate port (not mounted on Express)

Dashboard runs on its own port (3000) via `http.createServer()`. This avoids HMR WebSocket conflicts in dev mode, avoids needing `basePath` configuration, and gives clean separation. The Next.js backend contacts the bot API at `localhost:3001` with `X-API-Key` for all data.

### Permission model

Per-feature read/write permissions stored in bot's MongoDB (not a separate DB). Two permission levels per feature: `read` (view data) and `write` (modify data). Defaults derived from Discord guild permissions — guild owner gets all `write`, ManageGuild users get all `read`. Custom overrides stored in `DashboardPermission` model. No separate permission DB needed.

### Incremental build approach

Scaffold the dashboard with guild selector + minecraft views first. Get the design and data flow working before building out remaining plugin pages, WebSocket support, and permission model.
