# Database Migrations

This directory contains database migration scripts for the Heimdall bot.

## Running Migrations

### Fix MinecraftPlayer UUID Index

This migration fixes the duplicate key error when adding multiple players with null UUIDs:

```bash
# From the bot directory
cd /Users/wild/git/discord-bot-base/bot

# Make sure environment variables are set
export MONGODB_URI="your_mongodb_connection_string"

# Run the migration
bun run src/migrations/fix-minecraft-uuid-index.ts
```

### What this migration does:

1. **Drops the existing index**: Removes the problematic `guildId_1_minecraftUuid_1` index
2. **Creates a partial index**: Creates a new index that only enforces uniqueness when `minecraftUuid` is not null
3. **Allows multiple null UUIDs**: Players can now be manually added without UUIDs

### Before/After:

**Before**:

- Index: `{ guildId: 1, minecraftUuid: 1 }` with `{ unique: true, sparse: true }`
- Problem: Multiple null values still cause duplicate key errors

**After**:

- Index: `{ guildId: 1, minecraftUuid: 1 }` with `{ unique: true, partialFilterExpression: { minecraftUuid: { $ne: null } } }`
- Solution: Only enforces uniqueness when UUID is not null

## Safe to Run

This migration is safe to run multiple times and will:

- Check if the old index exists before trying to drop it
- Only create the new index if it doesn't already exist
- Log all actions for transparency
