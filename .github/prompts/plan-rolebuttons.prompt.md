## Plan: Role Buttons Plugin

A new `rolebuttons` plugin that lets admins create reusable role-panel templates (custom embed + buttons → role assignments), post them to channels as persistent panels, and manage everything from the dashboard. Buttons survive restarts via the existing `PersistentComponent` infrastructure.

**Steps**

### 1. Plugin scaffold

Create bot/plugins/rolebuttons/ with the standard structure:

- manifest.json — `name: "rolebuttons"`, depends on `["lib"]`, optional dep on `["dashboard"]`, `apiRoutePrefix: "/rolebuttons"`
- index.ts — imports models (side-effect), creates `RoleButtonService`, registers persistent handler `"rolebuttons.assign"`, exports `RoleButtonsPluginAPI`
- Exported paths: `commands`, `api`, `events` (for `guildRoleDelete` cleanup)

### 2. Database models

Create bot/plugins/rolebuttons/models/RoleButtonPanel.ts:

```
RoleButtonPanel {
  id:          String (nanoid, unique)
  guildId:     String (indexed)
  name:        String (unique per guild, for autocomplete/display)

  // Custom embed config
  embed: {
    title:       String (optional)
    description: String (optional)
    color:       String (optional, hex)
    image:       String (optional, URL)
    thumbnail:   String (optional, URL)
    footer:      String (optional)
    fields:      [{ name: String, value: String, inline: Boolean }] (optional)
  }

  // Button definitions (ordered array, max 25)
  buttons: [{
    id:        String (nanoid)
    label:     String (required)
    emoji:     String (optional)
    style:     Number (ButtonStyle enum: Primary/Secondary/Success/Danger)
    roleId:    String (required — one role per button)
    mode:      String (enum: "toggle" | "add" | "remove")
    row:       Number (0-4, which ActionRow — allows admin to control layout)
  }]

  // Panel-level settings
  exclusive:   Boolean (default false — if true, clicking a button removes other roles from this panel)

  // Tracking posted instances
  posts: [{
    channelId: String
    messageId: String
    postedAt:  Date
    postedBy:  String
  }]

  createdBy:   String
  timestamps:  true
}
```

Indexes: `(guildId, name)` unique compound, `guildId` alone.

### 3. Service layer

Create bot/plugins/rolebuttons/services/RoleButtonService.ts:

- **CRUD**: `createPanel()`, `getPanel()`, `listPanels()`, `updatePanel()`, `deletePanel()`
- **`buildPanelMessage(panel, lib)`** — constructs the embed from `panel.embed` using `lib.createEmbedBuilder()`, creates persistent buttons via `lib.createButtonBuilderPersistent("rolebuttons.assign", { panelId, buttonId, roleId, mode })`, groups by `button.row`, returns `{ embeds, components }`
- **`postPanel(panel, channel, userId, lib)`** — calls `buildPanelMessage()`, sends to channel, pushes to `panel.posts[]`, saves
- **`updatePostedPanels(panel, client, lib)`** — rebuilds message and edits all live `posts[]` (for when template is edited)
- **`handleRoleAssignment(interaction, metadata)`** — the persistent handler logic:
  1. Retrieve `panelId`, `buttonId`, `roleId`, `mode` from metadata
  2. Fetch panel from DB (for `exclusive` setting)
  3. Resolve the member
  4. If `exclusive` and member is gaining a role: remove all other roles from this panel's buttons first
  5. Apply `toggle`/`add`/`remove` logic
  6. Ephemeral reply: "Added **@RoleName**" / "Removed **@RoleName**" / "You already have/don't have this role"
  7. Handle errors (missing role, missing permissions, hierarchy issues) with user-friendly ephemeral messages
- **`cleanupDeletedRole(guildId, roleId)`** — removes buttons referencing a deleted role from all panels, updates posted messages

### 4. Persistent handler registration

In index.ts `onLoad()`:

```
componentCallbackService.registerPersistentHandler("rolebuttons.assign", (interaction) => {
  const metadata = await componentCallbackService.getPersistentComponentMetadata(interaction.customId);
  await roleButtonService.handleRoleAssignment(interaction, metadata);
});
```

### 5. Slash commands

Create bot/plugins/rolebuttons/commands/rolebuttons.ts with subcommands, routed via bot/plugins/rolebuttons/subcommands/rolebuttons/index.ts:

| Subcommand | Options                           | Behavior                                                                                                                                                          |
| ---------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create`   | `name`                            | Creates a blank panel template, replies with instructions to use `edit` and `post`                                                                                |
| `edit`     | `panel` (autocomplete)            | Opens a multi-step ephemeral config panel (similar to ModmailConfigPanel) with buttons to edit embed fields, add/remove/reorder buttons, set exclusivity, preview |
| `post`     | `panel` (autocomplete), `channel` | Builds & posts the panel to the target channel                                                                                                                    |
| `update`   | `panel` (autocomplete)            | Rebuilds and edits all live posted instances of this panel                                                                                                        |
| `delete`   | `panel` (autocomplete)            | Deletes template + optionally deletes posted messages                                                                                                             |
| `list`     | —                                 | Lists all panels in the guild with post counts                                                                                                                    |

The `edit` subcommand uses an ephemeral interactive panel (like modmail config) with views:

- **Home**: Panel name, exclusivity toggle, button list, preview button
- **Embed Editor**: Title, description, color, image URL, thumbnail URL, footer, fields (add/edit/remove)
- **Button Editor**: For each button — label, emoji, style (dropdown), role (role select menu), mode (toggle/add/remove), row assignment
- **Preview**: Shows the final embed + buttons as they'll appear

All interactive elements use ephemeral callbacks with TTL (like ModmailConfigPanel's `btn()` pattern).

### 6. Event handler

Create bot/plugins/rolebuttons/events/guildRoleDelete/cleanup.ts:

- Listens for `Events.GuildRoleDelete`
- Calls `roleButtonService.cleanupDeletedRole(guildId, roleId)`
- Logs which panels were affected

### 7. API routes

Create bot/plugins/rolebuttons/api/ with:

| Method                              | Path                                              | Action                                          |
| ----------------------------------- | ------------------------------------------------- | ----------------------------------------------- |
| `GET /`                             | List all panels for the guild                     | `listPanels()`                                  |
| `POST /`                            | Create a new panel                                | `createPanel()`                                 |
| `GET /:panelId`                     | Get a single panel                                | `getPanel()`                                    |
| `PUT /:panelId`                     | Update panel config (embed, buttons, exclusivity) | `updatePanel()`                                 |
| `DELETE /:panelId`                  | Delete panel + clean up persistent components     | `deletePanel()`                                 |
| `POST /:panelId/post`               | Post panel to a channel `{ channelId }`           | `postPanel()`                                   |
| `POST /:panelId/update-posts`       | Rebuild & edit all posted instances               | `updatePostedPanels()`                          |
| `DELETE /:panelId/posts/:messageId` | Delete a specific posted instance                 | Removes from `posts[]`, deletes Discord message |

### 8. Dashboard page

Create [bot/plugins/dashboard/app/app/[guildId]/rolebuttons/page.tsx](bot/plugins/dashboard/app/app/%5BguildId%5D/rolebuttons/page.tsx) and a `RoleButtonsPage.tsx` client component.

**Layout**: Two-pane — panel list (left/top) + editor (right/bottom).

**Panel List view**:

- Table/card grid of all panels: name, button count, post count, created date
- Create New button → opens create modal
- Click to edit

**Panel Editor view** (multi-section form):

- **Embed section**: Title, description, color picker, image URL, thumbnail URL, footer text, fields editor (add/remove/reorder field rows)
- **Buttons section**: Sortable list of button configs. Each row has: label input, emoji input, style dropdown (Primary/Secondary/Success/Danger), role selector (`RoleCombobox`), mode dropdown (Toggle/Add-only/Remove-only), row number (0-4). Add/remove button controls. Max 25 buttons.
- **Settings section**: Exclusive toggle
- **Live Preview**: Renders a mock of the embed + buttons as they'll appear in Discord
- **Actions bar**: Save, Post to Channel (channel selector + post button), Update Posted Messages, Delete

**Post modal**: Channel selector (`ChannelCombobox`) + confirm button → `POST /:panelId/post { channelId }`

**Posted instances list**: Below the editor, shows all places this panel is posted (channel name, date, posted by) with individual delete buttons.

### 9. Dashboard permission wiring

Add to routePermissions.ts:

```
"GET /rolebuttons"                    → "rolebuttons.view"
"GET /rolebuttons/*"                  → "rolebuttons.view"
"POST /rolebuttons"                   → "rolebuttons.manage"
"PUT /rolebuttons/*"                  → "rolebuttons.manage"
"DELETE /rolebuttons/*"               → "rolebuttons.manage"
"POST /rolebuttons/*/post"            → "rolebuttons.manage"
"POST /rolebuttons/*/update-posts"    → "rolebuttons.manage"
"DELETE /rolebuttons/*/posts/*"       → "rolebuttons.manage"
```

Add to permissionDefs.ts:

```
{ key: "rolebuttons", label: "Role Buttons", description: "Manage self-assignable role button panels.",
  actions: [
    { key: "view", label: "View Panels", description: "View role button panel configs." },
    { key: "manage", label: "Manage Panels", description: "Create, edit, delete, and post role button panels." }
  ]
}
```

Add to `NAV_ITEMS` in GuildLayoutShell.tsx:

```
{ label: "Role Buttons", href: (id) => `/${id}/rolebuttons`, icon: <RoleButtonsIcon />, category: "rolebuttons" }
```

Add `"rolebuttons"` to the dashboard plugin's `optionalDependencies` in manifest.json, and to the features detection in dashboard/index.ts.

### 10. Realtime updates

- Bot API routes broadcast `broadcastDashboardChange(guildId, "rolebuttons", "updated", ...)` on mutations
- Dashboard component subscribes via `useRealtimeEvent("rolebuttons:updated", fetchPanels)`

**Verification**

1. **Unit**: Create a panel with `create`, verify it's in `list`, add buttons via `edit`, `post` to a test channel, click buttons to verify role toggle/add/remove works, restart bot and verify buttons still work
2. **Exclusivity**: Create a panel with `exclusive: true` and 3 color roles, verify clicking one removes the others
3. **Role deletion**: Delete a role from Discord, verify the button is removed from the panel and posted messages are updated
4. **Dashboard**: Navigate to Role Buttons page, create/edit/post/delete a panel, verify realtime updates
5. **Permissions**: Verify `view` users can see panels but not edit, `manage` users can do everything
6. **Edge cases**: Bot missing `ManageRoles` permission, role higher than bot's role, panel with 0 buttons (should block posting), 25 buttons (max), deleted channel for a posted instance

**Decisions**

- **One model, not two**: A single `RoleButtonPanel` document holds both the template and its posts (as a `posts[]` subdocument), rather than splitting into separate Template and Post models. This simplifies "update all posts" and keeps the data together.
- **Per-button metadata**: Each persistent button stores `{ panelId, buttonId, roleId, mode }` in its `PersistentComponent` metadata, so the handler doesn't need to re-query the panel for simple operations (only for exclusivity checks).
- **Edit command uses ephemeral panel**: Following the ModmailConfigPanel pattern — a single ephemeral message with button-driven navigation between views. This keeps the edit flow contained in Discord without requiring the dashboard.
- **Repost strategy**: The `update` command rebuilds and edits existing messages in-place (via `message.edit()`), preserving the message link. If the message was deleted, it's removed from `posts[]`.
