# Minecraft Collection Merge Plan

## Overview

Merge `MinecraftAuthPending` collection into `MinecraftPlayer` collection to eliminate split-brain issues and simplify the data model. All player states (pending, linked, whitelisted) will be tracked in a single collection using inferred statuses from date fields.

## Key Simplifications

- **Remove `whitelistStatus`** - use `whitelistedAt` (null = not whitelisted, Date = whitelisted)
- **Remove explicit auth `status`** - infer from date field combinations
- **Single collection** for all player states

## New MinecraftPlayer Schema

```typescript
// Enhanced MinecraftPlayer model
{
  // Existing fields (keep all)
  guildId: string;
  minecraftUuid: string;
  minecraftUsername: string;
  discordId?: string;

  // Whitelist tracking (simplified)
  whitelistedAt?: Date; // null = not whitelisted, Date = whitelisted
  linkedAt?: Date;
  approvedBy?: string;

  // Auth code system (new - merged from MinecraftAuthPending)
  authCode?: string; // 6-digit code, null when not in auth flow
  expiresAt?: Date; // Code expiry time
  codeShownAt?: Date; // When plugin showed the code
  confirmedAt?: Date; // When user confirmed in Discord

  // Process tracking
  isExistingPlayerLink?: boolean; // True for existing players linking accounts
  rejectionReason?: string; // Reason for rejection

  // Metadata (existing)
  source: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  lastConnectionAttempt?: Date;
}
```

## Player State Logic (Inferred from Fields)

1. **Legacy Player**: `discordId: null`, `whitelistedAt: Date`, `source: "imported"`
2. **Pending Auth**: `authCode: exists`, `expiresAt: > now`, `confirmedAt: null`
3. **Code Confirmed**: `authCode: exists`, `confirmedAt: Date`, `linkedAt: null`
4. **Fully Linked**: `linkedAt: Date`, `whitelistedAt: Date`
5. **Linked but Unwhitelisted**: `linkedAt: Date`, `whitelistedAt: null`
6. **Expired/Rejected**: `authCode: exists`, `expiresAt: < now` OR `rejectionReason: exists`

## Helper Functions for MinecraftPlayer Model

```typescript
// Status inference getters
get isWhitelisted(): boolean {
  return !!this.whitelistedAt;
}

get isLinked(): boolean {
  return !!this.discordId;
}

get hasActiveAuth(): boolean {
  return !!this.authCode && !!this.expiresAt && this.expiresAt > new Date();
}

get authStatus(): 'none' | 'pending' | 'shown' | 'confirmed' | 'expired' {
  if (!this.authCode || !this.expiresAt) return 'none';
  if (this.confirmedAt) return 'confirmed';
  if (this.expiresAt < new Date()) return 'expired';
  if (this.codeShownAt) return 'shown';
  return 'pending';
}

get playerStatus(): 'unlinked' | 'linking' | 'linked' {
  if (this.isLinked) return 'linked';
  if (this.hasActiveAuth) return 'linking';
  return 'unlinked';
}

// Utility methods
canStartNewAuth(): boolean {
  return !this.hasActiveAuth;
}

isAuthExpired(): boolean {
  return !!this.expiresAt && this.expiresAt < new Date();
}

clearExpiredAuth(): void {
  if (this.isAuthExpired()) {
    this.authCode = null;
    this.expiresAt = null;
    this.codeShownAt = null;
  }
}

startAuthProcess(discordId?: string): void {
  this.authCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  this.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  this.codeShownAt = new Date();
  if (discordId) {
    this.discordId = discordId;
  }
}

confirmAuth(discordId: string, approvedBy?: string): void {
  if (!this.hasActiveAuth) {
    throw new Error('No active auth process to confirm');
  }

  this.confirmedAt = new Date();
  this.discordId = discordId;
  this.whitelistedAt = new Date();
  if (approvedBy) {
    this.approvedBy = approvedBy;
  }
}
```

## Migration Script

### Sample Data Analysis

**Legacy User** (imported, no Discord):

```json
{
  "minecraftUsername": "kitihey",
  "whitelistStatus": "whitelisted", // REMOVE
  "whitelistedAt": "2025-08-20T21:20:40.106Z", // KEEP
  "source": "imported"
  // discordId: undefined
}
```

**Linked User** (full Discord integration):

```json
{
  "minecraftUsername": "mccubon3",
  "discordId": "301413597110861854",
  "whitelistStatus": "whitelisted", // REMOVE
  "linkedAt": "2025-09-14T18:20:13.401Z", // KEEP
  "whitelistedAt": "2025-09-14T18:20:13.401Z" // KEEP
}
```

### Migration Logic

```typescript
// bot/src/migrations/merge-minecraft-collections.ts
export async function mergeMinecraftCollections() {
  const db = new Database();

  try {
    log.info("Starting Minecraft collections merge...");

    // Step 1: Get current data
    const players = await db.find("MinecraftPlayer", {});
    const pending = await db.find("MinecraftAuthPending", {});

    log.info(`Found ${players.length} players, ${pending.length} pending auth records`);

    // Step 2: Update existing players - remove whitelistStatus, add new fields
    for (const player of players) {
      await db.updateOne(
        "MinecraftPlayer",
        { _id: player._id },
        {
          $unset: { whitelistStatus: 1 }, // Remove redundant field
          $set: {
            // Initialize new auth fields as null
            authCode: null,
            expiresAt: null,
            codeShownAt: null,
            confirmedAt: null,
            updatedAt: new Date(),
          },
        }
      );
    }

    // Step 3: Migrate auth pending records
    for (const auth of pending) {
      if (auth.isExistingPlayerLink && auth.minecraftUuid) {
        // Update existing player with auth data
        await db.updateOne(
          "MinecraftPlayer",
          { minecraftUuid: auth.minecraftUuid, guildId: auth.guildId },
          {
            $set: {
              authCode: auth.authCode,
              expiresAt: auth.expiresAt,
              codeShownAt: auth.codeShownAt,
              confirmedAt: auth.confirmedAt,
              updatedAt: new Date(),
            },
          }
        );
      } else {
        // Create new player from auth record
        await db.create("MinecraftPlayer", {
          guildId: auth.guildId,
          minecraftUuid: auth.minecraftUuid,
          minecraftUsername: auth.minecraftUsername,
          discordId: auth.discordId,
          whitelistedAt: auth.confirmedAt, // Whitelisted when confirmed
          authCode: auth.authCode,
          expiresAt: auth.expiresAt,
          codeShownAt: auth.codeShownAt,
          confirmedAt: auth.confirmedAt,
          source: "discord_link",
          createdAt: auth.createdAt,
          updatedAt: new Date(),
        });
      }
    }

    // Step 4: Backup and cleanup (manual step)
    log.info("Migration complete. MinecraftAuthPending collection should be backed up and removed manually.");

    return {
      success: true,
      playersProcessed: players.length,
      authRecordsMigrated: pending.length,
    };
  } catch (error) {
    log.error("Migration failed:", error);
    throw error;
  }
}
```

## Implementation Steps

### 1. Schema Updates

- Update `MinecraftPlayer.ts` model with new fields
- Add helper methods to the schema
- Create migration script

### 2. Code Updates (26+ files affected)

- **API Routes**: `bot/src/api/routes/minecraft.ts` - Replace MinecraftAuthPending queries
- **Commands**: `link-minecraft.ts`, `confirm-code.ts` - Use unified model
- **Dashboard**: Update any components querying auth pending states

### 3. Migration Execution

- Run migration script in staging
- Test all functionality
- Run in production during low traffic
- Monitor for issues

### 4. Cleanup

- Remove `MinecraftAuthPending.ts` model file
- Drop collection from database
- Remove unused imports

## Query Patterns

### Dashboard Queries (using helper methods)

```typescript
// Pending approval (linked but not whitelisted)
{ guildId, linkedAt: { $ne: null }, whitelistedAt: null }

// Pending auth (active auth codes)
{ guildId, authCode: { $ne: null }, expiresAt: { $gt: new Date() }, confirmedAt: null }

// Code confirmed (waiting for staff approval)
{ guildId, confirmedAt: { $ne: null }, linkedAt: null }
```

## Benefits

- **Single source of truth** for all player states
- **Simplified queries** - no cross-collection operations
- **Inferred statuses** - no redundant status fields to maintain
- **Better performance** - single collection with proper indexes
- **Easier maintenance** - one model to understand and maintain

This unified approach eliminates the split-brain architecture and makes the system much easier to reason about.
