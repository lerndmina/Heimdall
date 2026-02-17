## Plan: Attachment Blocker Role Bypasses (DRAFT)

Add role-based bypasses to attachment-blocker with two scopes: global (guild-wide) and per-channel, using additive union semantics and full-check bypass behavior. The implementation extends existing models/API/UI without changing core blocking rule semantics. Enforcement will short-circuit early when a member has any configured bypass role for the active channel context. Dashboard and slash commands will both expose bypass configuration, reusing existing role-picker and role-validation patterns already used in moderation. Backward compatibility is preserved by defaulting new fields to empty arrays and treating missing fields as no bypass. This follows your decisions: no automatic admin bypass, global+channel additive merge, surface in dashboard+API+commands, and “skip all attachment checks.”

**Steps**

1. Extend data models and runtime types for bypass roles:
   - Add `bypassRoleIds: string[]` to guild config model in AttachmentBlockerConfig.ts.
   - Add `bypassRoleIds: string[]` to channel override model in AttachmentBlockerChannel.ts.
   - Update `EffectiveConfig` and related shaping in AttachmentBlockerService.ts (`resolveEffectiveConfig`, cache payload builders).

2. Implement enforcement bypass resolution in service layer:
   - Add helper in AttachmentBlockerService.ts to compute effective bypass set = guild `bypassRoleIds` ∪ channel `bypassRoleIds`.
   - In `checkAndEnforce`, short-circuit before block checks when member has any effective bypass role; keep existing bot/DM/voice-message short-circuits unchanged.
   - Ensure cache invalidation already triggered by config/channel updates also covers bypass changes.

3. Update backend API contracts and validation:
   - Extend config endpoints to read/write guild `bypassRoleIds` in config-get.ts and config-update.ts.
   - Extend channel endpoints to read/write channel `bypassRoleIds` in channels-get.ts and channels-update.ts.
   - Add payload validation/sanitization (array of role IDs, dedupe, max length guard) following moderation API style from locks.ts.

4. Add dashboard controls for bypass role management:
   - In [bot/plugins/dashboard/app/app/[guildId]/attachment-blocker/AttachmentBlockerPage.tsx](bot/plugins/dashboard/app/app/[guildId]/attachment-blocker/AttachmentBlockerPage.tsx), add:
     - Global bypass role selector bound to guild config.
     - Per-channel bypass role selector in channel override editor.
   - Reuse existing role picker patterns (same approach as moderation page role scoping in [bot/plugins/dashboard/app/app/[guildId]/moderation/ModerationPage.tsx](bot/plugins/dashboard/app/app/[guildId]/moderation/ModerationPage.tsx)).
   - Update TypeScript interfaces and API mapping to include `bypassRoleIds`.

5. Add slash command support for bypass role configuration:
   - Extend command surface under commands and/or subcommands with minimal operations:
     - Global: add/remove/list bypass roles.
     - Channel: add/remove/list bypass roles for a specific blocked channel.
   - Reuse existing command permission and response style from current attachment-blocker subcommands.

6. Update docs and migration notes:
   - Document new bypass behavior and precedence in bot/plugins/attachment-blocker/README.md (or plugin docs location if existing).
   - Add concise migration note: existing guilds/channels default to empty bypass arrays (no behavior change).

**Verification**

- Backend compile: run task `Build Bot (tsc)`.
- Dashboard compile: run task `Build Dashboard`.
- API checks:
  - Global bypass persists/returns in config GET/UPDATE.
  - Channel bypass persists/returns in channels GET/UPDATE.
- Runtime behavior checks:
  - User with bypass role posting blocked attachment in blocked channel: no delete, no DM, no timeout.
  - User without bypass role: existing enforcement unchanged.
  - Additive merge: global-only role bypasses everywhere; channel-only role bypasses only configured channel.
  - Missing legacy fields in DB do not throw and act as empty arrays.

**Decisions**

- Bypass behavior: full attachment-check bypass.
- Admin handling: no implicit admin bypass.
- Merge semantics: global + channel additive union.
- Delivery scope: dashboard + backend API + slash commands.
