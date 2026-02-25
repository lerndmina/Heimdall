## Plan: Applications UX + Messaging Overhaul (DRAFT)

This plan upgrades the applications dashboard from a flat card list into a clickable, accordion-style review workspace with deep-linking to a specific submission, user-based drilldown, and in-dashboard approve/deny with optional reasons. It also fixes completion-message placeholder issues and introduces reusable “message mode” controls (text/embed/both) by extending the shared embed editor component instead of ad-hoc per-page fields. Your decisions are applied: deep-link via query params, right pane scoped to same-form history, per-type message mode, and accordion preference persisted as per-user server settings with a new settings button in the sidebar footer (left of logout).

**Steps**

1. Add per-user dashboard preferences backend
   - Create a new per-user settings model (for dashboard UI preferences) and CRUD endpoints in ApiManager.ts patterned after guild dashboard settings.
   - Keep preference key explicit for this feature (for example, `applicationsAccordionMultiOpen`) and enforce defaults on read.
   - Add route permission mappings for new endpoints in dashboardRoutePermissions.ts and dashboard-side resolver in routePermissions.ts.

2. Expose preference controls in dashboard shell/footer
   - Update sidebar footer in Sidebar.tsx to add a settings button left of logout.
   - Implement a lightweight user-preferences UI entry point from that button (popover/modal) and wire load/save through the existing dashboard proxy path [bot/plugins/dashboard/app/app/api/guilds/[guildId]/[...path]/route.ts](bot/plugins/dashboard/app/app/api/guilds/[guildId]/[...path]/route.ts).

3. Rework submissions list into clickable accordion + selected state
   - Refactor submissions section in [bot/plugins/dashboard/app/app/[guildId]/applications/ApplicationsPage.tsx](bot/plugins/dashboard/app/app/%5BguildId%5D/applications/ApplicationsPage.tsx):
     - Entire row clickable to select/expand.
     - Expansion behavior controlled by per-user preference (`single-open` vs `multi-open`).
     - Keep current permission/disabled logic for handled submissions.
   - Replace truncated preview-only rendering with expandable detail panel.

4. Add split expanded view (left answers, right prior history)
   - In expanded item, implement:
     - Left: scrollable full answer list for selected submission.
     - Right: same-user previous submissions scoped to same form, loaded via existing `userId + formId` list API (extend UI query-building to include user filter).
   - Make applicant identity clickable in row/header to filter list by that user and synchronize selected state.

5. Add direct deep-link behavior to a submission
   - Support query params on applications page (at minimum `applicationId`, optional `userId`/`formId`) in [bot/plugins/dashboard/app/app/[guildId]/applications/page.tsx](bot/plugins/dashboard/app/app/%5BguildId%5D/applications/page.tsx) and [bot/plugins/dashboard/app/app/[guildId]/applications/ApplicationsPage.tsx](bot/plugins/dashboard/app/app/%5BguildId%5D/applications/ApplicationsPage.tsx).
   - Auto-load and expand the target submission, scroll into view, and apply any filter params.
   - Update dashboard button URL generation in ApplicationReviewService.ts and ApplicationEmbeds.ts to include submission deep-link query params.

6. Replace prompt-based reason flow with dashboard-native modal
   - In [bot/plugins/dashboard/app/app/[guildId]/applications/ApplicationsPage.tsx](bot/plugins/dashboard/app/app/%5BguildId%5D/applications/ApplicationsPage.tsx), replace `window.prompt` reason collection with reusable modal-based inputs for approve/deny with reason.
   - Preserve existing API contract (`PUT /submissions/:applicationId/status`) and disabled states for already-reviewed items.

7. Extend shared embed editor into reusable message composer
   - Upgrade base component EmbedEditor.tsx to support reusable message composition options:
     - Send mode selector: text-only, embed-only, both.
     - Plaintext content input (2000 max).
     - Existing embed fields unchanged.
   - Use this upgraded base component in applications message config areas in [bot/plugins/dashboard/app/app/[guildId]/applications/ApplicationsPage.tsx](bot/plugins/dashboard/app/app/%5BguildId%5D/applications/ApplicationsPage.tsx) for completion/accept/deny templates (per-type mode).
   - Keep component API backward-compatible so existing consumers (welcome/moderation/etc.) continue functioning with defaults.

8. Fix message rendering bugs and align send semantics
   - Fix missing `{application_number}` in completion context in ApplicationFlowService.ts by including `applicationNumber`.
   - Update send logic in ApplicationFlowService.ts and ApplicationReviewService.ts to obey new per-type mode:
     - text-only => send content only
     - embed-only => send embed only
     - both => send both
   - Ensure placeholder substitution remains centralized in messagePlaceholders.ts.

**Verification**

- Build/typecheck: run `bun run build` from bot.
- Functional checks:
  - Submissions render as clickable accordion; expand/collapse matches saved user preference.
  - Clicking applicant filters list to that user; right pane shows same-form prior submissions.
  - Deep-link URL opens and focuses exact submission from “View in Dashboard.”
  - Approve/deny with reason works via modal and disables correctly after handling.
  - Completion/accept/deny messages respect selected mode (no unintended dual send).
  - `{application_number}` resolves in completion message output.
- Regression checks:
  - Existing pages using EmbedEditor.tsx still render/save correctly with defaults.

**Decisions**

- Deep-link format: query params.
- Right-side history scope: same form only.
- Message mode: configurable per message type (completion/accept/deny).
- Accordion behavior: user preference supports multi-open.
- Preference persistence: per-user server setting with footer settings entry (left of logout).
