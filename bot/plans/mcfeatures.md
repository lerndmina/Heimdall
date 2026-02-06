# Minecraft Plugin — Remaining Issues

_Created: February 6, 2026_

---

## 🔴 Major Missing Features

| #   | Feature                                                                  | Status |
| --- | ------------------------------------------------------------------------ | ------ |
| 1   | `/mcstatus` server monitoring (command + model + polling + context menu) | ✅     |
| 2   | `/minecraft-setup messages` subcommand                                   | ✅     |
| 3   | `POST /:guildId/players/:playerId/reject` API route                      | ✅     |
| 4   | `POST /:guildId/players/:playerId/link` API route (manual Discord link)  | ✅     |

## ⚠️ Behavioral Gaps

| #   | Issue                                                                          | Status |
| --- | ------------------------------------------------------------------------------ | ------ |
| 5   | Expired auth codes not regenerated on next connection attempt                  | ✅     |
| 6   | Revoked players get generic message instead of specific rejection              | ✅     |
| 7   | `source: "existing"` enum value invalid — will cause Mongoose validation error | ✅     |

## 🟡 Minor Gaps

| #   | Issue                                                                   | Status               |
| --- | ----------------------------------------------------------------------- | -------------------- |
| 8   | Missing `authStatus` virtual on Player model                            | ✅                   |
| 9   | Missing `link()`/`unlink()`/`revoke()` instance methods on Player model | ✅                   |
| 10  | Missing compound index `{ authCode, expiresAt }` on Player model        | ✅ (already existed) |
| 11  | Missing expired-auth cleanup during `/link-minecraft`                   | ✅ (already existed) |
| 12  | Missing `unconfirmed`/`linked` status filters on players API            | ✅                   |
