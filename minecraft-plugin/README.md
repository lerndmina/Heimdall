# Heimdall Whitelist Plugin

A Minecraft plugin that integrates with the Heimdall Discord bot to provide dynamic whitelist management. This plugin replaces traditional static whitelists with API-based dynamic checking, allowing for real-time whitelist decisions and Discord-based account linking.

## Features

- **Dynamic Whitelist Checking**: Instead of relying on static whitelist files, the plugin checks with the Heimdall bot API on every connection attempt
- **Discord Account Linking**: Players link their Minecraft accounts to Discord through an authentication code system
- **Real-time Decisions**: Staff can approve/deny players through the Discord dashboard without server restarts
- **Fallback System**: If the API is unavailable, falls back to local whitelist for known players
- **Performance Optimized**: Response caching and async processing to minimize server impact
- **Configurable Messages**: Customize all player-facing messages through the config file

## Requirements

- Minecraft Server (Spigot/Paper 1.16+)
- Java 8 or higher
- Heimdall Discord Bot with API enabled
- Network connectivity between your Minecraft server and bot API

## Installation

1. Download the latest `HeimdallWhitelist-X.X.X.jar` from the releases page
2. Place the JAR file in your server's `plugins/` folder
3. Start your server to generate the default configuration
4. Configure the plugin (see Configuration section below)
5. Restart your server or use `/hwl reload`

## Configuration

Edit `plugins/HeimdallWhitelist/config.yml`:

```yaml
# Bot API Configuration
api:
  # The URL of your Heimdall bot API endpoint
  baseUrl: "http://localhost:3001"
  timeout: 5000
  retries: 3
  retryDelay: 1000

# Server identification
server:
  serverId: "auto-generated-uuid"
  displayName: "My Minecraft Server"

# Customize messages shown to players
messages:
  notWhitelisted: "§cYou are not whitelisted on this server!"
  authCodeRequired: "§eYour auth code: §a{code}"
  whitelistSuccess: "§aYou have been whitelisted!"
  apiError: "§cWhitelist system unavailable. Try again later."

# Performance settings
performance:
  cacheTimeout: 30 # Cache responses for 30 seconds
  maxConcurrentRequests: 5
```

### Important Configuration Notes

- **api.baseUrl**: Must point to your Heimdall bot's API endpoint (e.g., `http://your-bot-server.com:3001`)
- **server.serverId**: Auto-generated unique identifier - don't change this after setup
- **server.displayName**: How your server appears in Discord
- **cacheTimeout**: Balance between API load and real-time updates

## Commands

### Player Commands

_None - all interaction happens through Discord_

### Admin Commands

- `/hwl` - Show available commands
- `/hwl reload` - Reload configuration from file
- `/hwl status` - Display plugin status and connectivity
- `/hwl test <player>` - Test whitelist check for a specific player

**Permission Required**: `heimdall.admin` (defaults to OP)

## Permissions

- `heimdall.admin` - Access to admin commands (default: OP)
- `heimdall.bypass` - Bypass all whitelist checks (default: OP)

## How It Works

### For Players

1. Player attempts to join your Minecraft server
2. If not whitelisted, they're shown instructions to join Discord
3. In Discord, they use `/link-minecraft <username>` to start linking
4. They try joining the server again to receive their authentication code
5. They confirm the code in Discord using `/confirm-code <code>`
6. Staff approve their request through the Discord dashboard
7. Player can now join the server normally

### For Staff

1. View pending whitelist applications in the Discord dashboard
2. See player information, Discord profile, and Minecraft username
3. Approve or deny applications with optional notes
4. Real-time updates - no server restarts needed
5. Manage all linked players through the web interface

### Technical Flow

1. **Connection Attempt**: Player tries to join
2. **API Request**: Plugin calls bot API with player info
3. **Decision Logic**: Bot checks database for player status
4. **Response**: API returns whitelist decision and any messages
5. **Action**: Plugin allows/denies connection based on response
6. **Caching**: Response cached briefly to reduce API load

## Troubleshooting

### Common Issues

**"Whitelist system is temporarily unavailable"**

- Check that your bot API is running and accessible
- Verify the `api.baseUrl` in your config
- Check server logs for connection errors

**Players can't get auth codes**

- Ensure Discord integration is properly configured
- Check that the bot has necessary permissions in Discord
- Verify the server ID matches between plugin and bot

**Plugin not working after restart**

- Check console for configuration errors
- Ensure all required permissions are granted
- Verify Java version compatibility

### Debug Mode

Enable debug logging in `config.yml`:

```yaml
logging:
  debug: true
  logRequests: true
  logDecisions: true
```

This will log detailed information about API requests and whitelist decisions.

## Error Handling & Fail-Open Behavior

The plugin implements a robust error handling system with configurable fallback behavior when the Heimdall bot API is unavailable.

### API Retry Logic

When the API is unreachable or returns errors, the plugin will:

1. **Retry 3 times** (configurable via `api.retries`)
2. **Wait between retries** (configurable via `api.retryDelay`)
3. **Fall back** to the configured `apiFallbackMode` after all retries fail

### Fallback Modes

Configure the fallback behavior in `config.yml` under `advanced.apiFallbackMode`:

```yaml
advanced:
  # Fallback behavior when API is completely unavailable after all retries
  apiFallbackMode: "allow" # Recommended for production
```

**Available modes:**

- **`"allow"`** (Recommended): **Fail-open** - Allow all players to join when API is down

  - ✅ Ensures server availability during API outages
  - ⚠️ Temporarily bypasses whitelist security
  - 📝 Players receive a message explaining the situation
  - 💡 Best for production servers where uptime is critical

- **`"whitelist-only"`**: Fall back to local Minecraft whitelist only

  - ✅ Maintains some security during outages
  - ❌ Only previously whitelisted players can join
  - 📝 New players cannot join during API downtime

- **`"deny"`**: **Fail-closed** - Deny all connections when API is down
  - ✅ Maximum security (no unauthorized access)
  - ❌ Server becomes inaccessible during API outages
  - 📝 All players see "API unavailable" message

### Production Recommendation

For production servers, use `apiFallbackMode: "allow"` to ensure your server remains accessible even during:

- Network connectivity issues
- Bot maintenance/updates
- API server downtime
- Database connectivity problems

Players connecting during fail-open mode will receive a message encouraging them to link their Discord account when the system is restored.

### Performance Issues

If you're experiencing lag:

1. Increase `performance.cacheTimeout` to reduce API calls
2. Check your API server performance and network latency
3. Monitor the `performance.maxConcurrentRequests` setting
4. Consider if your API server needs more resources

## Integration with Heimdall Bot

This plugin requires the Heimdall Discord bot to be properly configured:

1. **Environment Variables**: Set `ENABLE_MINECRAFT_SYSTEMS=true` in your bot
2. **API Configuration**: Ensure the bot's API server is running
3. **Database**: MongoDB should be accessible to the bot
4. **Discord Setup**: Bot needs appropriate Discord permissions

See the main Heimdall documentation for bot setup instructions.

## Development

### Building from Source

```bash
git clone https://github.com/lerndmina/Heimdall.git
cd Heimdall/minecraft-plugin
mvn clean package
```

The compiled JAR will be in `target/HeimdallWhitelist-X.X.X.jar`.

### API Endpoints Used

- `POST /api/minecraft/connection-attempt` - Check if player should be whitelisted

### Dependencies

- Spigot/Paper API 1.20.1
- Gson 2.10.1 (bundled)

## Support

- **Issues**: Report bugs on [GitHub Issues](https://github.com/lerndmina/Heimdall/issues)
- **Documentation**: See the main [Heimdall Documentation](https://github.com/lerndmina/Heimdall)
- **Discord**: Join our Discord server for community support

## License

This project is licensed under the same license as the main Heimdall project.
