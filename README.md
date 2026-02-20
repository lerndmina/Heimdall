# Heimdall

<div align="center">

**A comprehensive Discord bot and Minecraft server ecosystem with plugin-based architecture**

[![Discord.js](https://img.shields.io/badge/discord.js-v14.25.1-blue.svg)](https://discord.js.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-black.svg)](https://bun.sh)

</div>

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Available Plugins](#available-plugins)
- [Minecraft Integration](#minecraft-integration)
- [Usage](#usage)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Heimdall** is an all-in-one community management platform that combines powerful Discord bot functionality with seamless Minecraft server integration. Built on a modular plugin architecture, Heimdall provides everything you need to manage your Discord community and Minecraft server from a single, unified system.

The project consists of two main components:

1. **Discord Bot** (TypeScript/Bun) - Plugin-based bot with 14 built-in plugins for community management
2. **Minecraft Integration** (Java) - Dynamic whitelist plugin for Paper/Spigot and Velocity servers

---

## Features

### 🎯 Core Bot Features

- **Plugin-Based Architecture** - Modular design with dependency resolution and hot-reload support
- **MongoDB & Redis Integration** - Persistent storage with intelligent caching
- **RESTful API** - Express.js API with Swagger/OpenAPI documentation
- **Error Tracking** - Integrated Sentry for production monitoring
- **Advanced Permission System** - Granular permission control per plugin
- **Guild-Specific Configuration** - Environment variables per Discord server

### 🔌 Built-in Plugins

#### Community Management

- **Tickets** - Support ticket system
- **Modmail** - DM-based modmail support system with forum threads and webhook relay
- **Logging** - Server event logging with per-category channels and subcategory toggles
- **Welcome** - Welcome messages for new members with template variables
- **Suggestions** - Community suggestion system with voting, categories, AI titles, and dual embed/forum modes
- **Tags** - Guild-specific text tags with CRUD, usage tracking, and autocomplete

#### Utilities

- **Reminders** - Personal reminders with context-aware ticket/modmail integration, background delivery, and dashboard API
- **TempVC** - Join-to-create temporary voice channel system
- **Minigames** - Fun minigames including Connect4, TicTacToe, Dice gambling, and HeimdallCoin economy
- **Dev** - Owner-only developer utilities (database tools, diagnostics)
- **Ping** - Simple ping command for testing

#### Integration

- **Minecraft** - Minecraft whitelist integration — account linking, RCON, role sync, leave revocation
- **Support-Core** - Core support system infrastructure for tickets and modmail
- **Lib** - Shared utilities library for Heimdall plugins

### 🎮 Minecraft Features

- **Dynamic Whitelist Management** - API-based real-time whitelist checking
- **Discord Account Linking** - Link Minecraft accounts via authentication codes
- **Staff Dashboard Control** - Approve/deny players from Discord without server restarts
- **Multi-Platform Support** - Single JAR for both Paper/Spigot and Velocity
- **LuckPerms Integration** - Automatic Discord role to server group synchronization
- **Intelligent Caching** - Performance optimized with configurable fallback modes
- **Configurable Fallback** - Choose behavior when API is unavailable (allow/deny/whitelist-only)

---

## Architecture

```
Heimdall Ecosystem
├── Discord Bot (TypeScript/Bun)
│   ├── Core Systems
│   │   ├── Plugin Loader (dependency resolution)
│   │   ├── Command Manager (slash commands)
│   │   ├── Event Manager (Discord events)
│   │   ├── API Manager (REST endpoints)
│   │   └── Interaction Handler (buttons, modals, etc.)
│   │
│   ├── Services
│   │   ├── Component Callback Service
│   │   ├── Guild Environment Service
│   │   └── Database Services (MongoDB)
│   │
│   ├── Storage
│   │   ├── MongoDB (persistent data)
│   │   └── Redis (caching layer)
│   │
│   └── 14 Plugins (modular functionality)
│
└── Minecraft Integration (Java)
    ├── Paper/Spigot Plugin (1.21.1+)
    ├── Velocity Proxy Plugin (3.4.0+)
    ├── API Client (communicates with bot)
    └── LuckPerms Integration (optional)
```

### Plugin System

Heimdall uses a manifest-based plugin system where each plugin declares:

- **Dependencies** - Required plugins that must load first
- **API Routes** - REST endpoints exposed by the plugin
- **Environment Variables** - Required/optional configuration
- **Commands** - Slash commands registered with Discord
- **Events** - Discord events the plugin listens to

Plugins are loaded in dependency order, ensuring proper initialization.

---

## Prerequisites

### Discord Bot

- **Runtime**: [Bun](https://bun.sh) (recommended) or Node.js 18+
- **Databases**:
  - MongoDB 4.4+ (persistent storage)
  - Redis 6.0+ (caching)
- **Operating System**: Linux, macOS, or Windows
- **Memory**: Minimum 512MB RAM (1GB+ recommended)

### Minecraft Plugin

- **Paper/Spigot**: Java 17+, Paper 1.21.1+ or compatible fork
- **Velocity**: Java 17+, Velocity 3.4.0+
- Network connectivity between Minecraft server and bot API

---

## Installation

### Discord Bot Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/lerndmina/Heimdall.git
   cd Heimdall/bot
   ```

2. **Install dependencies**

   ```bash
   # Using Bun (recommended)
   bun install

   # Or using npm
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration (see Configuration section)
   ```

4. **Start MongoDB and Redis**

   ```bash
   # Using Docker Compose (example)
   docker-compose up -d mongodb redis

   # Or install locally following official documentation
   ```

5. **Run the bot**

   ```bash
   # Development mode
   bun run dev

   # Production mode
   bun start
   ```

### Minecraft Plugin Setup

See the detailed [Minecraft Plugin README](minecraft-plugin/README.md) for complete installation instructions.

**Quick Setup:**

1. Download the latest `heimdall-whitelist-X.X.X.jar` from releases
2. Place in your `plugins/` folder (Paper/Spigot) or `plugins/` folder (Velocity)
3. Start server to generate configuration
4. Edit config and set your bot API URL and API key
5. Restart server or use `/hwl reload`

---

## Configuration

### Bot Configuration (.env)

Create a `.env` file in the `bot/` directory based on `.env.example`:

```env
# Required - Bot Configuration
BOT_TOKEN=your_discord_bot_token
OWNER_IDS=123456789012345678,987654321098765432

# Required - Database
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=heimdall_v1
REDIS_URL=redis://localhost:6379

# Required - Security
ENCRYPTION_KEY=generate_with_openssl_rand_hex_32

# Optional - Debugging
DEBUG_LOG=false
LOG_TO_FILE=false

# Optional - Sentry
SENTRY_DSN=
SENTRY_ENABLED=true

# Optional - API
API_PORT=3001

# Optional - Misc
NANOID_LENGTH=12

# Optional - Plugin Features
OPENAI_API_KEY=           # For AI title generation in suggestions plugin
OPENROUTER_API_KEY=       # For AI suggestions in modmail plugin
TICKET_TRANSCRIPT_WEBHOOK= # For transcript logging in tickets plugin
```

### Getting Your Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Navigate to the "Bot" section
4. Click "Reset Token" and copy your bot token
5. Enable the following Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent
   - Presence Intent (optional)

### Generating Encryption Key

```bash
openssl rand -hex 32
```

### Inviting the Bot

Generate an invite URL with these scopes and permissions:

- **Scopes**: `bot`, `applications.commands`
- **Bot Permissions**: Administrator (or customize as needed)

Example URL:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

### Plugin Configuration

Most plugins support per-guild configuration through Discord commands. After inviting the bot:

1. Use `/setup` or plugin-specific setup commands
2. Configure plugin settings through interactive menus
3. Settings are stored per-guild in MongoDB

---

## Available Plugins

### Tickets Plugin

Support ticket system with categories, transcripts, and role-based access.

**Commands:**

- `/ticket create` - Create a new support ticket
- `/ticket close` - Close the current ticket
- `/ticket add <user>` - Add user to ticket
- `/ticket remove <user>` - Remove user from ticket

### Modmail Plugin

DM-based modmail support system with forum threads and webhook relay.

**Features:**

- Users DM the bot to create modmail threads
- Staff respond via Discord forum threads
- All messages are relayed bidirectionally via webhook
- Optional AI response suggestions (OpenRouter integration)
- Full conversation transcripts
- Auto-close toggle and forum tag helpers

### Minecraft Plugin

Minecraft whitelist integration with account linking, RCON, role sync, and leave revocation.

**Commands:**

- `/link-minecraft <username>` - Start linking your Minecraft account
- `/confirm-code <code>` - Confirm your authentication code
- `/unlink-minecraft` - Unlink your Minecraft account
- `/minecraft-status` - View your link status

**Admin Commands:**

- `/minecraft-approve <user>` - Approve whitelist application
- `/minecraft-deny <user>` - Deny whitelist application
- `/minecraft-manage` - Open management dashboard

### Logging Plugin

Server event logging with per-category channels and subcategory toggles.

**Logged Events:**

- Message edits and deletions
- Member joins, leaves, and updates
- Role changes
- Channel changes
- Voice state changes
- Moderation actions

### TempVC Plugin

Join-to-create temporary voice channel system with full user control.

**Features:**

- Join designated channel to create your own VC
- Full control over your channel (name, limit, permissions)
- Channel auto-deletes when empty
- Customizable creation channel

### Welcome Plugin

Welcome messages for new members with template variables.

**Features:**

- Welcome messages in designated channel
- Direct message welcome
- Customizable embed messages
- Variable support (`{user}`, `{server}`, `{memberCount}`)

### Minigames Plugin

Fun minigames including Connect4, TicTacToe, Dice gambling, and HeimdallCoin economy.

**Games:**

- `/connect4 <opponent>` - Play Connect Four
- `/tictactoe <opponent>` - Play Tic-Tac-Toe
- `/dice [sides]` - Roll dice (gambling)

**Economy:**

- `/balance` - Check your HeimdallCoin balance
- `/daily` - Claim daily coins
- `/leaderboard` - View richest users

### Suggestions Plugin

Community suggestion system with voting, categories, AI titles, and dual embed/forum modes.

**Features:**

- Submit suggestions with `/suggest`
- Voting system with upvote/downvote
- Organize by categories
- AI-generated titles (optional OpenAI integration)
- Support for both embed and forum thread modes

### Tags Plugin

Guild-specific text tags with CRUD, usage tracking, and autocomplete.

**Commands:**

- `/tag <name>` - Display a tag
- `/tag create <name> <content>` - Create a new tag
- `/tag edit <name> <content>` - Edit existing tag
- `/tag delete <name>` - Delete a tag
- Usage tracking and autocomplete support

### Reminders Plugin

Personal reminders with context-aware ticket/modmail integration, background delivery, and dashboard API.

**Features:**

- `/remind <time> <message>` - Set a reminder
- Context-aware: remembers if set in a ticket or modmail thread
- Background delivery service ensures reminders are sent
- Dashboard API for managing reminders

### Dev Plugin

Owner-only developer utilities (database tools, diagnostics).

**Features:**

- Database management tools
- MongoDB import/export utilities
- Diagnostic commands
- Bot maintenance utilities
- Owner-only access

### Ping Plugin

Simple ping command for testing bot latency and responsiveness.

---

## Minecraft Integration

Heimdall includes a sophisticated Minecraft integration system that provides dynamic whitelist management through Discord.

### How It Works

1. **Player attempts to join** your Minecraft server
2. **Plugin checks with bot API** if player is whitelisted
3. **If not whitelisted**, player receives instructions to link Discord
4. **Player uses Discord** to link their Minecraft account
5. **Authentication code** is generated when player joins again
6. **Player confirms code** in Discord
7. **Staff approve** via Discord dashboard
8. **Player can now join** - no server restart needed!

### Features

- **Real-time Whitelist**: No more manual file editing
- **Discord Integration**: Full account linking system
- **Staff Dashboard**: Web-based management interface (coming soon)
- **Role Sync**: Automatically sync Discord roles to LuckPerms groups
- **Multi-Server**: Support for network setups with Velocity proxy
- **Caching**: Intelligent caching reduces API calls
- **Fallback Modes**: Configurable behavior during API downtime

### Setup

See the [Minecraft Plugin README](minecraft-plugin/README.md) for detailed setup instructions, configuration options, and troubleshooting.

---

## Usage

### Starting the Bot

```bash
cd bot
bun start
```

### Basic Commands

Once the bot is running and invited to your server:

1. **Setup commands** - Each plugin has setup commands (e.g., `/ticket-setup`)
2. **Help command** - Use `/help` to see available commands
3. **Plugin management** - Use `/plugin list` to see loaded plugins

### Enabling/Disabling Plugins

Plugins are automatically loaded based on their manifest files. To disable a plugin:

1. Remove or rename the plugin's directory in `bot/plugins/`
2. Restart the bot

### API Access

The bot exposes a REST API for external integrations:

- **Base URL**: `http://localhost:3001` (configurable via `API_PORT`)
- **Documentation**: Access Swagger UI at `http://localhost:3001/api-docs`
- **Authentication**: Use API keys generated via `/api-keys` command

### Example API Endpoints

```
GET  /api/health              - Health check
POST /api/minecraft/connection-attempt - Check player whitelist status
GET  /api/minecraft/players   - List linked players
POST /api/modmail/send        - Send modmail message
```

---

## Development

### Project Structure

```
Heimdall/
├── bot/                          # Discord bot codebase
│   ├── src/
│   │   ├── core/                 # Core bot systems
│   │   │   ├── ApiManager.ts
│   │   │   ├── CommandManager.ts
│   │   │   ├── EventManager.ts
│   │   │   └── PluginLoader.ts
│   │   ├── types/                # TypeScript type definitions
│   │   ├── utils/                # Shared utilities
│   │   └── index.ts              # Bot entry point
│   ├── plugins/                  # Plugin directory
│   │   ├── minecraft/
│   │   ├── tickets/
│   │   ├── modmail/
│   │   └── ... (14 plugins)
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
└── minecraft-plugin/             # Minecraft plugin codebase
    ├── src/                      # Java source code
    ├── pom.xml                   # Maven build configuration
    ├── config-example.yml        # Example configuration
    └── README.md                 # Plugin documentation
```

### Building the Bot

```bash
cd bot

# TypeScript compilation check
bun run build

# Run linter
bun run lint

# Fix linting issues
bun run lint:fix
```

### Creating a Custom Plugin

1. **Create plugin directory**

   ```bash
   cd bot/plugins
   mkdir my-plugin
   cd my-plugin
   ```

2. **Create manifest.json**

   ```json
   {
     "name": "my-plugin",
     "version": "1.0.0",
     "description": "My custom plugin",
     "dependencies": ["lib"],
     "optionalDependencies": [],
     "requiredEnv": [],
     "optionalEnv": [],
     "apiRoutePrefix": "/my-plugin"
   }
   ```

3. **Create plugin entry point (index.ts)**

   ```typescript
   import { Plugin } from "@types/plugin";

   export default class MyPlugin extends Plugin {
     async onLoad() {
       this.logger.info("My plugin loaded!");
     }

     async onUnload() {
       this.logger.info("My plugin unloaded!");
     }
   }
   ```

4. **Add commands, events, or API routes as needed**

5. **Restart bot** - Plugin will be automatically loaded

### Path Aliases

The bot uses TypeScript path aliases for cleaner imports:

- `@core/*` → `src/core/*`
- `@utils/*` → `src/utils/*`
- `@types/*` → `src/types/*`

### Building the Minecraft Plugin

```bash
cd minecraft-plugin

# Build with Maven
mvn clean package

# Output JAR location
ls target/HeimdallWhitelist-*.jar
```

### Running Tests

Currently, the project doesn't have automated tests. Testing is done manually:

1. **Bot Testing**: Run in development mode and test commands
2. **Plugin Testing**: Test on development Minecraft server

---

## Troubleshooting

### Bot Won't Start

**Check environment variables**

```bash
cd bot
cat .env
```

Ensure all required variables are set (see Configuration section).

**Check database connections**

```bash
# Test MongoDB
mongosh $MONGODB_URI

# Test Redis
redis-cli -u $REDIS_URL ping
```

**Check logs**

- Enable debug logging: `DEBUG_LOG=true`
- Enable file logging: `LOG_TO_FILE=true`
- Check console output for errors

### Commands Not Appearing

1. **Ensure bot has permissions** in Discord server
2. **Check bot intents** are enabled in Discord Developer Portal
3. **Re-invite bot** with correct permissions
4. **Wait for Discord to update** (can take up to 1 hour)

### Plugin Not Loading

1. **Check manifest.json** for syntax errors
2. **Verify dependencies** are available
3. **Check console** for error messages
4. **Ensure plugin directory** structure is correct

### Minecraft Plugin Issues

See the [Minecraft Plugin README](minecraft-plugin/README.md) troubleshooting section for detailed help.

**Common Issues:**

- API connection failures: Check `api.baseUrl` and network connectivity
- Auth codes not working: Verify bot API is running
- Performance issues: Increase cache timeout values

### API Not Responding

1. **Check API port**: Ensure `API_PORT` is not in use
2. **Check firewall**: Allow connections to API port
3. **Test locally**: `curl http://localhost:3001/api/health`
4. **Check logs**: Look for API startup errors

### Database Issues

**MongoDB connection errors:**

- Verify MongoDB is running: `systemctl status mongodb`
- Check connection string format
- Ensure database user has proper permissions

**Redis connection errors:**

- Verify Redis is running: `systemctl status redis`
- Check Redis URL format
- Test connection: `redis-cli ping`

---

## Contributing

Contributions are welcome! Please follow these guidelines:

### Reporting Issues

1. Check existing issues first
2. Provide detailed description
3. Include error messages and logs
4. Specify bot version and environment

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Follow existing code style
- Use TypeScript for bot code
- Use proper types (avoid `any`)
- Comment complex logic
- Update documentation as needed

### Plugin Development Guidelines

- Keep plugins modular and focused
- Declare all dependencies in manifest
- Use the `lib` plugin for shared utilities
- Follow the plugin template structure
- Document commands and features

---

## License

This project is licensed under **PolyForm Noncommercial 1.0.0** with a project-specific **Single Discord Server Addendum**.

- ✅ Public source code, modification, and self-hosting are allowed
- ✅ Noncommercial use is allowed (per PolyForm Noncommercial 1.0.0)
- ⚠️ Usage is limited to **one active Discord server (guild) at a time** per person/organization (addendum)
- ❌ Commercial use is not allowed

See [LICENSE](./LICENSE) for full terms.

---

## Credits

**Developed by**: [lerndmina](https://github.com/lerndmina)

**Built with**:

- [Discord.js](https://discord.js.org) - Discord API wrapper
- [Bun](https://bun.sh) - Fast JavaScript runtime
- [MongoDB](https://www.mongodb.com) - Database
- [Redis](https://redis.io) - Caching
- [Express](https://expressjs.com) - API framework
- [TypeScript](https://www.typescriptlang.org) - Type safety

---

## Support

- **Issues**: Report bugs on [GitHub Issues](https://github.com/lerndmina/Heimdall/issues)
- **Discord**: Join our Discord server for community support
- **Documentation**: Check the [Minecraft Plugin README](minecraft-plugin/README.md) for plugin-specific help

---

<div align="center">

**Made with ❤️ for Discord communities and Minecraft servers**

⭐ Star this repository if you find it useful!

</div>
