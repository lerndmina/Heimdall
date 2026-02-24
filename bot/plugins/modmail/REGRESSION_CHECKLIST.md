# Modmail Open Flow Regression Checklist

This checklist validates open-flow parity after orchestration refactors.

## Preconditions

- Modmail is configured in at least one guild.
- At least one enabled category exists.
- Test user can receive DMs from the bot.
- Staff test account has permission to run `/modmail open`.

## 1) Staff Command: `/modmail open`

- Open ticket for another user with default mention toggles.
  - Expected: ticket opens.
  - Expected: no role mentions above thread starter embed.
- Open ticket with `mention_roles=true`.
  - Expected: both category and global role mentions appear above embed.
- Open ticket with `mention_category_roles=true`, `mention_global_roles=false`.
  - Expected: only category roles mentioned.
- Open ticket with `mention_category_roles=false`, `mention_global_roles=true`.
  - Expected: only global roles mentioned.
- Attempt open for banned user.
  - Expected: command fails with banned message.
- Attempt open for user with an OPEN thread.
  - Expected: command blocked.
- Attempt open for user with RESOLVED thread.
  - Expected: command blocked.
- Verify user DM content.
  - Expected: first message is "opened by staff" embed.
  - Expected: second message is staff-formatted opening reason.

## 2) Support Button Flow

- Click contact button in guild with single category and no form fields.
  - Expected: reason modal appears.
  - Expected: minimum length follows guild config.
- Click contact button in guild with form fields.
  - Expected: reason modal appears first.
  - Expected: question flow continues using shared question engine.
  - Expected: select fields and multi-step flow work.
- Guild with multiple categories.
  - Expected: category selector appears.
  - Expected: selected category enters correct flow (reason-only or reason+questions).
- Attempt create while user has OPEN thread.
  - Expected: blocked.
- Attempt create while user has RESOLVED thread.
  - Expected: blocked.

## 3) DM Flow

- Send DM in guild with one enabled category and no form fields.
  - Expected: ticket opens and DM confirmation appears.
- Send DM in guild with form fields.
  - Expected: shared question flow appears.
- Send short DM below configured minimum without `--force`.
  - Expected: short-message warning.
- Send short DM with `--force`.
  - Expected: force warning then flow continues.
- Verify eligibility behavior.
  - Expected: user with OPEN thread is excluded/blocked.
  - Expected: user with RESOLVED thread is excluded/blocked.

## 4) Shared Side Effects

- On successful create from all three entry points:
  - Expected: exactly one conversation-created dashboard/websocket event.
  - Expected: one modmail record with valid thread ID.
  - Expected: thread starter embeds/buttons are present.

## 5) Negative Cases

- No configured categories.
  - Expected: create blocked with no-category error.
- Selected category disabled (command path).
  - Expected: create blocked with category-disabled error.
- User has DMs disabled.
  - Expected: ticket still created, staff-side path succeeds, DM warning/fallback shown where applicable.

## 6) Smoke Build

Run:

- `bun run build`

Expected:

- TypeScript passes.
- Dashboard build passes.
