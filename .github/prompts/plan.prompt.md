## Plan: Full Migration System Overhaul — Two Modes + WebSocket Progress

**TL;DR**: Restructure the migration system into two modes: **Legacy Import** (existing old-bot→new-bot with improved step coverage) and **Instance Clone** (new-bot→new-bot, all 40 Mongoose models). Replace SSE streaming with WebSocket progress broadcasts (owner-only). Add per-record progress for large collections. Dashboard gets two tabs — one for each mode.

**Steps**

### Backend — Migration Engine

1. **Create plugins/dev/utils/cloneMigration.ts** — New "Instance Clone" engine
   - `runCloneMigration(options)` orchestrator — connects to source Heimdall DB, iterates every collection, copies documents to local DB
   - Group collections by plugin (config models first, then data models) for logical step ordering
   - For each collection: count source docs → stream-copy with per-record progress via `onProgress` callback → skip existing by unique key (idempotent)
   - Handle the `Infraction.ruleId` ObjectId ref: build an `oldId→newId` map for `AutomodRule` docs, then remap `ruleId` in `Infraction` docs
   - Handle encrypted fields (`GuildEnv.encryptedValue`, `ModmailConfig.categories[].encryptedWebhookToken`, `MinecraftConfig.encryptedRconPassword`): copy raw ciphertext as-is (both instances must share the same `ENCRYPTION_KEY`, warn user in UI)
   - Skip TTL-indexed ephemeral models (`TicTacToe`, `Connect4`) — they auto-delete in 24h anyway
   - Support optional `guildId` filter — if provided, only copy docs matching that guild
   - ~22 logical steps grouped by plugin (AttachmentBlocker, Dashboard, Logging, Minecraft, Minigames, Moderation, Modmail, Reminders, RoleButtons, Suggestions, SupportCore, Tags, TempVC, Tickets, VCTranscription, Welcome, Core)

2. **Refactor plugins/dev/utils/migration.ts** — Improve existing "Legacy Import"
   - Add `onRecordProgress` callback alongside existing `onProgress` for per-record updates within large steps (modmail, suggestions, tags)
   - Update `MigrationProgressEvent` to include `recordIndex` and `recordTotal` optional fields
   - No schema changes needed — same 7 steps, just finer-grained progress

3. **Shared progress types in plugins/dev/utils/migrationTypes.ts**
   - `MigrationMode`: `"legacy"` | `"clone"`
   - `MigrationProgressEvent`: `{ mode, step, label, plugin, completed, total, recordIndex?, recordTotal?, result? }`
   - `MigrationResult`: existing shape `{ success, imported, skipped, errors[], details? }`
   - Used by both engines and the WS broadcast

### Backend — WebSocket Broadcasting

4. **Add owner-only WS broadcast to plugins/dev/api/migrate.ts**
   - Import `broadcast` from core; wrap the `onProgress` callback to call `wsManager.broadcastToOwners(event, data)` (new method)
   - Events: `migration:step_start`, `migration:step_progress` (per-record), `migration:step_complete`, `migration:complete`, `migration:error`
   - Remove SSE streaming entirely — WS replaces it

5. **Add `broadcastToOwners` method to src/core/WebSocketManager.ts**
   - New method that sends to all authenticated sockets whose `userId` is in `OWNER_IDS`
   - No guild scoping — owner-only global broadcast
   - Event format: `{ event: "migration:*", data: MigrationProgressEvent }`

6. **Add new API route `POST /api/dev/clone`** in plugins/dev/api/migrate.ts (or a new `clone.ts`)
   - Owner-only guard (same as existing `/migrate`)
   - Accepts `{ sourceDbUri, guildId? }`
   - Validates connection, fires `runCloneMigration()` with WS progress callback
   - Returns final stats as JSON (progress is via WS, not SSE)

7. **Update plugins/dev/api/migrate.ts** — existing `/migrate` endpoint
   - Keep JSON response but add WS progress callback
   - Remove SSE response format (WS replaces it)
   - Add `modmailCollection` to accepted body params (already in slash command but missing from API)

### Dashboard — UI

8. **Restructure app/dev/migration/page.tsx** — Add tabs
   - Two tabs: **"Legacy Import"** (old bot) and **"Instance Clone"** (Heimdall→Heimdall)
   - Extract existing form into `LegacyMigrationTab` component
   - Create `CloneMigrationTab` component with: Source DB URI input, optional Guild ID, encryption key warning banner, Start button
   - Both tabs share a common `MigrationProgress` component for WS-driven live updates

9. **Create shared `MigrationProgress` component** — reusable progress UI
   - Subscribes to WS events `migration:step_start`, `migration:step_progress`, `migration:step_complete`, `migration:complete`, `migration:error`
   - Uses `useRealtimeEvent` or a custom hook (since this is owner-only, not guild-scoped — may need a new `useOwnerEvent` hook or use the raw WS context)
   - Per-step cards with spinner/checkmark (existing UI pattern)
   - Per-record progress bar within each step card for large collections
   - Overall progress bar showing `step X/Y` and `record M/N` within the current step
   - Auto-scrolls to active step

10. **Update app/api/dev/migrate/route.ts** — Simplify
    - Remove SSE streaming logic — just forward POST and return JSON
    - Add new `POST /api/dev/clone` proxy route (same auth pattern)

### WebSocket — Owner Events Support

11. **Add owner-event subscription support to WebSocket client**
    - The current websocket.tsx only supports guild-scoped subscriptions (`subscribe(guildId, event, handler)`)
    - Add a new `subscribeGlobal(event, handler)` method for events not scoped to a guild
    - Or: use a sentinel guild ID like `"__global__"` to piggyback on existing infrastructure
    - Create `useOwnerEvent(event, handler)` hook for the migration page to consume

### Documentation

12. **Update plugins/dev/MIGRATION.md** — Add Instance Clone section
    - Document the two modes, what each clones, the encryption key requirement
    - Update the "What Gets Migrated" list to include all 40 models for clone mode

**Verification**

- Build passes (`npm run build`)
- Legacy migration still works (same 7 steps, now with WS progress)
- Clone migration: connect to a test Heimdall DB → all collections copy → idempotent re-run skips existing
- Dashboard: both tabs render, WS progress updates appear live, per-record progress animates smoothly
- Owner-only: non-owners cannot see migration page or receive WS events

**Decisions**

- **WS over SSE**: SSE requires a proxy passthrough in Next.js that's fragile (especially with the new single-port nginx setup). WS is already established infrastructure with auth.
- **Raw collection copy for clone mode**: Since both DBs have identical schemas, we use `collection.find().lean()` + `Model.insertMany()` rather than per-field transformation. Simpler, faster, less error-prone.
- **Skip TicTacToe/Connect4**: 24h TTL means these are ephemeral game state — not worth cloning.
- **Encrypted fields copied as-is**: Both instances need the same `ENCRYPTION_KEY`. The UI shows a warning about this requirement. Re-encrypting would require having both keys simultaneously which is impractical.
- **`broadcastToOwners` over guild-scoped**: Migration is a global operation (can span multiple guilds). Owner-only broadcast avoids needing a guild context.
