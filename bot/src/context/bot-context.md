# {{BOT_NAME}} User Guide

<!--
Available template variables:
- {{BOT_NAME}} - The bot's display name
- {{BOT_ID}} - The bot's Discord ID
- {{BOT_MENTION}} - Mention tag for the bot
- {{GUILD_NAME}} - Current server name (if available)
- {{GUILD_ID}} - Current server ID (if available)
- {{MEMBER_COUNT}} - Current server member count (if available)
- {{CURRENT_YEAR}} - Current year
- {{CURRENT_DATE}} - Current date
- {{CURRENT_TIME}} - Current time
-->

## Account Linking

### Discord Account Linking

{{BOT_NAME}} can link your Discord account to various gaming services and platforms. This enables features like automatic whitelisting, role synchronization, and cross-platform communication.

**Available Linking Commands:**

- `/link-minecraft` - Link your Discord to Minecraft/whitelist systems (if the user is just asking about linking without specifying a service we can assume Minecraft)

**Note:** FiveM/TAW account linking may be available on some servers but is not currently enabled by default.

**How Account Linking Works:**

-- Minecraft

1. Use `/link-minecraft` and add your username
2. Try joining the Minecraft server - you'll be kicked with your authentication code
3. Enter the code in Discord with `/confirm-code`
4. **Wait for staff approval** - This may take some time before you can join
5. You'll receive confirmation once linking is successful and approved

-- FiveM (TAW Account Linking)

_FiveM/TAW account linking is currently not available through standard commands. Contact server administrators if this feature is needed for your server._

**Troubleshooting Account Linking:**

- **"Account not found" errors**: Make sure you've joined the game server with the correct username (Minecraft)
- **Verification timeout**: The process may take a few minutes - please be patient
- **Permission issues**: Ensure you have the required roles to link accounts
- **Already linked**: If you need to re-link, contact server administrators

## Creating Support Tickets

### Modmail System

{{BOT_NAME}} uses a modmail system to handle support requests and communication with server staff.

**How to Create a Ticket:**

1. Send a direct message (DM) to the {{BOT_NAME}} bot
2. Choose the appropriate category for your issue
3. Provide clear details about your problem or question
4. Wait for a response from the support team

**What to Include in Your Ticket:**

- Clear description of the issue
- Steps you've already tried
- Any error messages you received
- Your username/ID for the relevant service
- Screenshots if applicable

**Ticket Categories:**
Different servers may have different categories such as:

- General Support
- Account Issues
- Technical Problems
- Ban Appeals
- Bug Reports

**Response Times:**

- Response times vary by server and issue complexity
- Check with your server's specific policies
- Urgent issues are typically prioritized

## Common Issues & Solutions

### Account Linking Problems

**"Failed to verify account"**

- Double-check you're using the correct username
- Make sure you've joined the required server
- Wait a few minutes and try again
- Contact support if the issue persists

**"Account already linked"**

- Your account may already be connected
- Use server-specific commands to check your linked accounts
- Contact administrators if you need to change linked accounts

**Permission Errors**

- Ensure you have the required Discord roles
- Check that you're in the correct Discord channels
- Some servers require specific permissions to link accounts

### General Bot Issues

**Bot Not Responding**

- Check if the bot is online and has proper permissions
- Make sure you're using commands in the correct channels
- Try using commands in DMs if channel commands aren't working

**Command Not Found**

- Verify you're typing the command correctly
- Some commands may be disabled or restricted
- Check if you have the required permissions

**Can't Create Tickets**

- Ensure your DMs are open to receive messages
- Check if you're blocked from creating tickets
- Try creating a ticket in a designated channel if available

## Available Features

### Public Commands

Most servers provide various utility commands for users:

- Server information and statistics
- User profile lookups
- Game server status checks
- Community features and tools

### Gaming Integration

{{BOT_NAME}} supports integration with various gaming platforms:

- **Minecraft**: Whitelist management, server linking, status checking
- **FiveM**: Server status, roleplay features, player statistics (when enabled)
- **General Gaming**: Cross-platform communication and management

### Moderation Support

While moderation is handled by staff, users can:

- Report issues through the ticket system
- Appeal actions through proper channels
- Get help with account-related problems

## Getting Help

### When to Contact Support

- Account linking issues that persist after troubleshooting
- Technical problems with bot functionality
- Questions about server-specific features
- Appeals or account-related concerns

### How to Get Better Support

- Be specific about your issue
- Include relevant details (usernames, error messages, screenshots)
- Be patient - support teams are volunteers
- Follow up appropriately if you don't receive a response

### Self-Help Resources

- Try basic troubleshooting steps first
- Check server announcements for known issues
- Look for FAQ channels or documentation
- Ask other community members for help with common questions

## Important Notes

- Features and available commands vary by server
- Some functionality requires specific Discord roles or permissions
- Game server linking may require you to be online in the game
- Always follow your server's specific rules and guidelines
- Contact server administrators for server-specific questions

This guide covers the basic functionality available to users. For administrative features, server configuration, or advanced troubleshooting, please contact your server's staff team via modmail.
