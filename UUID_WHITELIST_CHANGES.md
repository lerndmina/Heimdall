# UUID-Based Minecraft Whitelisting System

## Overview

This update transforms the Minecraft whitelisting system to use UUID-based verification while maintaining username display for admins. UUIDs are more reliable since they remain constant even when players change their usernames.

## Key Changes Made

### 1. Plugin Changes (`minecraft-plugin/`)

#### WhitelistManager.java

- **Cache Key Strategy**: Now uses UUID as primary cache key, falls back to username if UUID is unavailable
- **Method Updates**: `clearCacheForPlayer()` now accepts both username and UUID parameters
- **Logging**: Enhanced debug logging to show both username and UUID

#### PlayerLoginListener.java

- **Whitelist Operations**: All whitelist management methods now work with UUIDs primarily
  - `isPlayerWhitelisted(username, uuid)`: Checks by UUID first, then username
  - `addToWhitelist(username, uuid)`: Adds by UUID when available, with proper fallback
  - `removeFromWhitelist(username, uuid)`: Removes by UUID primarily
- **Deprecation Fixes**: Added `@SuppressWarnings("deprecation")` for legacy username-based operations
- **UUID Priority**: All operations prioritize UUID over username for reliability

#### ApiClient.java

- **Request Updates**: Now includes UUID in whitelist check requests
- **Current Status Check**: `isCurrentlyWhitelisted()` checks by UUID first, then username
- **Removed Unused Import**: Cleaned up unused JavaPlugin import

### 2. Bot API Changes (`bot/src/api/routes/minecraft.ts`)

#### Connection Attempt Endpoint (`/api/minecraft/connection-attempt`)

- **UUID-First Lookup**: Player lookups prioritize UUID over username
- **Automatic Username Updates**: When UUID matches but username differs, automatically updates the stored username
- **Automatic UUID Updates**: When username matches but UUID is missing/different, updates the stored UUID
- **Enhanced Guild Detection**: Guild lookup logic now tries UUID-based queries first
- **Pending Auth Updates**: Pending authentication records are also updated when username changes are detected

#### Dual Lookup Strategy

```typescript
// 1. Try to find by UUID (most reliable)
if (uuid) {
  const player = await MinecraftPlayer.findOne({ guildId, minecraftUuid: uuid });
  // If found but username different, update username
}

// 2. Fallback to username lookup
if (!player) {
  const player = await MinecraftPlayer.findOne({ guildId, minecraftUsername: username });
  // If found but UUID missing/different, update UUID
}
```

#### Username Change Handling

When a player's UUID matches an existing record but the username is different:

1. **Automatic Update**: The stored username is automatically updated to the new one
2. **Logging**: Changes are logged for admin visibility
3. **Seamless Access**: Player maintains access without interruption
4. **Admin Notification**: Dashboard will show the updated username

## Benefits

### 1. **Reliability**

- UUIDs never change, even when players change usernames
- Eliminates issues with players losing access due to username changes
- Prevents duplicate entries for the same player

### 2. **User Experience**

- Players who change usernames automatically maintain whitelist status
- No need for re-linking accounts after username changes
- Seamless transition between old and new usernames

### 3. **Admin Experience**

- Usernames are automatically updated for easy identification
- Historical records are preserved with UUID consistency
- Dashboard displays current usernames while maintaining data integrity

### 4. **Security**

- UUID-based verification is more secure than username-based
- Prevents impersonation through username changes
- Maintains audit trail through UUID consistency

## Database Schema Impact

The existing `MinecraftPlayer` schema already supports UUIDs:

```typescript
{
  minecraftUuid?: string;     // Now primary identifier
  minecraftUsername: string; // Display name, automatically updated
  // ... other fields
}
```

No database migration is required - existing records will be enhanced with UUIDs as players connect.

## Plugin Configuration

No configuration changes are required. The plugin will automatically:

- Use UUIDs when available
- Fall back to username-based operations for legacy compatibility
- Cache based on UUID for better performance
- Update records seamlessly as players connect

## Testing Verification

To test the UUID-based system:

1. **Player Changes Username**:

   - Player changes Minecraft username
   - Attempts to join server
   - Should be automatically whitelisted (if previously whitelisted)
   - Username should be updated in dashboard

2. **Cache Verification**:

   - Plugin caches based on UUID
   - Multiple connections with same UUID should use cache
   - Cache should work across username changes

3. **Fallback Testing**:
   - Legacy players without UUIDs should still work
   - Username-based lookups should function as before
   - Gradual migration to UUID-based records

## Backward Compatibility

- ✅ Existing username-based records continue to work
- ✅ Legacy players without UUIDs are supported
- ✅ Gradual migration as players connect with UUIDs
- ✅ No breaking changes to admin workflows
- ✅ Dashboard continues to display usernames as before

## Performance Improvements

- **Faster Lookups**: UUID-based queries are more efficient
- **Better Caching**: Cache hits remain valid across username changes
- **Reduced API Calls**: Fewer database queries needed
- **Optimized Indexes**: Database indexes on UUID for better performance

## Future Enhancements

With UUID-based system in place, future enhancements become possible:

- Historical username tracking
- Player statistics across username changes
- Enhanced fraud detection
- Better integration with Minecraft APIs
