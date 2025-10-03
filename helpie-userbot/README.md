# Helpie Userbot

A user-installable Discord bot for support tickets and AI assistance.

## Overview

Helpie is designed to be installed on **user profiles** rather than guilds. This means users can take Helpie with them to any server and use commands across different contexts (servers, DMs, private channels).

## Features

- 🤖 **User-Installable**: Install on your Discord profile
- 💬 **Support Tickets**: Manage support tickets across servers
- 🤖 **AI Integration**: OpenAI-powered assistance
- 📊 **MongoDB Storage**: Persistent data storage
- 🔄 **Hot Reload**: Development mode with automatic reloading

## Setup

### 1. Prerequisites

- Bun runtime installed
- MongoDB instance running
- Discord bot application created with user-install enabled

### 2. Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. In the **Installation** tab:
   - Enable "User Install"
   - Add scopes: `applications.commands`
   - Add permissions as needed
4. In the **Bot** tab:
   - Create a bot
   - Copy the bot token
   - Enable "Message Content Intent" if needed

### 3. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your values
BOT_TOKEN=your_bot_token_here
OWNER_IDS=your_discord_user_id
OPENAI_API_KEY=your_openai_key
MONGODB_URI=mongodb://localhost:27017
```

### 4. Install Dependencies

```bash
bun install
```

### 5. Run the Bot

```bash
# Development mode (with hot reload)
bun run dev

# Production mode
bun run start
```

## Project Structure

```
helpie-userbot/
├── src/
│   ├── commands/
│   │   └── user/           # User-installable commands
│   │       ├── ping.ts
│   │       └── help.ts
│   ├── events/
│   │   └── ready/          # Event handlers
│   │       └── 01ready.ts
│   ├── validations/        # Command validations
│   ├── utils/
│   │   ├── FetchEnvs.ts   # Environment configuration
│   │   └── log.ts         # Logger utility
│   └── index.ts           # Main bot file
├── .env.example           # Example environment config
└── package.json
```

## Creating Commands

All commands should be user-installable and support multiple contexts:

```typescript
import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("mycommand")
  .setDescription("My user command")
  // REQUIRED: User-installable
  .setIntegrationTypes([ApplicationIntegrationType.UserInstall])
  // Choose contexts where command works
  .setContexts([
    InteractionContextType.Guild, // In servers
    InteractionContextType.BotDM, // In bot DMs
    InteractionContextType.PrivateChannel, // In private channels
  ]);
```

## Environment Variables

| Variable           | Required | Description                             |
| ------------------ | -------- | --------------------------------------- |
| `BOT_TOKEN`        | ✅       | Discord bot token                       |
| `OWNER_IDS`        | ✅       | Comma-separated user IDs for bot owners |
| `OPENAI_API_KEY`   | ✅       | OpenAI API key for AI features          |
| `MONGODB_URI`      | ✅       | MongoDB connection string               |
| `MONGODB_DATABASE` | ❌       | Database name (default: helpie)         |
| `DEBUG_LOG`        | ❌       | Enable debug logging (default: false)   |
| `LOG_TO_FILE`      | ❌       | Enable file logging (default: false)    |
| `NODE_ENV`         | ❌       | Environment (development/production)    |

## Development

```bash
# Run with hot reload
bun run dev

# Build TypeScript
bun run build

# Format code (if configured)
bun run format
```
