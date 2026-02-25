## Plan: Full Dashboard UI Consistency Pass

**15 issues across 25+ files.** Core decisions: canonical save button is `bg-emerald-600`, all `bg-indigo-*` non-save primaries become `bg-primary-*`, `confirm()` dialogs become styled Modals, `DataTable`/`RowActionMenu` are deleted. Work is grouped by type to batch-edit efficiently.

---

### Decisions

- **Save/confirm color**: `bg-emerald-600 hover:bg-emerald-500` everywhere (SetupWizard already uses this — ripples to all other save buttons that currently use `bg-primary-600`)
- **Other primary actions** (Add, Post, Create, etc.): `bg-primary-600 hover:bg-primary-500` — not emerald
- **Destructive**: `bg-red-600 hover:bg-red-500` (already standard in most places)
- **Delete confirm**: styled `<Modal>` in every case
- **Scope**: all 15 issues

---

**Steps**

1. **[Issue 1] Replace `indigo-*` tokens with `primary-*`** in ModerationPage.tsx, planetside/ConfigTab.tsx, planetside/StatusTab.tsx, planetside/PlayersTab.tsx:
   - `bg-indigo-600 hover:bg-indigo-500` → `bg-primary-600 hover:bg-primary-500` (for non-save actions like "Test Connections", "Post Panel")
   - `focus:border-indigo-500 focus:ring-indigo-500` → `focus:border-primary-500 focus:ring-primary-500`

2. **[Issue 2] Standardize save button to `bg-emerald-600`** — update every page that uses `bg-primary-600` for its save/confirm button: RoleButtonsPage.tsx, ModmailCategoriesTab.tsx, TicketCategoriesTab.tsx, ApplicationsPage.tsx sticky save, plus anywhere else `bg-primary-600` is a final save action. `SetupWizard.tsx` already uses `bg-emerald-600` so it needs no change.

3. **[Issue 3] Normalize border radius to `rounded-lg`** — replace `rounded-md` on all buttons in: ApplicationsPage.tsx, SettingsPage.tsx, planetside/ConfigTab.tsx, planetside/PlayersTab.tsx, ModerationPage.tsx.

4. **[Issue 4] Replace inline border-trick spinners with `<Spinner>`** in ModmailCategoriesTab.tsx and CategoryAssignmentWizard.tsx.

5. **[Issue 5] Replace raw `<input>` / `<select>` with shared components** (`TextInput`, `NumberInput`, `Combobox`):
   - planetside/PlayersTab.tsx — 5+ raw inputs with indigo focus rings
   - suggestions/SuggestionsListTab.tsx — search input + sort select
   - moderation/StickyMessagesTab.tsx — raw `<select>`
   - moderation/ModerationPage.tsx — raw pattern `<input>`

6. **[Issue 6] Replace `confirm()` / `window.confirm()` with styled `<Modal>`** in:
   - ApplicationsPage.tsx — "Delete this application form?" and "Delete this submission?"
   - ModmailCategoriesTab.tsx — "Are you sure you want to delete this category?"
     Each gets a local `confirmDelete` state (`{open: boolean, id: string | null}`) and a confirmation `<Modal>` with a red confirm button.

7. **[Issue 7] Standardize page headers** — define the canonical pattern: no standalone `<h1>` at page level; each card's `<CardTitle>` + `<CardDescription>` serves as the section header. Remove the freestanding `<h1>` + `<p>` block from ModerationPage.tsx. The Overview page's stat-card layout is distinct enough to keep its header.

8. **[Issue 8] Standardize cancel/ghost button border** — replace `border-zinc-700` + `hover:bg-zinc-800` with `border-zinc-700/30` + `hover:bg-white/5` in SuggestionsCategoriesTab.tsx and SettingsPage.tsx ("Sync Permissions").

9. **[Issue 9] Standardize error-retry buttons** — replace solid `bg-zinc-800 hover:bg-zinc-700` with glassmorphic `bg-white/5 hover:bg-white/10 backdrop-blur-sm` in RemindersPage.tsx.

10. **[Issue 10] Replace emoji status indicators with `<StatusBadge>`** in ModerationPage.tsx OverviewTab — `✅ Enabled` / `❌ Disabled` → `<StatusBadge variant="success">Enabled</StatusBadge>` / `<StatusBadge variant="error">Disabled</StatusBadge>`.

11. **[Issue 11] Use `<CardHeader>` consistently** — replace inline `<div className="flex items-center justify-between">` with the `<CardHeader>` component across all pages that reconstruct it manually.

12. **[Issue 12] Normalize empty states** — adopt a single standard: an SVG icon circle + `<CardTitle>` + `<CardDescription>` + optional CTA button. Align the minimal/missing patterns in ModmailConversationsTab.tsx and RoleButtonsPage.tsx.

13. **[Issue 13] Delete dead components** — remove components/ui/DataTable.tsx and components/ui/RowActionMenu.tsx. Verify nothing imports them first.

14. **[Issue 14] Add loading spinner to RoleButtonsPage save button** — match the inline SVG spinner pattern used everywhere else; also add `transition` class.

15. **[Issue 15] Fix ModmailCategoriesTab API client** — replace `fetchDashboardApi` import with `fetchApi` and align the endpoint path to match the bot backend directly, consistent with `ModmailConfigTab.tsx`.

---

**Verification**

After each group of edits: `bun run build` inside bot — TypeScript + Next.js build must pass. No runtime testing environment is available, so TypeScript must be clean.

**Ordering**: Steps 1–3 first (color/radius — purely cosmetic, low risk, high blast radius), then 4–6 (component substitutions), then 7–12 (structural/layout), then 13–15 (cleanup + isolated fixes).
