## Updated Plan: Planetside Plugin — Dual API Strategy (Census + Honu)

### What Changes

The original plan used Census as the primary API and Honu only for realtime last-login checks. With the full Honu API available, we should use **Honu as the primary data source** for most operations and **Census as a fallback/supplement** for subset of data Honu doesn't cover (certs, raw character fields). This also gives us access to richer features the old bot never had.

### Key Honu Endpoints to Integrate

| Feature | Honu Endpoint | Replaces |
|---------|--------------|----------|
| Character lookup by name | `GET /api/characters/name/{name}` | Census `character/?name.first_lower=` |
| Character by ID | `GET /api/character/{charID}` | Census character_id lookup |
| **Online status** (verification) | `GET /api/character/{charID}/online` | Census `times.last_login` + 60min window |
| Character stats | `GET /api/character/{charID}/stats` | Census stat queries |
| Extra/fun stats | `GET /api/character/{charID}/extra` | *New — not in old bot* |
| Session history | `GET /api/character/{charID}/sessions` | *New* |
| Outfit by ID | `GET /api/outfit/{outfitID}` | Census outfit query |
| Outfit by tag | `GET /api/outfit/tag/{outfitTag}` | *New — simpler outfit config* |
| Outfit members | `GET /api/outfit/{outfitID}/members` | Census outfit tree join |
| **Outfit online members** | `GET /api/outfit/{outfitID}/online` | *New* |
| Outfit activity | `GET /api/outfit/{outfitID}/activity` | *New* |
| **World population** | `GET /api/population/{worldID}` or `/multiple` | Fisu `ps2.fisu.pw/api/population` |
| Zone population | `GET /api/population/{worldID}/zones` | *New* |
| Historical population | `GET /api/population/historical` | *New* |
| Outfit online count | `GET /api/population/{worldID}/outfits` | *New* |
| Character search | `GET /api/characters/search/{name}` | *New — autocomplete* |
| API health | `GET /api/health` | Manual Census probe |

### Updated Steps (deltas from the original plan)

**Step 6 — `CensusApiService` → `PlanetSideApiService`** — Rename and restructure to wrap both APIs:

- **Honu client** (primary):
  - `searchCharacter(name)` → `GET /api/characters/search/{name}` — used for autocomplete in `/ps2-link` and `/ps2-lookup`
  - `getCharacterByName(name)` → `GET /api/characters/name/{name}`
  - `getCharacterById(id)` → `GET /api/character/{charID}`
  - `getCharacterOnlineStatus(id)` → `GET /api/character/{charID}/online` — **replaces the "logged in within 60 minutes" check** with a direct "is this character online right now?" check, which is a much stronger verification signal
  - `getCharacterStats(id)` → `GET /api/character/{charID}/stats`
  - `getCharacterExtra(id)` → `GET /api/character/{charID}/extra` — fun/extra stats for richer `/ps2-info` embeds
  - `getCharacterSessions(id)` → `GET /api/character/{charID}/sessions` 
  - `getOutfit(outfitId)` → `GET /api/outfit/{outfitID}`
  - `getOutfitByTag(tag)` → `GET /api/outfit/tag/{outfitTag}` — allows config by tag (e.g., "KOTV") instead of requiring the numeric ID
  - `getOutfitMembers(outfitId)` → `GET /api/outfit/{outfitID}/members`
  - `getOutfitOnline(outfitId)` → `GET /api/outfit/{outfitID}/online` — for dashboard and `/ps2-promote`
  - `getOutfitActivity(outfitId)` → `GET /api/outfit/{outfitID}/activity` — for dashboard stats
  - `getWorldPopulation(worldId)` → `GET /api/population/{worldID}`
  - `getMultipleWorldPopulation(worldIds)` → `GET /api/population/multiple`
  - `getZonePopulation(worldId)` → `GET /api/population/{worldID}/zones`
  - `getHistoricalPopulation(params)` → `GET /api/population/historical`
  - `getHealth()` → `GET /api/health` — used by census monitor to check Honu health too
  
- **Census client** (supplementary — for data Honu may not expose):
  - `fetchCharacterCerts(serviceId, charId)` — cert balance/earned/gifted/spent
  - `testConnection(serviceId)` — probe for Census API uptime independent of Honu
  - Fallback character lookup if Honu is down

**Step 3 — `PlanetSideConfig` model updates:**
- Add `outfitTag` — allow configuring by outfit tag (e.g., "KOTV") in addition to `outfitId`. The service resolves tag → ID via Honu on first use and caches. This is much more user-friendly for dashboard config.
- Change `verificationMethod` options to: `"online_now"` (default, uses Honu `/online` endpoint — character must be online at verification time), `"recent_login"` (fallback, checks last login within window), `"manual"` (admin approval)
- Add `honuBaseUrl` — defaults to `https://wt.honu.pw` but configurable per-guild if someone self-hosts Honu
- Add `populationSource` — `"honu"` (default) or `"fisu"` (fallback)

**Step 7 — `CensusMonitorService` updates:**
- Monitor **both** Census and Honu health independently
- Honu health: poll `GET /api/health` — Honu returns structured health metrics, parse and track
- Census health: existing character-probe approach
- Status embed shows **two** indicators: Census API status + Honu API status, each with their own threshold tracking
- Linking flow checks the relevant API based on `verificationMethod` — if using `"online_now"`, Honu must be up; if using `"recent_login"`, Census must be up

**Step 10 — `/ps2-link` command updates:**
- Default verification: check `GET /api/character/{charID}/online` — if the character is online right now, verification passes. This is stronger than "logged in within 60 minutes" since a third party can't accidentally verify by having played recently.
- Fallback if Honu is down: use Census `times.last_login` with the configurable window
- Autocomplete on character name using `GET /api/characters/search/{name}` — user types a name, gets suggestions from Honu

**Step 11 — `/ps2-info` command updates:**
- Significantly richer embed using Honu data:
  - Core stats from `GET /api/character/{charID}/stats`
  - Extra/fun stats from `GET /api/character/{charID}/extra`
  - Online status from `GET /api/character/{charID}/online`
  - Recent sessions from `GET /api/character/{charID}/sessions` (show last 3)
  - Outfit info from `GET /api/outfit/{outfitID}`
  - Cert data still from Census (if available)

**Step 13 — `/ps2-population` command updates:**
- Primary source: Honu `GET /api/population/multiple` for all worlds at once (single request instead of one per world)
- Add optional `zone` flag: when set, also show per-zone breakdown via `GET /api/population/{worldID}/zones`
- Fallback: Fisu API if Honu is down
- New: show outfit online count via `GET /api/population/{worldID}/outfits` when a specific world is queried

**Step 15 — `/ps2-promote` command updates:**
- Cross-reference Discord members with promotion role against `GET /api/outfit/{outfitID}/online` — show which promotion-pending members are currently online (so officers know who to promote *now*)

**New Step: `/ps2-outfit` command:**
- Show outfit overview: name, tag, member count, online count, activity stats
- Uses `GET /api/outfit/{outfitID}`, `/online`, `/activity`
- Permission: `planetside.commands.ps2-outfit`, `defaultAllow: true`

**Dashboard updates (Steps 22-26):**
- **Population tab** becomes much richer:
  - Real-time world populations from Honu (auto-refresh)
  - Historical population charts using `GET /api/population/historical`
  - Per-zone breakdowns
  - Outfit online count
- **Census Status tab** shows dual health: Honu status + Census status
- **Config page**: outfit lookup supports tag-based search via Honu (type tag, see outfit info preview before saving)
- **Players tab**: show online indicator per player using Honu data

### Updated `PlanetSideApiService` Architecture

```
PlanetSideApiService
├── HonuClient          (primary — wt.honu.pw)
│   ├── Base URL configurable per-guild (default: https://wt.honu.pw)
│   ├── No auth required (public API)
│   ├── Rate-limit aware (respect 429s)
│   └── Caching layer (TTL-based, e.g., population = 60s, character = 5min)
├── CensusClient        (supplementary — census.daybreakgames.com)
│   ├── Service ID per-guild or from env
│   ├── Used for: cert stats, fallback lookups
│   └── Caching layer
└── Fallback logic
    ├── If Honu down → fall back to Census for character/outfit data
    ├── If Census down → Honu only (skip cert data)
    └── If both down → block linking, show both as offline
```

### Updated Verification

- Run bot, test `/ps2-link` with a character that is **currently online** in PS2 — verify Honu `/online` endpoint confirms them and linking succeeds
- Test `/ps2-link` with an offline character — verify it's rejected (or falls back to recent-login window if configured)
- Test `/ps2-info` — verify the richer embed with stats, extra stats, sessions, and online indicator
- Test `/ps2-population` — verify Honu population data renders for all worlds, test zone breakdown
- Test census monitor — verify dual-status embed (Honu + Census health indicators)
- Test Honu-down fallback — block Honu access, verify Census fallback kicks in
- Dashboard population tab — verify historical charts and real-time refresh

### Updated Decisions

- **Honu as primary, Census as supplementary**: Honu provides richer, more structured data and has endpoints Census lacks (online status, population, outfit activity). Census is kept for cert data and as a fallback.
- **"Online now" as default verification**: Stronger than "logged in within 60 minutes". If Honu is unavailable, falls back to Census recent-login check.
- **Outfit tag-based config**: Users can type `KOTV` instead of `37512545478660293` — resolved via Honu's outfit tag endpoint. Much better UX for dashboard config.
- **Fisu kept as secondary fallback**: If both Honu and Census population endpoints fail, Fisu is a last resort. But Honu's population API should be preferred (single request for multiple worlds, zone breakdowns, historical data).