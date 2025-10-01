# User Commands

This directory contains **user-installable commands** that can be installed on a Discord user's profile and used across any server or in DMs.

## Overview

User commands are a Discord feature that allows users to install bot commands on their profile, making them accessible anywhere the user is - not just in specific servers. This is perfect for utility commands, personal tools, and commands that don't need server-specific context.

## Key Concepts

### Integration Types

- **`UserInstall`** - Command can be installed on user profiles (REQUIRED for commands in this folder)
- **`GuildInstall`** - Command can be installed in servers (optional, for hybrid commands)

### Contexts

Where the command can be used:

- **`Guild`** - In server channels
- **`BotDM`** - In direct messages with the bot
- **`PrivateChannel`** - In private group DMs

## Rules for User Commands

1. ✅ **MUST include `ApplicationIntegrationType.UserInstall`**
2. ✅ **MUST specify contexts** based on command functionality
3. ✅ **Can optionally add `GuildInstall`** for hybrid behavior
4. ✅ **Guild validation is automatic** based on contexts
5. ✅ **Dev-only uses owner ID checks** at execution time

## Command Patterns

### Pattern 1: User-Only, All Contexts (Most Common)

```typescript
export const data = new SlashCommandBuilder()
  .setName("hello")
  .setDescription("Works everywhere!")
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  .setContexts([
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  ]);
```

**Use Case:** General utility commands that work anywhere

**Example:** `testcmd.ts` (hello command)

---

### Pattern 2: User-Only, Guild Context Only

```typescript
export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Get user info in this server")
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.Guild]); // Guild only
```

**Use Case:** Commands that need server context but can be user-installed

**Example:** `userinfo.ts` - Shows member information (needs guild)

**Note:** Handler automatically validates that `interaction.guild` exists

---

### Pattern 3: User-Only, DM Context Only

```typescript
export const data = new SlashCommandBuilder()
  .setName("ping-dm")
  .setDescription("Check latency (DM only)")
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  .setContexts([InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);
```

**Use Case:** Private commands that shouldn't clutter server command lists

**Example:** `ping-dm.ts` - Private latency check

---

### Pattern 4: Hybrid (User + Guild Installation)

```typescript
export const data = new SlashCommandBuilder()
  .setName("timestamp")
  .setDescription("Generate Discord timestamps")
  .setIntegrationTypes([
    ApplicationIntegrationType.UserInstall,
    ApplicationIntegrationType.GuildInstall, // Also allow guild install
  ])
  .setContexts([
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  ]);
```

**Use Case:** Utility commands useful for both users and servers

**Example:** `hybrid-example.ts` - Timestamp generator

**Note:** Users can install on profile OR servers can install directly

---

### Pattern 5: Dev-Only User Command

```typescript
export const data = new SlashCommandBuilder()
  .setName("dev-test")
  .setDescription("Developer testing")
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  .setContexts([
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  ]);

export const options: LegacyCommandOptions = {
  devOnly: true, // Only owner IDs can execute
};
```

**Use Case:** Developer tools that need to work anywhere

**Example:** `dev-test.ts` - Bot status and debugging

**Note:** Command registers globally but only executes for owner IDs

---

## Command Handler Behavior

### Automatic Detection

The command handler automatically detects commands in `commands/user/` and:

1. Marks them as user commands
2. Validates they have `UserInstall` integration type
3. Logs an error if integration type is missing
4. Logs contexts in debug mode

### Guild Validation

The handler checks contexts to determine if guild is required:

- If contexts = `[Guild]` only → Requires `interaction.guild` to exist
- If contexts include `BotDM` or `PrivateChannel` → Guild is optional

### Dev-Only Enforcement

For user commands with `devOnly: true`:

- Command registers globally (not restricted to dev guilds)
- Execution is blocked unless user ID is in owner IDs
- Silent fail for unauthorized users

## Examples in This Directory

| File                | Pattern   | Contexts   | Description                        |
| ------------------- | --------- | ---------- | ---------------------------------- |
| `testcmd.ts`        | User-only | All        | Basic greeting command             |
| `userinfo.ts`       | User-only | Guild only | Get member info in server          |
| `ping-dm.ts`        | User-only | DM only    | Private latency check              |
| `hybrid-example.ts` | Hybrid    | All        | Timestamp generator (user + guild) |
| `dev-test.ts`       | Dev-only  | All        | Developer diagnostics              |

## Best Practices

### ✅ Do

- Use user commands for utility tools that don't need server state
- Specify appropriate contexts for your command's functionality
- Use hybrid installation for commands that work well in both contexts
- Add meaningful descriptions that explain where the command works
- Check `interaction.guild` existence before using guild-specific features

### ❌ Don't

- Put server-admin commands in user folder (use `commands/moderation/` etc.)
- Forget to add `UserInstall` integration type (handler will error)
- Assume guild context exists without checking contexts
- Use user commands for features that need server configuration

## Testing User Commands

1. **Install on your profile:**

   - Go to your bot's profile
   - Click "Add App" → "Try it now"
   - Command appears in your slash command list everywhere

2. **Test in different contexts:**

   - In a server where the bot is
   - In DMs with the bot
   - In private group chats (if bot is added)

3. **Verify context restrictions:**
   - Guild-only commands shouldn't appear in DMs
   - DM-only commands shouldn't appear in servers

## Migration from Guild Commands

To convert an existing guild command to a user command:

1. Move file to `commands/user/`
2. Add integration types:
   ```typescript
   .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
   ```
3. Add contexts:
   ```typescript
   .setContexts([...]) // Choose appropriate contexts
   ```
4. Update code to handle missing guild context (if applicable)
5. Test in both guild and DM contexts

## Additional Resources

- [Discord API Docs: Application Commands](https://discord.com/developers/docs/interactions/application-commands)
- [Discord.js Guide: Application Commands](https://discordjs.guide/slash-commands/advanced-creation.html)
- See `copilot-instructions.md` for code patterns and best practices
