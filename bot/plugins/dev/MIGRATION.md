# Data Migration

Heimdall supports two migration modes:

1. **Legacy Import** — Import data from the old (pre-plugin) Heimdall bot into the new system
2. **Instance Clone** — Copy all data from one Heimdall instance to another (Heimdall → Heimdall)

---

## Instance Clone (Heimdall → Heimdall)

Clone all data from a source Heimdall instance's MongoDB database to the current instance. Both databases must use identical schemas.

### What Gets Cloned

All 35 data models across all plugins:

| Plugin                | Models                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| **Core**              | PersistentComponent, GuildEnv (encrypted)                                  |
| **AttachmentBlocker** | AttachmentBlockerConfig, AttachmentBlockerChannel, AttachmentBlockerOpener |
| **Dashboard**         | DashboardPermission                                                        |
| **Logging**           | LoggingConfig                                                              |
| **Minecraft**         | MinecraftConfig (encrypted), MinecraftPlayer, McServerStatus, RoleSyncLog  |
| **Minigames**         | HeimdallCoin                                                               |
| **Moderation**        | ModerationConfig, AutomodRule, Infraction, ChannelLock, StickyMessage      |
| **Modmail**           | ModmailConfig (encrypted), Modmail                                         |
| **Reminders**         | Reminder                                                                   |
| **RoleButtons**       | RoleButtonPanel                                                            |
| **Suggestions**       | SuggestionConfig, Suggestion, SuggestionOpener                             |
| **SupportCore**       | SupportBan, ScheduledAction                                                |
| **Tags**              | Tag                                                                        |
| **TempVC**            | TempVC, ActiveTempChannels                                                 |
| **Tickets**           | TicketCategory, TicketOpener, TicketArchiveConfig, Ticket                  |
| **VCTranscription**   | VoiceTranscriptionConfig                                                   |
| **Welcome**           | WelcomeMessage                                                             |

**Skipped:** TicTacToe, Connect4 (24h TTL ephemeral game state — auto-deleted)

### Encryption Key Requirement

Both instances **must** use the same `ENCRYPTION_KEY` environment variable. Encrypted fields are copied as raw ciphertext:

- `GuildEnv.encryptedValue`
- `MinecraftConfig.encryptedRconPassword`
- `ModmailConfig.categories[].encryptedWebhookToken`

If the keys differ, these fields will fail to decrypt on the target instance.

### Clone Methods

#### Dashboard UI (Recommended)

1. Navigate to `/dev/migration` in the dashboard
2. Select the **"Instance Clone"** tab
3. Enter the source MongoDB URI
4. Optionally specify a guild ID to filter
5. Click "Start Clone"
6. Watch real-time progress via WebSocket

#### API Call

```bash
curl -X POST https://your-dashboard.com/api/dev/clone \
  -H "Content-Type: application/json" \
  -d '{
    "sourceDbUri": "mongodb://source-host:27017/heimdall",
    "guildId": "optional_guild_id"
  }'
```

### Clone Behavior

- **Idempotent:** Existing documents (matched by `_id` or unique key) are skipped
- **Batch processing:** Documents are copied in batches of 500 for efficiency
- **Infraction.ruleId remapping:** AutomodRule references are automatically remapped when the target already has rules with different `_id` values
- **Guild filtering:** When a guild ID is provided, only guild-scoped documents are copied; global models (PersistentComponent, HeimdallCoin) are skipped
- **Progress:** Real-time per-step and per-record progress via WebSocket

---

## Legacy Import (Old Bot → Heimdall)

This guide explains how to import configurations and data from the old Heimdall bot to the new plugin-based system.

## What Gets Migrated

### ✅ Fully Supported

- **Temp Voice Channels**: Creator channel configurations, category IDs, sequential naming
- **Active Temp Channels**: Currently active temporary voice channels
- **Tags**: All guild-specific text tags (key → name, tag → content)
- **Suggestion Config**: Channel configuration (single channel → multi-channel array)
- **Suggestions**: All suggestions with votes, status, and metadata
- **Modmail Threads**: Closed conversations with complete message history, attachments, and metadata

### ⚠️ Requires Manual Setup

- **Modmail Config**: Webhooks need recreation, forum channels need proper tags, encrypted tokens cannot be transferred

### 📋 Special Considerations

- **Open Modmail Threads**: By default, only closed threads are imported. Use `import_open_threads: true` to import open threads (they'll remain open for seamless migration)
- **Category Mapping**: Old modmail category IDs won't match new system - threads import with original category IDs but may need reassignment

## Migration Methods

### Method 1: Discord Command (Recommended)

```
/migrate run old_db_uri: mongodb://... [guild_id: optional]
```

**Example:**

```
/migrate run old_db_uri: mongodb://localhost:27017/heimdall_old
```

**Guild-specific migration:**

```
/migrate run old_db_uri: mongodb://localhost:27017/heimdall_old guild_id: 1129418506690101429
```

**Import open modmail threads (keep them open):**

```
/migrate run old_db_uri: mongodb://... import_open_threads: true
```

**Skip modmail thread migration:**

```
/migrate run old_db_uri: mongodb://... skip_modmail: true
```

### Method 2: Dashboard UI

1. Navigate to `/dev/migration` in the dashboard
2. Enter your old database URI
3. Optionally specify a guild ID to migrate only one server
4. Click "Start Migration"
5. Review the results

### Method 3: API Call

**Basic migration:**

```bash
curl -X POST https://your-dashboard.com/api/dev/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "oldDbUri": "mongodb://localhost:27017/heimdall_old",
    "guildId": "optional_guild_id",
    "skipModmail": false,
    "importOpenThreads": false
  }'
```

**With category mapping (modmail):**

```bash
curl -X POST https://your-dashboard.com/api/dev/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "oldDbUri": "mongodb://localhost:27017/heimdall_old",
    "guildId": "1129418506690101429",
    "categoryMapping": {
      "old_category_id_1": "new_category_id_1",
      "old_category_id_2": "new_category_id_2"
    },
    "importOpenThreads": false
  }'
```

**Note:** Category mapping is only available via API, not Discord command.

## Migration Options

### `importOpenThreads` (boolean, default: false)

- **false**: Only import closed modmail threads (recommended)
- **true**: Import both open and closed threads; open threads remain open for seamless migration

### `skipModmail` (boolean, default: false)

- **false**: Attempt to migrate modmail threads
- **true**: Skip modmail thread migration entirely (only config warnings)

### `categoryMapping` (object, optional)

- Map old category IDs to new category IDs: `{ "old_cat_id": "new_cat_id" }`
- Useful if you've already set up new modmail categories and want to preserve assignments
- Without mapping, threads keep old category IDs (may need manual reassignment)

## Schema Mappings

### TempVC

```typescript
Old: GuildNewVC {
  guildID → guildId
  guildChannelIDs → channels[]
    channelID → channelId
    categoryID → categoryId
    useSequentialNames → useSequentialNames
    channelName → channelName
}
```

### Tags

```typescript
Old: TagSchema {
  key → name
  guildId → guildId
  tag → content
  (new: createdBy = "migration")
  (new: uses = 0)
}
```

### Suggestions Config

```typescript
Old: SuggestionConfig {
  guildId → guildId
  channelId → channels[0].channelId
  (new: mode = "embed")
  (new: enableAiTitles = false)
}
```

### Suggestions

```typescript
Old: Suggestion {
  id → id (preserved)
  guildId → guildId
  userId → userId
  title → title
  suggestion → suggestion
  reason → reason
  votes → votes (with added votedAt timestamps)
  status → status
  messageLink → messageLink
  managedBy → managedBy
  (new: channelId from config)
  (new: mode = "embed")
}
```

### Modmail Threads

```typescript
Old: Modmail {
  guildId → guildId
  forumThreadId → forumThreadId (must be unique)
  forumChannelId → forumChannelId
  userId → userId
  userDisplayName → userDisplayName
  userAvatar → userAvatarUrl
  categoryId → categoryId (or mapped via categoryMapping)
  categoryName → categoryName
  ticketNumber → ticketNumber
  priority → priority
  formResponses → formResponses
  createdVia → createdVia

  // Status mapping
  isClosed=true → status="closed"
  markedResolved=true → status="resolved"
  otherwise → status="open"

  // Activity tracking
  lastUserActivityAt → lastUserActivityAt
  lastStaffActivityAt → lastStaffActivityAt
  autoCloseScheduledAt → autoCloseScheduledAt
  autoCloseDisabled → autoCloseDisabled

  // Assignment
  claimedBy → claimedBy
  claimedAt → claimedAt

  // Closure
  closedBy → closedBy
  closedAt → closedAt
  closedReason → closeReason
  resolvedAt → markedResolvedAt

  // Messages transformation
  messages[] → messages[] (see below)
  (new: modmailId generated)
  (new: metrics calculated from messages)
}

Old Message → New Message:
{
  messageId → messageId
  type="user" → authorType="user"
  type="staff" → authorType="staff"
  content → content
  authorId → authorId
  webhookMessageId/discordMessageId → discordMessageId
  dmMessageId → discordDmMessageId
  createdAt → timestamp

  // Context detection
  hasDm + hasThread → context="both"
  hasDm only → context="dm"
  hasThread only → context="thread"

  // Editing
  isEdited → isEdited
  editedAt → editedAt
  editedContent → originalContent

  // Deletion
  isDeleted → isDeleted
  deletedAt → deletedAt
  deletedBy → deletedBy

  // Attachments
  attachments[] → attachments[] (filename, url, size, contentType)

  (new: deliveredToDm, deliveredToThread set to true)
  (new: isStaffOnly defaults to false)
}
```

## Pre-Migration Checklist

- [ ] **Backup both databases** before starting
- [ ] **Decide on modmail thread migration strategy:**
  - Close all old modmail threads and skip migration (cleanest)
  - Migrate only closed threads (default, safest)
  - Migrate all threads including open ones (use `importOpenThreads: true` for seamless migration)
- [ ] **Set up new modmail categories** if you want to use category mapping
- [ ] **Note old → new category ID mappings** for modmail if applicable
- [ ] **Export modmail transcripts** if needed for archival (old threads you won't migrate)
- [ ] **Note down webhook URLs** from old modmail categories (cannot be migrated)
- [ ] **Verify MongoDB connection** to old database works
- [ ] **Test with single guild** before full migration

## Post-Migration Steps

### 1. Temp Voice Channels

- **Verify creator channels** still exist in Discord
- **Test channel creation** by joining a creator channel

### 2. Tags

- **Test tag usage** with `/tag use <name>`
- No creator information migrated - all tags show `createdBy: "migration"`

### 3. Suggestions

- **Configure new channels** in dashboard if needed (old bot: 1 channel, new bot: up to 10)
- **Set up categories** if desired (new feature)
- **Enable AI titles** if needed (new feature)
- Old suggestions will appear in the migrated channel

### 4. Modmail (Manual Setup Required)

1. Create forum channels for each category you need
2. Run `/modmail setup` in Discord to create webhooks
3. Configure categories using dashboard or commands
4. Set up custom forms if you had them in the old bot
5. Configure auto-close timings
6. Add staff roles to categories

### 5. Modmail Threads (Post-Import)

- **Verify thread imports:** Check that forum threads still exist in Discord
- **Review category assignments:** If you didn't provide category mapping, threads may have invalid category IDs
- **Check message history:** Migrated threads show full conversation history from old bot
- **Discord message links:** Old message links (URLs) are preserved but may be dead if channels were deleted
- **Test new threads:** Create a new modmail thread to ensure new system works
- **Analytics:** Metrics are recalculated from imported messages, may differ slightly from old bot

## Migration Behavior

### Duplicates

- **Existing data is skipped** - if a record with the same ID/guildId already exists, it won't be overwritten
- Check the migration results for "skipped" counts

### Errors

- Individual record errors don't stop the entire migration
- Review error messages in the migration results
- Failed records can be manually imported or recreated

### Guild-Specific Migration

- Use `guild_id` parameter to migrate only one server
- Useful for testing before full migration
- Can run multiple times for different guilds

## Troubleshooting

### "Connection refused" or "Database not found"

- Verify the MongoDB URI is correct
- Ensure the old database is running and accessible
- Check firewall rules if connecting remotely

### "Unauthorized - not bot owner"

- Only the bot owner (set in Discord Developer Portal) can run migrations
- Verify you're using the correct Discord account

### High skip counts

- Data already exists in the new database
- This is normal if you've run the migration before
- Check if you need to clear the new database first

### "Skipped open thread" errors

- By default, only closed modmail threads are migrated
- Close threads in old bot first, or use `importOpenThreads: true` option to keep them open
- Open threads that are imported will remain open for seamless migration

### Modmail threads have wrong categories

- Old category IDs don't exist in new system
- Provide `categoryMapping` parameter to map old IDs to new IDs
- Or manually reassign categories in dashboard after migration

### Missing message content in threads

- Message content and attachments are preserved from old schema
- Discord message IDs are migrated but the actual Discord messages may no longer exist
- This is expected for very old threads or if channels were deleted

### Modmail config migration failed

- Expected behavior - modmail config requires manual setup
- This is due to webhook encryption and Discord forum channel requirements
- Follow the post-migration steps for modmail

## Security Considerations

- **Never share your database URI** - it contains credentials
- **Use environment variables** for production migrations
- **Webhook tokens** in modmail cannot be decrypted/transferred
- **Connection string** should use read-only credentials if possible

## Support

If you encounter issues:

1. Check the error messages in the migration results
2. Verify your database connection and schema
3. Review this documentation for common issues
4. Test with a single guild first before full migration
