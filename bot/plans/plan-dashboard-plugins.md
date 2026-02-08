# Plan: Dashboard Pages for All Plugins

**Goal:** Add Next.js pages for all 8 remaining plugins + wire up the Overview page with live stats. Full CRUD for all options & granular permissions.

**Key facts:**

- All bot-side APIs, permission definitions, route-permission mappings, and sidebar entries already exist
- The only backend additions are in the **Suggestions plugin API** (create suggestions + full opener CRUD)
- Reminders auto-scope to the logged-in user via `session.user.id` (no user picker needed)
- Modmail conversations + Ticket details are read-only viewers (no reply/close from dashboard)
- Phased from simplest → most complex

---

## Phase 1 — Config-Only Pages

### 1. Welcome — `app/[guildId]/welcome/`

Files: `page.tsx`, `WelcomeConfigPage.tsx`

- `<PermissionGate category="welcome">`
- Fetch `GET welcome/config`; empty state with "Enable" button if none exists
- **Read view:** Card with channel (Combobox) and message template
- **Edit:** Inline form/Modal — Combobox for channel, Textarea for message (max 2000 chars). `PUT welcome/config`
- **Variable reference:** Fetch `GET welcome/variables`, show collapsible helper card
- **Test:** `POST welcome/test` button, gated behind `welcome.manage_config`
- **Delete:** `DELETE welcome/config` with confirmation modal
- `useUnsavedChanges()` for dirty-state save bar

### 2. Logging — `app/[guildId]/logging/`

Files: `page.tsx`, `LoggingConfigPage.tsx`

- `<PermissionGate category="logging">`
- Fetch `GET logging/config` + `GET logging/events`
- One Card per category (Messages, Users, Moderation): Toggle for enabled, Combobox for log channel, grid of Toggle per subcategory
- Save per-category via `PUT logging/config`. `useUnsavedChanges()` save bar
- **Test:** `POST logging/test` — results modal showing per-category success/fail
- **Delete all:** `DELETE logging/config` with confirmation

### 3. Temp VC — `app/[guildId]/tempvc/`

Files: `page.tsx`, `TempVCConfigTab.tsx`, `TempVCActiveTab.tsx`

- `<PermissionGate category="tempvc">`
- Two tabs via `<Tabs>`

**ConfigTab:**

- Fetch `GET tempvc/config`. List of creator channel Card items: trigger channel (Combobox), category (Combobox), name template (TextInput), sequential naming (Toggle)
- Add/edit/delete creator channels. Save via `PUT tempvc/config` (full array replace)

**ActiveTab:**

- Fetch `GET tempvc/active?includeDetails=true` + `GET tempvc/stats`
- Stats row + DataTable of active channels (name, owner, members, age)
- "Force Delete" per-row action → `DELETE tempvc/channels/:channelId`

---

## Phase 2 — Simple CRUD Pages

### 4. Tags — `app/[guildId]/tags/`

Files: `page.tsx`, `TagsPage.tsx`

- `<PermissionGate category="tags">`
- Fetch `GET tags` with pagination + debounced search
- DataTable: name, content (truncated), created by, uses, created date. Sortable
- **Create:** "New Tag" button → Modal (name max 32, content max 2000). `POST tags`. Gated behind `tags.manage_tags`
- **Edit:** Row action → Modal. `PUT tags/:name`
- **Delete:** Row action → confirmation. `DELETE tags/:name`

### 5. Reminders — `app/[guildId]/reminders/`

Files: `page.tsx`, `RemindersPage.tsx`

- `<PermissionGate category="reminders">`
- Auto-scope to logged-in user via `useSession()` → `session.user.id`
- Fetch `GET reminders?userId={session.user.id}` with pagination
- DataTable: message (truncated), trigger time, status (StatusBadge — pending/triggered), context type, created date
- **Create:** "New Reminder" → Modal with channel selector, message, date/time picker. `POST reminders` with `userId: session.user.id`
- **Edit:** Row action → Modal for message + trigger time. `PUT reminders/:id`. Disabled for triggered
- **Delete:** Row action → `DELETE reminders/:id`
- New shared component: **DateTimePicker** (calendar date + time; existing DayTimePicker is day-of-week only)

---

## Phase 3 — Complex Multi-Entity Pages

### 6. Suggestions — `app/[guildId]/suggestions/`

#### 6a. Bot API Additions

New endpoints in `bot/plugins/suggestions/api/`:

- **`POST /`** — Create suggestion from dashboard. New file `create.ts`:
  - Body: `{ userId, channelId, suggestion (20-1000), reason (20-500), categoryId? }`
  - New `SuggestionService.createFromDashboard()` method — extract embed building from existing Discord interaction handler into reusable helpers
  - Route permission: `suggestions.manage_suggestions`

- **`POST /openers`** — Create opener panel. Extend `openers.ts`:
  - Body: `{ channelId, title?, description?, createdBy }`
  - New `SuggestionService.deployOpenerFromApi()` — sends opener message to Discord
  - Route permission: `suggestions.manage_suggestions`

- **`PUT /openers/:openerId`** — Update opener. Extend `openers.ts`:
  - Body: `{ title?, description?, enabled? }`
  - Edit Discord message with updated embed/components
  - Route permission: `suggestions.manage_suggestions`

- **SuggestionService changes:** Refactor `createEmbedSuggestion`/`createForumSuggestion` to extract shared helpers usable without `ModalSubmitInteraction`

- **routePermissions.ts additions:**
  - `POST /suggestions` → `suggestions.manage_suggestions`
  - `POST /suggestions/openers` → `suggestions.manage_suggestions`
  - `PUT /suggestions/openers/*` → `suggestions.manage_suggestions`

#### 6b. Dashboard Page — 3 tabs

**SuggestionsListTab:**

- Paginated, filterable by status/channel, sortable by date/votes + stats cards
- **Create suggestion:** Modal → `POST suggestions` with `userId: session.user.id`
- **Approve/Deny:** Row action → `PATCH suggestions/:id/status` with `managedBy: session.user.id`
- **View:** Row action → full suggestion Modal

**ConfigTab:**

- NumberInput for maxChannels, voteCooldown, submissionCooldown; Toggle for enableCategories
- Save → `PUT suggestions/config`

**CategoriesTab:**

- DataTable/cards of categories. Full CRUD with Modal forms
- Openers section: list openers, full CRUD (create/edit/delete)

### 7. Modmail — `app/[guildId]/modmail/`

Files: `page.tsx`, `ModmailConversationsTab.tsx`, `ModmailConfigTab.tsx`

**ConversationsTab (read-only):**

- Gated behind `modmail.view_conversations`
- Paginated, filterable + stats cards
- DataTable: user, status, category, claimed by, message count, last activity
- "View" → large Modal with chat-bubble thread, form responses, metrics

**ConfigTab:**

- Gated behind `modmail.manage_config`
- General settings, categories section (card CRUD), snippets section
- All batched into `PUT modmail/config`

### 8. Tickets — `app/[guildId]/tickets/`

Files: `page.tsx`, `TicketsListTab.tsx`, `TicketsCategoriesTab.tsx`, `TicketsOpenersTab.tsx`, `TicketsArchiveTab.tsx`

**TicketsListTab (read-only):**

- Paginated, filterable + stats cards
- "View" → Modal with ticket details, question responses, transcript link

**CategoriesTab:**

- Hierarchical cards (parents with children). Full CRUD
- Per-category expandable questions sub-panel with CRUD

**OpenersTab:**

- Card list with embed preview. Full CRUD (embed builder, UI type, category assignment)

**ArchiveTab:**

- `GET tickets/archive-config` → config form → `PATCH tickets/archive-config`

---

## Phase 4 — Overview Page

### 9. Overview — rewrite `app/[guildId]/page.tsx`

- Convert to client component
- Parallel fetch: `tickets/stats`, `modmail/stats`, `suggestions/stats`, `minecraft/status`, `tempvc/stats`
- Independent error handling (show "—" on failure)
- Stats cards: Members, Minecraft players, Open tickets, Open modmail, Pending suggestions, Active temp VCs
- Recent Activity section: aggregate latest entries from tickets, modmail, suggestions

---

## Shared Components to Add

| Component           | Purpose                                         | Used By                                        |
| ------------------- | ----------------------------------------------- | ---------------------------------------------- |
| **DateTimePicker**  | Calendar date + time selector                   | Reminders                                      |
| **ChannelCombobox** | Reusable channel picker fetching guild channels | Welcome, Logging, TempVC, Tickets, Suggestions |
| **EmbedPreview**    | Discord-style embed preview                     | Ticket/Suggestion opener builders              |
| **Textarea**        | Multiline TextInput variant                     | Tags, Welcome, Suggestions, Modmail            |

---

## File Inventory

| Area                                    | New Files    | Modified Files                                                      |
| --------------------------------------- | ------------ | ------------------------------------------------------------------- |
| Shared components                       | ~4           | —                                                                   |
| Phase 1 (Welcome, Logging, TempVC)      | ~7           | —                                                                   |
| Phase 2 (Tags, Reminders)               | ~4           | —                                                                   |
| Phase 3 (Suggestions API)               | ~2 API files | SuggestionService.ts, openers.ts, api/index.ts, routePermissions.ts |
| Phase 3 (Suggestions, Modmail, Tickets) | ~14          | —                                                                   |
| Phase 4 (Overview)                      | —            | page.tsx                                                            |
| **Total**                               | **~31**      | **~5**                                                              |
