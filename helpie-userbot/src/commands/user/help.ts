/**
 * Help command - Dynamically display all available Helpie commands with clickable links
 * Will be available as: /helpie help
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder, EmbedBuilder, Colors, ApplicationCommandOptionType } from "discord.js";
import HelpieReplies from "../../utils/HelpieReplies";
import log from "../../utils/log";

export const data = new SlashCommandBuilder().setName("help").setDescription("Get help with Helpie commands and features");

export const options = {
  devOnly: false,
  deleted: false,
};

interface SubcommandInfo {
  name: string;
  description: string;
  subcommands?: SubcommandInfo[];
}

interface GroupedCommands {
  [groupName: string]: SubcommandInfo[];
}

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  await HelpieReplies.deferThinking(interaction, false);

  try {
    // Fetch all application commands to get command structure
    const appCommands = await client.application!.commands.fetch();
    const helpieCommand = appCommands.find((cmd) => cmd.name === "helpie");

    if (!helpieCommand) {
      log.error("Could not find /helpie command in application commands");
      await showFallbackHelp(interaction);
      return;
    }

    // Parse command structure from /helpie command
    const { topLevel, grouped } = parseCommandStructure(helpieCommand);

    // Get context menu commands separately
    const contextMenuCommands = Array.from(appCommands.values())
      .filter((cmd) => cmd.type !== 1) // Type 1 is CHAT_INPUT (slash commands)
      .map((cmd) => ({
        name: cmd.name,
        description: cmd.type === 2 ? "(User)" : "(Message)", // Type 2 = User, Type 3 = Message
      }));

    // Create command mention helper
    const cmd = (path: string) => `</helpie ${path}:${helpieCommand.id}>`;

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle("🤖 Helpie - AI Support Assistant")
      .setDescription("Helpie is a user-installable AI assistant. All commands work in DMs, servers, and private channels.");

    // Add top-level subcommands
    if (topLevel.length > 0) {
      const commandList = topLevel.map((sub) => `${cmd(sub.name)} - ${sub.description}`).join("\n");

      embed.addFields({
        name: "📋 Commands",
        value: commandList,
        inline: false,
      });
    }

    // Add grouped subcommands (subcommand groups)
    for (const [groupName, subcommands] of Object.entries(grouped)) {
      const commandList = subcommands.map((sub) => `${cmd(`${groupName} ${sub.name}`)} - ${sub.description}`).join("\n");

      // Capitalize group name and add emoji
      const displayName = groupName.charAt(0).toUpperCase() + groupName.slice(1);
      const emoji = getGroupEmoji(groupName);

      embed.addFields({
        name: `${emoji} ${displayName}`,
        value: commandList,
        inline: false,
      });
    }

    // Add context menu commands if any were found
    if (contextMenuCommands.length > 0) {
      const contextMenuList = contextMenuCommands.map((cmd) => `**${cmd.name}** ${cmd.description}`).join("\n");

      embed.addFields({
        name: "🖱️ Context Menu Commands",
        value: `Right-click messages or users to access:\n${contextMenuList}`,
        inline: false,
      });
    }

    // Add footer with tips
    embed.addFields({
      name: "💡 Tips",
      value: [
        "• Click command links to auto-fill them",
        "• Context menu commands appear on right-click",
        "• Temporary contexts expire after 5 minutes",
        "• Use `/helpie help` anytime to see this menu",
      ].join("\n"),
      inline: false,
    });

    embed.setFooter({ text: "Helpie • User-Installable AI Assistant" }).setTimestamp();

    await HelpieReplies.editCustomEmbed(interaction, embed);
  } catch (error) {
    log.error("Error generating help command:", error);
    await showFallbackHelp(interaction);
  }
}

/**
 * Parse command structure from Discord ApplicationCommand
 */
function parseCommandStructure(helpieCommand: any): {
  topLevel: SubcommandInfo[];
  grouped: GroupedCommands;
} {
  const topLevel: SubcommandInfo[] = [];
  const grouped: GroupedCommands = {};

  if (!helpieCommand.options) {
    return { topLevel, grouped };
  }

  for (const option of helpieCommand.options) {
    // Check if it's a subcommand group
    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
      const groupName = option.name;
      grouped[groupName] = [];

      if (option.options) {
        for (const subcommand of option.options) {
          grouped[groupName].push({
            name: subcommand.name,
            description: subcommand.description,
          });
        }
      }
    }
    // Check if it's a standalone subcommand
    else if (option.type === ApplicationCommandOptionType.Subcommand) {
      topLevel.push({
        name: option.name,
        description: option.description,
      });
    }
  }

  return { topLevel, grouped };
}

/**
 * Get emoji for command group
 */
function getGroupEmoji(groupName: string): string {
  const emojiMap: { [key: string]: string } = {
    context: "📝",
    admin: "⚙️",
    moderation: "🛡️",
    utility: "🛠️",
    fun: "🎮",
  };

  return emojiMap[groupName.toLowerCase()] || "📁";
}

/**
 * Fallback help when command fetching fails
 */
async function showFallbackHelp(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle("🤖 Helpie - AI Support Assistant")
    .setDescription("Helpie is a user-installable AI assistant. Use `/helpie <command>` to interact.")
    .addFields(
      {
        name: "📋 Available Commands",
        value: "Type `/helpie` and press Tab to see all available commands and their descriptions.",
        inline: false,
      },
      {
        name: "🖱️ Context Menu",
        value: "Right-click messages to see context menu actions like **AI -> Ask** and **AI -> Add Context**.",
        inline: false,
      },
      {
        name: "💡 Tip",
        value: "All commands work in DMs, servers, and private channels!",
        inline: false,
      }
    )
    .setFooter({ text: "Helpie • AI Support Assistant" })
    .setTimestamp();

  await HelpieReplies.editCustomEmbed(interaction, embed);
}
