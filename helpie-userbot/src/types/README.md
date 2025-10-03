# Helpie Types

This directory contains type definitions specific to Helpie's command system.

## commands.ts

Defines the core command types for Helpie, replacing the dependency on Heimdall's command handler.

### Key Types

**CommandOptions**

- `devOnly?: boolean` - Restricts command to bot owners (via OWNER_IDS env var)
- `deleted?: boolean` - Marks command for removal from Discord

**SlashCommandModule**

- Used for `/helpie` subcommands
- `data: SlashCommandBuilder` - Discord.js command builder
- `run: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>`

**ContextMenuCommandModule**

- Used for right-click context menu commands
- `data: ContextMenuCommandBuilder` - Discord.js context menu builder
- `run: (interaction: MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction, client: Client) => Promise<void>`

### Usage

```typescript
// Slash command
import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import { CommandOptions } from "../../types/commands";

export const data = new SlashCommandBuilder().setName("example").setDescription("Example command");

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Implementation
}
```

```typescript
// Context menu command
import { ContextMenuCommandBuilder, ApplicationCommandType, MessageContextMenuCommandInteraction, Client } from "discord.js";
import { CommandOptions } from "../../types/commands";

export const data = new ContextMenuCommandBuilder().setName("Example Action").setType(ApplicationCommandType.Message);

export const options: CommandOptions = {
  deleted: false,
};

export async function run(interaction: MessageContextMenuCommandInteraction, client: Client) {
  // Implementation
}
```

## Benefits Over Heimdall Types

1. **No External Dependency** - Doesn't rely on `@heimdall/command-handler` package
2. **Simpler** - Only includes what Helpie needs (no ButtonKit, validations, etc.)
3. **Direct Discord.js Types** - Uses native Discord.js types directly
4. **Clear Separation** - Message vs User context menus properly typed
5. **Better Type Safety** - No `any` types or loose props objects
