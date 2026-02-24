## Plan: Applications Plugin for Heimdall

**TL;DR** — Build a new `applications` plugin that lets staff create configurable application forms via the dashboard, post customizable apply panels to channels, collect responses through a step-by-step ephemeral in-channel flow (with confirm/edit at each step), post completed applications to a configurable review channel (text or forum), and let staff approve/deny (with optional reasons), manage roles, open linked modmails, and fully manage everything from the dashboard. Depends on `lib`, `support-core` (for bans), and optionally `modmail`.

---

### Steps

**1. Scaffold the plugin structure**

Create the new plugin directory at bot/plugins/applications/ following the established pattern from existing plugins like rolebuttons/modmail/tickets:

```
applications/
├── index.ts              (onLoad, onDisable, exports)
├── manifest.json         (name, deps, apiRoutePrefix: "/applications")
├── api/
│   └── index.ts          (dashboard REST routes)
├── commands/
│   └── application.ts    (slash command for posting panels)
├── events/               (cleanup on guild leave if needed)
├── models/
│   ├── ApplicationForm.ts    (form template/config)
│   ├── Application.ts        (submitted application instance)
│   └── ApplicationSession.ts (in-progress form session, Redis-backed)
├── services/
│   ├── ApplicationService.ts       (core CRUD for forms + applications)
│   ├── ApplicationFlowService.ts   (orchestrates the step-by-step question flow)
│   └── ApplicationReviewService.ts (approve/deny/modmail/role handling)
└── utils/
    ├── ApplicationQuestionHandler.ts (step-by-step ephemeral flow engine)
    └── ApplicationEmbeds.ts          (embed builders for panels, reviews, confirmations)
```

Manifest declares dependencies: `["lib", "support-core"]` and optionalDependencies: `["modmail"]`.

---

**2. Define the `ApplicationForm` model** (models/ApplicationForm.ts)

The form template stored per guild, fully configurable from the dashboard. Schema inspired by RoleButtonPanel for embed config and TicketCategory for questions:

- `formId` — nanoid identifier
- `guildId` — guild snowflake
- `name` — human-readable form name
- `enabled` — boolean toggle (allows disabling without deletion)
- `embed` — reuse `RoleButtonEmbedSchema` shape: `{ title, description, color, image, thumbnail, footer, fields[] }` for the apply panel
- `questions[]` — ordered array of:
  - `questionId` (nanoid), `type` (enum: `SHORT`, `LONG`, `SELECT_SINGLE`, `SELECT_MULTI`, `BUTTON`, `NUMBER`), `label` (question text shown to user), `description?` (helper text), `required` (default true), `placeholder?`, `options[]?` (for select/button: `{ label, value, emoji?, description? }`), `minLength?`, `maxLength?`, `minValue?`, `maxValue?`
- `submissionChannelId` — where completed apps are posted
- `submissionChannelType` — `"text"` or `"forum"`
- `reviewRoleIds[]` — roles permitted to interact with approve/deny buttons
- `requiredRoleIds[]` — roles needed to apply
- `restrictedRoleIds[]` — roles blocked from applying
- `acceptRoleIds[]` — roles to add on approve
- `denyRoleIds[]` — roles to add on deny
- `acceptRemoveRoleIds[]` — roles to remove on approve
- `denyRemoveRoleIds[]` — roles to remove on deny
- `pingRoleIds[]` — roles pinged when new application is submitted
- `cooldownSeconds` — re-apply cooldown after denial (0 = no cooldown)
- `modmailCategoryId?` — modmail category to use when staff opens a modmail from an application
- `completionMessage?` — DM sent to applicant on submission
- `acceptMessage?` — DM sent on approve
- `denyMessage?` — DM sent on deny
- `panels[]` — posted panel instances: `{ panelId, channelId, messageId, postedAt, postedBy }`
- `createdBy`, `createdAt`, `updatedAt`

---

**3. Define the `Application` model** (models/Application.ts)

Each submitted application instance. Inspired by Modmail message tracking and Suggestion status flow:

- `applicationId` — nanoid
- `applicationNumber` — auto-incrementing per guild (like modmail's `ticketNumber`)
- `formId` — reference to ApplicationForm
- `formName` — denormalized for display
- `guildId`
- `userId`, `userDisplayName`, `userAvatarUrl` — cached user info
- `status` — enum: `PENDING`, `APPROVED`, `DENIED`
- `responses[]` — array of `{ questionId, questionLabel, questionType, value: string | string[] }`
- `submissionMessageId` — the review message in the staff channel
- `submissionChannelId`
- `forumThreadId?` — if using forum mode
- `reviewedBy?`, `reviewedAt?`, `reviewReason?`
- `linkedModmailId?` — linked modmail if opened from this app
- `createdAt`, `updatedAt`

---

**4. Build the ephemeral in-channel question flow** (utils/ApplicationQuestionHandler.ts)

Follow the exact same pattern as ModmailQuestionHandler and TicketQuestionHandler, but adapted for ephemeral in-channel:

**Session management**: Use Redis-backed ephemeral sessions (key: `app_session:{guildId}:{userId}:{formId}`, TTL 30 min). Tracks current step index and collected responses. Prevents duplicate in-progress applications.

**Flow per question type:**

| Type                        | Presentation                                                         | Answer Collection                                                                                                |
| --------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `SHORT` / `LONG` / `NUMBER` | Ephemeral embed showing question + "📝 Answer" button                | Button click → `showModal()` with appropriate TextInputStyle (Short/Paragraph). Modal submit → confirmation step |
| `SELECT_SINGLE`             | Ephemeral embed + string select menu (max 25 options)                | Select fires → confirmation step                                                                                 |
| `SELECT_MULTI`              | Ephemeral embed + string select menu with `setMaxValues()`           | Select fires → confirmation step                                                                                 |
| `BUTTON`                    | Ephemeral embed + button row (one per option, max 5 per row, max 25) | Button click → confirmation step                                                                                 |

**Confirmation step** (after each answer): Update the ephemeral message to show the question, the user's answer formatted nicely, and two buttons: "✅ Confirm" and "✏️ Edit". Confirm advances to next question. Edit re-shows the current question.

**Batching text questions** (optimization): Consecutive SHORT/LONG/NUMBER questions can be batched into a single modal (up to 5 fields per Discord modal limit), following the ModmailQuestionHandler.ts. Show all answers together in the confirmation step.

**Final review**: After all questions answered, show a full review embed with all Q&A pairs, plus:

- "✅ Submit Application" button
- "✏️ Edit Answer" button → shows a select menu to pick which question to re-answer
- "❌ Cancel" button → deletes session, confirms cancellation

**Callback pattern**: Use `ComponentCallbackService` ephemeral callbacks (like modmail) with 15-minute TTL. Each step registers the next callback. One persistent handler (`"applications.apply"`) for the initial panel button click.

---

**5. Build the review/submission system** (services/ApplicationReviewService.ts)

On submission, create the Application record and post to the configured channel:

**Text channel mode**: Send a rich embed containing:

- Author: applicant's avatar + name
- Title: "Application #{number} — {formName}"
- Fields: each Q&A pair as an embed field
- Footer: application ID + timestamp
- Below: persistent action button row

**Forum channel mode**: Create a forum thread titled "Application #{number} — {username}" with:

- Opening post: same Q&A embed
- Action buttons on the opening post
- Tags for status (Pending/Approved/Denied) if forum supports them

**Action buttons (persistent handlers)**:

- `applications.review.approve` — ✅ Approve (immediate, no reason)
- `applications.review.deny` — ❌ Deny (immediate, no reason)
- `applications.review.approve_reason` — ✅ Approve with Reason (opens modal)
- `applications.review.deny_reason` — ❌ Deny with Reason (opens modal)
- `applications.review.modmail` — 📬 Open Modmail (creates linked modmail)
- Button link → Dashboard URL to view the application

**Permission check**: Review actions check if the interacting user has one of the configured `reviewRoleIds`, following the pattern in SuggestionService persistent handler permission checking.

**On approve/deny**:

- Update Application status, `reviewedBy`, `reviewedAt`, `reviewReason`
- Edit the review message/embed to show new status (color change: green/red, status field)
- Disable buttons (or replace with status indicator)
- Apply role changes via the guild member (add `acceptRoleIds`, remove `acceptRemoveRoleIds`, etc.)
- DM the applicant with the configured message (if set)
- Broadcast to dashboard via `broadcastDashboardChange()`
- If forum mode: update thread tags, optionally archive

---

**6. Build the modmail integration** (services/ApplicationReviewService.ts)

When staff clicks "📬 Open Modmail" on a review message:

1. Check if `modmail` plugin is loaded via `context.dependencies.get("modmail")` or `client.plugins.get("modmail")`
2. Get the modmail creation service from the modmail plugin API
3. Call `creationService.createModmail()` with:
   - `guildId`, `userId` (the applicant)
   - `initialMessage`: "This modmail was opened regarding Application #{number} ({formName})"
   - `categoryId`: the form's configured `modmailCategoryId`
   - `formResponses`: the application's Q&A pairs converted to `FormResponse[]` format so they appear in the modmail thread
   - `createdVia: "api"`
4. Store the returned `modmailId` on the `Application.linkedModmailId` field
5. Update the review message to show the modmail link
6. Reply ephemerally to staff: "Modmail opened — {thread link}"

This avoids modifying the modmail plugin's schema at all. The application reference is visible in the modmail thread via the initial message and form responses.

---

**7. Build the panel posting system** (services/ApplicationService.ts)

Reuse the exact same pattern as RoleButtonService:

- `buildPanelMessage(form)` — constructs the customizable embed from the form's `embed` config + a persistent "Apply" button via `lib.createButtonBuilderPersistent("applications.apply", { formId })`
- `postPanel(form, channelId, userId)` — sends message, records in `form.panels[]`
- `updatePostedPanels(form)` — edits all posted panel messages with current embed config
- `deletePanel(form, panelIndex)` — deletes the Discord message and removes from `panels[]`

---

**8. Build the dashboard API** (api/index.ts)

Following the pattern in rolebuttons/api and modmail/api:

**Form management routes** (`/api/guilds/:guildId/applications/forms/`):

- `GET /` — list all forms
- `POST /` — create form (body: `{ name }`)
- `GET /:formId` — get form details
- `PUT /:formId` — update form (embed, questions, roles, channels, messages)
- `DELETE /:formId` — delete form + optionally delete all posted panels
- `POST /:formId/post` — post panel to channel (body: `{ channelId }`)
- `PUT /:formId/update-posts` — sync all posted panels
- `DELETE /:formId/posts/:postIndex` — delete a posted panel

**Application management routes** (`/api/guilds/:guildId/applications/submissions/`):

- `GET /` — list submissions (with filters: formId, status, userId, pagination)
- `GET /:applicationId` — get full application detail
- `PUT /:applicationId/status` — approve/deny from dashboard (body: `{ status, reason?, reviewedBy }`)
- `DELETE /:applicationId` — delete application
- `GET /stats` — aggregate stats (total, pending, approved, denied per form)

**Permission actions** registered via `PermissionRegistry`:

- `applications.manage` — create/edit/delete forms, post panels
- `applications.review` — approve/deny applications
- `applications.view` — view applications (read-only dashboard access)

---

**9. Build the dashboard pages** ([dashboard/app/app/[guildId]/applications/](bot/plugins/dashboard/app/app/%5BguildId%5D/applications/))

Following the structure of rolebuttons dashboard page:

**Forms page** (`/[guildId]/applications`):

- Left panel: list of application forms + "Create New" button
- Right panel: selected form editor with tabs:
  - **General**: name, enable/disable, submission channel (with type selector), cooldown
  - **Embed**: full embed editor (reuse the `EmbedEditor` component from rolebuttons — title, description, color, image, thumbnail, footer, fields)
  - **Questions**: drag-and-drop reorderable question list. Each question card has type selector, label, description, options (for select/button types), validation settings. "Add Question" button with type picker.
  - **Roles**: configure required, restricted, accept, deny, accept-remove, deny-remove, review, ping roles (using `RoleCombobox` components)
  - **Messages**: completion/accept/deny message editors
  - **Modmail**: modmail category selector (only shown if modmail plugin is loaded)
  - **Live Preview**: rendered embed preview + apply button preview (matching rolebuttons pattern)
  - **Actions**: Save, Post Panel, Update Posted, Delete

**Submissions page** (`/[guildId]/applications/submissions`):

- `DataTable` of submitted applications with columns: #, applicant, form name, status, date, actions
- Filters: by form, by status, by date range
- Click row → expandable detail view showing all Q&A responses
- Approve/Deny buttons with optional reason modal
- Link to modmail (if linked)
- Realtime updates via `useRealtimeEvent("applications:updated", ...)`

**Navigation**: Add "Applications" entry to GuildLayoutShell sidebar, gated behind the `applications` feature flag from the dashboard plugin's feature discovery.

---

**10. Build the slash command** (commands/application.ts)

A simple `/application` command for posting panels from Discord (alternative to dashboard):

- `/application post <form_name> [channel]` — posts the apply panel to the specified (or current) channel
- `/application list` — lists forms and their status

Most management should happen via the dashboard, so keep the slash command lightweight.

---

**11. Wire up `onLoad` and plugin API** (index.ts)

Following the pattern in modmail/index.ts:

- Instantiate services: `ApplicationService`, `ApplicationFlowService`, `ApplicationReviewService`
- Register persistent handlers via `componentCallbackService`:
  - `"applications.apply"` → entry point for the question flow
  - `"applications.review.approve"` / `"applications.review.deny"` / etc.
- Register permission actions
- Export `ApplicationsPluginAPI` with references to services (for modmail or other plugins to access if needed)
- Wire `modmail` as an optional dependency — if present, enable the "Open Modmail" button

---

### Verification

1. **Unit test the models**: Validate ApplicationForm and Application schemas save/retrieve correctly with all field types
2. **Test the question flow**: Create a test form with one of each question type. Click Apply, answer each, verify confirm/edit works, verify final review, submit
3. **Test submission posting**: Verify text channel mode (embed + buttons) and forum channel mode (thread + embed + buttons) both work
4. **Test review actions**: Approve/deny with and without reasons. Verify role changes, DM messages, embed updates, button disabling
5. **Test modmail integration**: Click "Open Modmail" on a review. Verify modmail thread is created with application context, and `linkedModmailId` is stored
6. **Test re-apply cooldown**: Deny an application, verify user cannot re-apply before cooldown expires
7. **Test role restrictions**: Verify `requiredRoleIds` and `restrictedRoleIds` block/allow correctly
8. **Dashboard**: Create/edit/delete forms, configure all settings, post panels, review submissions, approve/deny from dashboard
9. **Build**: Run `npm run build` in bot to verify TypeScript compilation

### Decisions

- **Ephemeral in-channel** over DMs: keeps users in context, avoids DM-closed issues
- **Configurable text/forum channel** for submissions: flexibility for servers with different workflows
- **Modmail integration without modifying modmail plugin**: pass application context via `initialMessage` + `formResponses`, store the link only on the Application model
- **Reuse `RoleButtonEmbedSchema`** for panel embed customization: maintains consistency, reduces code duplication
- **Batch consecutive text questions into one modal** (up to 5): reduces clicks for forms with many short text questions
- **Redis-backed ephemeral sessions** for in-progress applications (not MongoDB): fast, auto-expire, appropriate for transient flow state
- **Persistent handlers for all review buttons**: survive bot restarts, critical for staff actions on applications that may sit for hours/days
