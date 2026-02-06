# Plan: Next.js Dashboard Plugin

Dashboard plugin runs on its own port (e.g., 3000), contacts the bot API at its port (3001) using `INTERNAL_API_KEY` via `X-API-Key` header. plugin-bot extracted to its own repo. Next.js deps scoped to plugin-bot's `package.json`.

## Steps

### Step 1 — Extract plugin-bot to its own repository

It's already fully independent — zero `@heimdall/*` imports, own logger, own core services, not referenced by root scripts or the Dockerfile. Move the directory contents to a new repo root, delete the stale `bun.lock`, run `bun install` fresh, create a standalone Dockerfile (simple: `bun install` → copy source → `CMD tsx src/index.ts`). No code changes required.

### Step 2 — Add API auth to `ApiManager`

In `src/core/ApiManager.ts`:

- Add `INTERNAL_API_KEY` to `GlobalEnv` in `src/types/Env.ts` and `src/utils/env.ts`.
- Create an Express middleware that validates `X-API-Key` header against `INTERNAL_API_KEY` and apply it to all guild-scoped routes (before `mountRouters`).
- Health/swagger routes stay unprotected.
- Expose `getServer(): http.Server` by storing the return value of `app.listen()` (currently discarded at line ~200) — needed for WebSocket upgrade in Step 5.

### Step 3 — Fix modmail API mounting

In `plugins/modmail/index.ts`:

- Import `createModmailRouter` from the existing `plugins/modmail/api/index.ts`.
- Call `apiManager.registerRouter({ pluginName: 'modmail', prefix: '/modmail', router, swaggerPaths })` in `onLoad`.
- Pass required services to the router factory.

### Step 4 — Create `plugins/dashboard/` plugin scaffold

- `manifest.json` depends on `lib` (required) with optional deps on `minecraft`, `modmail`, `tickets`, etc.
- `index.ts` `onLoad`:
  - Create Next.js app via `next({ dev: NODE_ENV !== 'production', dir: path.join(pluginPath, 'app') })`.
  - Call `app.prepare()`.
  - Create `http.createServer(app.getRequestHandler())`.
  - Listen on `DASHBOARD_PORT` (default 3000).
  - Store the server reference for `onDisable` to call `server.close()`.
- Add `next`, `react`, `react-dom`, `next-auth@beta` to plugin-bot's `package.json`.

### Step 5 — Build the Next.js app at `plugins/dashboard/app/`

#### Auth

- NextAuth v5 Discord OAuth, JWT sessions (no DB adapter).
- Stores `userId`, `accessToken`, guild list (filtered to ManageGuild permission).

#### Proxy API

- `app/api/guilds/[guildId]/[...path]/route.ts` — catch-all.
- Validates NextAuth session → checks `DashboardPermission` for read/write → forwards to `http://localhost:{API_PORT}/api/guilds/{guildId}/{path}` with `X-API-Key` header.

#### WebSocket

- Socket.IO server attached to the dashboard's own `http.createServer` (dashboard port handles both Next.js + WS).
- Authenticated with session token, guild-scoped event rooms.
- Bot-side emits events via the existing `ModmailWebSocketService` pattern — pass the Socket.IO server instance to it.

#### DashboardPermission model

- Schema: `{ guildId, userId, permissions: Map<feature, 'read' | 'write' | 'none'> }`.
- Guild owner defaults to all `write`, ManageGuild users default to all `read`.
- CRUD via `/api/guilds/:guildId/dashboard/permissions` API route.
- `/permissions` slash command for guild admins to manage access from Discord.

### Step 6 — Build frontend pages

Using shadcn/ui + Tailwind + TanStack Query.

#### Guild Selector

- `app/(dashboard)/page.tsx`: grid of accessible guilds from session.

#### Guild Layout

- `app/(dashboard)/[guildId]/layout.tsx`: sidebar (feature links gated by ≥ read permission), guild header.

#### Minecraft Management

- `app/(dashboard)/[guildId]/minecraft/page.tsx`: tabbed view.
  - **Players** — DataTable with search, approve/reject/link/unlink actions.
  - **Config** — setup settings, custom messages.
  - **Server Status** — monitored servers list, add/remove.

#### Shared Components

- `PermissionGuard`, `GuildProvider`, `DataTable`, `StatusBadge`, shadcn primitives.
- Designed for other plugin pages to slot in later.

## Design Decisions

### Dependencies in plugin-bot's `package.json`

Put `next`, `react`, `react-dom`, and `next-auth` directly in plugin-bot's `package.json`. The dashboard is a plugin but it's not optional in the same way Minecraft is — you either deploy with a dashboard or you don't. Keeping deps at the top level avoids a nested install step and simplifies the Dockerfile build stage. If we later want to make it truly optional, a plugin-level `package.json` with a pre-install hook is the escape hatch.

### WebSocket architecture

Attach Socket.IO to the dashboard's own `http.createServer` (Option B). The dashboard already owns a port and the WS is only consumed by dashboard clients. The bot-side just needs to emit events — the existing `ModmailWebSocketService` pattern works (pass the Socket.IO server instance to it).

### Dockerfile changes

The new standalone Dockerfile needs a build stage: `next build` inside `plugins/dashboard/app/` during container build, then `onLoad` starts Next.js in production mode pointing at the `.next` output. Add `EXPOSE 3000 3001` for both ports.

### Separate port (not mounted on Express)

Dashboard runs on its own port (3000) via `http.createServer()`. This avoids HMR WebSocket conflicts in dev mode, avoids needing `basePath` configuration, and gives clean separation. The Next.js backend contacts the bot API at `localhost:3001` with `X-API-Key` for all data.

### Permission model

Per-feature read/write permissions stored in bot's MongoDB (not a separate DB). Two permission levels per feature: `read` (view data) and `write` (modify data). Defaults derived from Discord guild permissions — guild owner gets all `write`, ManageGuild users get all `read`. Custom overrides stored in `DashboardPermission` model. No separate permission DB needed.

### Extraction from monorepo

plugin-bot is already fully independent — zero `@heimdall/*` imports, own logger, own core services, not in root scripts or Dockerfile. Extraction is a directory move + fresh `bun install` + new Dockerfile. No code changes.
