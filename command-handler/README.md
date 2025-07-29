# @heimdall/command-handler

A powerful, extensible Discord.js command handler with enhanced validation system and full CommandKit compatibility.

## Features

- 🔄 **Full CommandKit Compatibility** - Drop-in replacement for CommandKit
- ✨ **Enhanced Validation System** - Universal and command-specific validations
- 🎯 **Modern TypeScript** - Full type safety and IntelliSense support
- 📁 **Flexible File Structure** - Organize commands and events however you want
- 🔧 **Easy Migration** - Supports both legacy and modern command patterns
- 🚀 **Built-in Logging** - Integrated with @heimdall/logger
- 🔥 **Hot Reload Support** - Development-friendly (coming soon)

## Installation

```bash
bun add @heimdall/command-handler
# or
npm install @heimdall/command-handler
```

## Quick Start

```typescript
import { Client, GatewayIntentBits } from "discord.js";
import { CommandHandler } from "@heimdall/command-handler";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

async function main() {
  // Initialize the command handler
  const handler = await CommandHandler.create({
    client,
    commandsPath: "./src/commands",
    eventsPath: "./src/events",
    validationsPath: "./src/validations",
    devGuildIds: ["YOUR_GUILD_ID"],
    options: {
      autoRegisterCommands: true,
      handleValidationErrors: true,
    },
  });

  await client.login("YOUR_BOT_TOKEN");
}

main();
```

## Command Creation

### Legacy Syntax (CommandKit Compatible)

Create commands using the familiar CommandKit pattern:

```typescript
// src/commands/utility/ping.ts
import { SlashCommandBuilder } from "discord.js";
import type { SlashCommandProps, CommandOptions } from "commandkit";

export const data = new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong!");

export const options: CommandOptions = {
  devOnly: false,
  userPermissions: [],
  botPermissions: ["SendMessages"],
  deleted: false,
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await interaction.reply("Pong!");
}

export async function autocomplete({ interaction, client, handler }: AutocompleteProps) {
  // Optional autocomplete handler
}
```

### Modern Syntax (Enhanced Features)

Use the new modern syntax for enhanced functionality:

```typescript
// src/commands/utility/info.ts
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { ModernCommandData } from "@heimdall/command-handler";

export default {
  data: new SlashCommandBuilder().setName("info").setDescription("Get bot information"),

  config: {
    devOnly: false,
    guildOnly: true,
    cooldown: 5000, // 5 seconds
    userPermissions: [PermissionFlagsBits.UseApplicationCommands],
    botPermissions: [PermissionFlagsBits.SendMessages],
    category: "Utility",
    nsfw: false,
  },

  async execute({ interaction, client, handler }) {
    await interaction.reply({
      content: `Bot: ${client.user.tag}\nServers: ${client.guilds.cache.size}`,
      ephemeral: true,
    });
  },

  async autocomplete({ interaction, client, handler }) {
    // Enhanced autocomplete with better context
  },
} as ModernCommandData;
```

### Context Menu Commands

Both message and user context menus are supported:

```typescript
// src/commands/context/translate.ts
import { ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";

export const data = new ContextMenuCommandBuilder().setName("Translate Message").setType(ApplicationCommandType.Message);

export async function run({ interaction, client, handler }) {
  if (!interaction.isMessageContextMenuCommand()) return;

  const message = interaction.targetMessage;
  await interaction.reply(`Translating: "${message.content}"`);
}
```

## Command Configuration

The command handler supports two ways to configure your commands: **Legacy CommandKit Options** (for compatibility) and **Modern Config Object** (for enhanced features).

### Legacy CommandKit Options

Use the familiar `options` export for CommandKit compatibility:

```typescript
// src/commands/admin/ban.ts
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { SlashCommandProps, CommandOptions } from "commandkit";

export const data = new SlashCommandBuilder().setName("ban").setDescription("Ban a user from the server");

export const options: CommandOptions = {
  devOnly: false, // If true, only registers in dev guilds
  guildOnly: true, // If true, command only works in guilds (not DMs)
  deleted: false, // If true, deletes the command on next startup
  userPermissions: [
    // Required user permissions
    PermissionFlagsBits.BanMembers,
  ],
  botPermissions: [
    // Required bot permissions
    PermissionFlagsBits.BanMembers,
  ],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  // Your command logic here
}
```

### Modern Config Object

Use the enhanced `config` object for new commands:

```typescript
// src/commands/utility/serverinfo.ts
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { ModernCommandData } from "@heimdall/command-handler";

export default {
  data: new SlashCommandBuilder().setName("serverinfo").setDescription("Get information about the server"),

  config: {
    devOnly: false, // Development-only command
    guildOnly: true, // Guild-only command
    deleted: false, // Mark for deletion
    cooldown: 5000, // Cooldown in milliseconds
    userPermissions: [
      // Required user permissions
      PermissionFlagsBits.UseApplicationCommands,
    ],
    botPermissions: [
      // Required bot permissions
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ],
    category: "Utility", // Command category
    nsfw: false, // NSFW content flag

    // Advanced configuration (optional)
    advanced: {
      permissions: {
        roles: ["moderator", "admin"], // Required role names
        users: ["123456789"], // Specific user IDs
      },
      restrictions: {
        dmOnly: false, // DM-only command
        ownerOnly: false, // Bot owner only
        disabled: false, // Temporarily disable
      },
      cooldown: {
        duration: 10000, // Advanced cooldown
        type: "user", // 'user', 'guild', 'global'
        bypassRoles: ["admin"], // Roles that bypass cooldown
        bypassUsers: ["123456789"], // Users that bypass cooldown
      },
      validations: {
        skip: ["cooldowns"], // Skip specific universal validations
        additional: ["premium"], // Run additional validations
      },
    },
  },

  async execute({ interaction, client, handler }) {
    await interaction.reply("Server info here!");
  },
} as ModernCommandData;
```

### Configuration Options Explained

#### Core Options (Both Legacy and Modern)

| Option            | Type                     | Description                                                                                                                                          |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devOnly`         | `boolean`                | If `true`, command is only registered in development guilds specified in your handler config. If `false` or omitted, command is registered globally. |
| `guildOnly`       | `boolean`                | If `true`, command validates that it's being used in a guild (not DMs). **Note:** You should also set proper contexts on your SlashCommandBuilder.   |
| `deleted`         | `boolean`                | If `true`, command will be deleted from Discord on next bot startup. Useful for removing old commands.                                               |
| `userPermissions` | `PermissionResolvable[]` | Array of permissions the user must have to run this command. Automatically validates guild context.                                                  |
| `botPermissions`  | `PermissionResolvable[]` | Array of permissions the bot must have to run this command. Automatically validates guild context.                                                   |

#### Modern Config Only

| Option     | Type      | Description                                         |
| ---------- | --------- | --------------------------------------------------- |
| `cooldown` | `number`  | Simple cooldown in milliseconds applied per user.   |
| `category` | `string`  | Command category for organization and help systems. |
| `nsfw`     | `boolean` | Whether this command contains NSFW content.         |

#### Advanced Modern Config

The `advanced` object provides additional configuration options:

- **`permissions.roles`**: Array of role names that can use this command
- **`permissions.users`**: Array of user IDs that can use this command
- **`restrictions.dmOnly`**: Command can only be used in DMs
- **`restrictions.ownerOnly`**: Command can only be used by bot owners
- **`cooldown.type`**: Apply cooldown per `'user'`, `'guild'`, or `'global'`
- **`validations.skip`**: Skip specific universal validations by name
- **`validations.additional`**: Run additional command-specific validations

### Context Validation

The handler automatically validates command contexts based on your SlashCommandBuilder configuration:

```typescript
// Restrict command to guilds only
export const data = new SlashCommandBuilder().setName("moderation").setDescription("Moderation command").setContexts(InteractionContextType.Guild); // Only works in guilds

// Allow in guilds and bot DMs
export const data = new SlashCommandBuilder().setName("help").setDescription("Get help").setContexts(InteractionContextType.Guild, InteractionContextType.BotDM);
```

**Defensive Programming**: Even with proper Discord contexts, the handler validates the execution context as a security measure against manual API requests.

### Permission Validation

When you specify `userPermissions` or `botPermissions`, the handler automatically:

1. **Validates guild context** - Permission checks only work in guilds
2. **Checks user permissions** - Ensures the user has required permissions
3. **Checks bot permissions** - Ensures the bot can perform the action
4. **Provides helpful errors** - Users get clear error messages about missing permissions

```typescript
// This automatically validates that:
// 1. Command is used in a guild
// 2. User has BanMembers permission
// 3. Bot has BanMembers permission
export const options: CommandOptions = {
  userPermissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],
};
```

### Command Registration Behavior

| `devOnly` | `deleted` | Result                                |
| --------- | --------- | ------------------------------------- |
| `true`    | `false`   | Registered only in development guilds |
| `false`   | `false`   | Registered globally                   |
| `true`    | `true`    | Deleted from development guilds       |
| `false`   | `true`    | Deleted globally                      |

Commands marked as `deleted: true` will be removed from Discord on the next bot startup, then the handler will skip loading them entirely.

## Command Options (CommandKit Compatible)

The `options` export provides powerful configuration for your commands, maintaining full CommandKit compatibility:

```typescript
export const options: CommandOptions = {
  devOnly: true, // Dev server only registration
  userPermissions: ["Administrator"], // Required user permissions
  botPermissions: ["ManageMessages"], // Required bot permissions
  deleted: false, // Command deletion flag
};
```

### Option Details

#### `devOnly: boolean`

Controls where the command is registered:

- `true`: Command registered only in development servers (specified in `devGuildIds`)
- `false` or omitted: Command registered globally

```typescript
export const options: CommandOptions = {
  devOnly: true, // Only available in test servers
};
```

#### `userPermissions: PermissionResolvable[]`

Validates that the user has required permissions in the guild:

- Automatically validates the command is used in a guild
- Checks user has all specified permissions
- Supports both string names and permission flags

```typescript
import { PermissionFlagsBits } from "discord.js";

export const options: CommandOptions = {
  userPermissions: [
    "Administrator", // String format
    PermissionFlagsBits.ManageGuild, // Flag format
    "BanMembers",
  ],
};
```

#### `botPermissions: PermissionResolvable[]`

Validates that the bot has required permissions in the guild:

- Automatically validates the command is used in a guild
- Checks bot has all specified permissions
- Prevents command execution if bot lacks permissions

```typescript
export const options: CommandOptions = {
  botPermissions: ["SendMessages", "EmbedLinks", "ManageMessages"],
};
```

#### `deleted: boolean`

Manages command lifecycle:

- `true`: Command will be deleted from Discord on next bot startup
- `false` or omitted: Command remains active
- Respects `devOnly` setting (deletes from dev servers if `devOnly: true`, global if `devOnly: false`)

```typescript
export const options: CommandOptions = {
  deleted: true, // This command will be removed
};
```

### Context Restrictions

Command context (where they can be used) is controlled by the SlashCommandBuilder itself:

```typescript
import { SlashCommandBuilder, InteractionContextType } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("example")
  .setDescription("Example command")
  // Modern context restriction (recommended)
  .setContexts(
    InteractionContextType.Guild, // Server channels
    InteractionContextType.BotDM, // Bot DMs
    InteractionContextType.PrivateChannel // Group DMs
  )
  // Legacy DM permission (deprecated but supported)
  .setDMPermission(false); // Disallow in DMs
```

**Context Types:**

- `InteractionContextType.Guild` - Server channels
- `InteractionContextType.BotDM` - Direct messages with the bot
- `InteractionContextType.PrivateChannel` - Group DMs and private channels

The command handler automatically validates these contexts and prevents execution in unauthorized locations.

### Built-in Validation Order

The command handler runs validations in this order:

1. **Built-in validations** (CommandOptions enforcement)

   - Context restrictions (based on SlashCommandBuilder)
   - User permissions validation
   - Bot permissions validation

2. **Universal validations** (your `+*.ts` files)

3. **Command-specific validations** (your `validate.*.ts` files)

4. **Command execution**

If any validation fails, the command stops executing and an error message is sent to the user.

## Event Creation

### Legacy Events (CommandKit Compatible)

```typescript
// src/events/messageCreate/automod.ts
import { Message, Client } from "discord.js";

export default async (message: Message, client: Client<true>, handler: CommandHandler) => {
  if (message.author.bot) return;

  // Your automod logic here
  console.log(`Message from ${message.author.tag}: ${message.content}`);
};
```

### Modern Events (Enhanced)

```typescript
// src/events/guildMemberAdd/welcome.ts
import { GuildMember } from "discord.js";
import { ModernEventData } from "@heimdall/command-handler";

export default {
  event: "guildMemberAdd",
  once: false,

  async execute(client, handler, member: GuildMember) {
    const welcomeChannel = member.guild.systemChannel;
    if (!welcomeChannel) return;

    await welcomeChannel.send(`Welcome to the server, ${member}! 🎉`);
  },
} as ModernEventData;
```

## Validation System

The validation system allows you to run checks before commands execute. There are two types:

### Universal Validations (Apply to All Commands)

Universal validations run before every command and use the `+` prefix:

```typescript
// src/validations/+cooldowns.ts
import { ValidationContext, ValidationResult } from "@heimdall/command-handler";

export default async function cooldownValidation({ interaction, command, handler }: ValidationContext): Promise<ValidationResult> {
  // Check if user is on cooldown
  const userId = interaction.user.id;
  const cooldownKey = `cooldown:${command.name}:${userId}`;

  const cooldownEnd = await redis.get(cooldownKey);
  if (cooldownEnd && Date.now() < parseInt(cooldownEnd)) {
    const timeLeft = Math.ceil((parseInt(cooldownEnd) - Date.now()) / 1000);

    return {
      proceed: false,
      error: `⏰ You're on cooldown! Try again in ${timeLeft} seconds.`,
      ephemeral: true,
    };
  }

  // Set cooldown (5 seconds)
  await redis.setex(cooldownKey, 5, (Date.now() + 5000).toString());

  return { proceed: true };
}
```

### Command-Specific Validations

Command-specific validations only run for specific commands using the `validate.{commandName}.ts` pattern:

```typescript
// src/validations/validate.ban.ts
import { ValidationContext, ValidationResult } from "@heimdall/command-handler";
import { PermissionFlagsBits } from "discord.js";

export default async function banValidation({ interaction, command, handler }: ValidationContext): Promise<ValidationResult> {
  if (!interaction.inGuild()) {
    return {
      proceed: false,
      error: "❌ This command can only be used in servers.",
      ephemeral: true,
    };
  }

  const member = interaction.guild.members.cache.get(interaction.user.id);
  if (!member?.permissions.has(PermissionFlagsBits.BanMembers)) {
    return {
      proceed: false,
      error: "❌ You need the `Ban Members` permission to use this command.",
      ephemeral: true,
    };
  }

  return { proceed: true };
}
```

### Validation Execution Order

1. **Universal validations** (in alphabetical order)
2. **Command-specific validations** (in alphabetical order)
3. **Command execution**

If any validation returns `proceed: false`, the command will not execute and the error message will be sent to the user.

## Configuration

### Handler Options

```typescript
interface HandlerConfig {
  client: Client<true>;
  commandsPath: string;
  eventsPath?: string;
  validationsPath?: string;
  devGuildIds?: string[];
  options?: {
    autoRegisterCommands?: boolean; // Auto-register slash commands (default: true)
    handleValidationErrors?: boolean; // Handle validation errors automatically (default: true)
    logLevel?: "debug" | "info" | "warn" | "error"; // Logging level (default: 'info')
    enableHotReload?: boolean; // Enable hot reload in development (default: false)
  };
}
```

### Environment Variables

```bash
# Logging configuration
DEBUG_LOG=true              # Enable debug logging
LOG_TO_FILE=true            # Enable file logging

# Development features
HOT_RELOAD=true             # Enable hot reload (coming soon)
```

## Advanced Features

### Custom Loaders

You can use the individual loaders for advanced setups:

```typescript
import { CommandLoader, EventLoader, ValidationLoader } from "@heimdall/command-handler";

const commandLoader = new CommandLoader();
const commands = await commandLoader.loadCommands("./src/commands");

const eventLoader = new EventLoader();
const events = await eventLoader.loadEvents("./src/events");

const validationLoader = new ValidationLoader();
const { universal, commandSpecific } = await validationLoader.loadValidations("./src/validations");
```

### Manual Command Registration

```typescript
const handler = await CommandHandler.create({
  // ... config
  options: {
    autoRegisterCommands: false, // Disable auto-registration
  },
});

// Register commands manually when ready
client.once("ready", async () => {
  await handler.registerCommands();
});
```

### Error Handling

```typescript
// Custom error handling in validations
export default async function myValidation(ctx: ValidationContext): Promise<ValidationResult> {
  try {
    // Your validation logic
    return { proceed: true };
  } catch (error) {
    console.error("Validation error:", error);
    return {
      proceed: false,
      error: "❌ An unexpected error occurred. Please try again.",
      ephemeral: true,
    };
  }
}
```

## Migration from CommandKit

1. **Install the package** and replace CommandKit imports
2. **Update your handler initialization** to use `CommandHandler.create()`
3. **Keep your existing commands** - they work as-is!
4. **Add validations** to enhance your bot's functionality
5. **Gradually migrate** to modern command syntax for new commands

### Before (CommandKit)

```typescript
import { CommandKit } from "commandkit";

const commandkit = new CommandKit({
  client,
  commandsPath: path.join(__dirname, "commands"),
  eventsPath: path.join(__dirname, "events"),
  devGuildIds: ["YOUR_GUILD_ID"],
});
```

### After (Heimdall Command Handler)

```typescript
import { CommandHandler } from "@heimdall/command-handler";

const handler = await CommandHandler.create({
  client,
  commandsPath: "./src/commands",
  eventsPath: "./src/events",
  validationsPath: "./src/validations",
  devGuildIds: ["YOUR_GUILD_ID"],
});
```

## File Structure Example

```
src/
├── commands/
│   ├── admin/
│   │   ├── ban.ts
│   │   └── kick.ts
│   ├── utility/
│   │   ├── ping.ts
│   │   └── info.ts
│   └── fun/
│       └── joke.ts
├── events/
│   ├── ready/
│   │   └── startup.ts
│   ├── messageCreate/
│   │   └── automod.ts
│   └── guildMemberAdd/
│       └── welcome.ts
└── validations/
    ├── +cooldowns.ts          # Universal: applies to all commands
    ├── +permissions.ts        # Universal: permission checks
    ├── validate.ban.ts        # Command-specific: only for ban command
    └── validate.kick.ts       # Command-specific: only for kick command
```

## TypeScript Types

All types are exported for your convenience:

```typescript
import {
  CommandHandler,
  HandlerConfig,
  LoadedCommand,
  LoadedEvent,
  ValidationContext,
  ValidationResult,
  UniversalValidation,
  CommandSpecificValidation,
  LegacyCommandData,
  ModernCommandData,
  // ... and more
} from "@heimdall/command-handler";
```

## Contributing

This command handler is part of the Heimdall project. Contributions are welcome!

## License

MIT License - see LICENSE file for details.
