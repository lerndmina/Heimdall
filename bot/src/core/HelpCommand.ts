/**
 * /help — Lists all available bot commands with clickable mentions.
 *
 * Uses Discord's </command:id> mention format for interactive command links.
 * Groups commands by their source plugin with pagination.
 *
 * This is registered as a core command from index.ts, not from any plugin.
 */

import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { CommandContext } from "./CommandManager.js";
import type { CommandManager } from "./CommandManager.js";
import type { ComponentCallbackService } from "./services/ComponentCallbackService.js";
import { nanoid } from "nanoid";

/**
 * Build the help command's SlashCommandBuilder data.
 */
export function buildHelpCommandData() {
  return new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all available bot commands")
    .addStringOption((opt) => opt.setName("command").setDescription("Get detailed info about a specific command").setRequired(false))
    .toJSON();
}

interface HelpPage {
  title: string;
  fields: { name: string; value: string }[];
}

/**
 * Build paginated help pages from registered commands.
 */
function buildHelpPages(commandManager: CommandManager, guildId: string): HelpPage[] {
  const commands = commandManager.getAllCommands();

  // Group commands by plugin
  const grouped = new Map<string, { name: string; description: string; mention: string }[]>();

  for (const [name, cmd] of commands) {
    const plugin = cmd.config.pluginName || "core";
    if (!grouped.has(plugin)) grouped.set(plugin, []);

    const mention = commandManager.getCommandMention(name, guildId);
    const description = cmd.data.description || "No description";

    grouped.get(plugin)!.push({ name, description, mention });
  }

  // Sort plugins alphabetically, but put "core" first
  const sortedPlugins = [...grouped.keys()].sort((a, b) => {
    if (a === "core") return -1;
    if (b === "core") return 1;
    return a.localeCompare(b);
  });

  // Build pages — each page gets up to 3 plugin categories, or splits large categories
  const pages: HelpPage[] = [];
  let currentFields: { name: string; value: string }[] = [];
  const FIELDS_PER_PAGE = 4;

  for (const plugin of sortedPlugins) {
    const cmds = grouped.get(plugin)!;
    cmds.sort((a, b) => a.name.localeCompare(b.name));

    const label = plugin.charAt(0).toUpperCase() + plugin.slice(1);

    // Build field value with command mentions
    const lines = cmds.map((c) => `${c.mention} — ${c.description}`);

    // Split into chunks if too long (Discord field value limit is 1024)
    const chunks: string[] = [];
    let currentChunk = "";
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > 1000) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk += (currentChunk ? "\n" : "") + line;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    for (let i = 0; i < chunks.length; i++) {
      const fieldName = chunks.length > 1 ? `${label} (${i + 1}/${chunks.length})` : label;
      currentFields.push({ name: fieldName, value: chunks[i]! });

      if (currentFields.length >= FIELDS_PER_PAGE) {
        pages.push({ title: `Commands`, fields: [...currentFields] });
        currentFields = [];
      }
    }
  }

  // Push remaining fields
  if (currentFields.length > 0) {
    pages.push({ title: `Commands`, fields: currentFields });
  }

  // If no commands at all
  if (pages.length === 0) {
    pages.push({ title: "Commands", fields: [{ name: "No Commands", value: "No commands are currently registered." }] });
  }

  return pages;
}

/**
 * Create the help command execute function.
 * Requires commandManager reference for building mentions and
 * componentCallbackService for registering ephemeral button callbacks.
 */
export function createHelpExecute(commandManager: CommandManager, componentCallbackService: ComponentCallbackService) {
  return async (context: CommandContext) => {
    const { interaction, client } = context;
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    const specificCommand = interaction.options.getString("command");

    // If a specific command is requested, show detailed info
    if (specificCommand) {
      const cmd = commandManager.getCommand(specificCommand);
      if (!cmd) {
        await interaction.reply({ content: `Command \`${specificCommand}\` not found.`, ephemeral: true });
        return;
      }

      const mention = commandManager.getCommandMention(specificCommand, guildId);
      const embed = new EmbedBuilder()
        .setTitle(`Command: ${mention}`)
        .setDescription(cmd.data.description || "No description available.")
        .setColor(0x5865f2)
        .addFields({ name: "Plugin", value: cmd.config.pluginName ?? "core", inline: true });

      if (cmd.config.cooldown) {
        embed.addFields({ name: "Cooldown", value: `${cmd.config.cooldown}s`, inline: true });
      }

      // Show options/subcommands if present
      const options = cmd.data.options;
      if (options && options.length > 0) {
        const optLines = options.map((opt: any) => {
          const required = opt.required ? " *(required)*" : "";
          // Check if it's a subcommand (type 1)
          if (opt.type === 1) {
            const subMention = commandManager.getCommandMention(specificCommand, guildId, opt.name);
            return `${subMention} — ${opt.description || ""}`;
          }
          return `\`${opt.name}\`${required} — ${opt.description || ""}`;
        });
        embed.addFields({ name: "Options", value: optLines.join("\n").slice(0, 1024) });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // Build paginated help
    const pages = buildHelpPages(commandManager, guildId);
    let currentPage = 0;

    const buildEmbed = (pageIndex: number) => {
      const page = pages[pageIndex]!;
      const embed = new EmbedBuilder()
        .setTitle(`📖 ${page.title}`)
        .setColor(0x5865f2)
        .setFooter({ text: `Page ${pageIndex + 1}/${pages.length} • ${commandManager.getAllCommands().size} commands` });

      for (const field of page.fields) {
        embed.addFields(field);
      }

      return embed;
    };

    // If single page, no buttons needed
    if (pages.length <= 1) {
      await interaction.reply({
        embeds: [buildEmbed(0)],
        ephemeral: true,
      });
      return;
    }

    // Register ephemeral button callbacks via ComponentCallbackService
    // so the InteractionHandler can route them properly
    const HELP_TTL = 120; // seconds
    const pageIndicatorId = nanoid(12);

    const navigateTo = async (btnInteraction: import("discord.js").ButtonInteraction | import("discord.js").AnySelectMenuInteraction, newPage: number) => {
      if (btnInteraction.user.id !== interaction.user.id) {
        await btnInteraction.reply({ content: "This isn't your help menu.", ephemeral: true });
        return;
      }
      currentPage = newPage;
      await btnInteraction.update({
        embeds: [buildEmbed(currentPage)],
        components: buildButtons(currentPage),
      });
    };

    const firstId = await componentCallbackService.register(async (i) => navigateTo(i, 0), HELP_TTL);
    const prevId = await componentCallbackService.register(async (i) => navigateTo(i, Math.max(0, currentPage - 1)), HELP_TTL);
    const nextId = await componentCallbackService.register(async (i) => navigateTo(i, Math.min(pages.length - 1, currentPage + 1)), HELP_TTL);
    const lastId = await componentCallbackService.register(async (i) => navigateTo(i, pages.length - 1), HELP_TTL);

    const buildButtons = (pageIndex: number) => {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(firstId)
          .setEmoji("⏮")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex === 0),
        new ButtonBuilder()
          .setCustomId(prevId)
          .setEmoji("◀")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex === 0),
        new ButtonBuilder()
          .setCustomId(pageIndicatorId)
          .setLabel(`${pageIndex + 1}/${pages.length}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(nextId)
          .setEmoji("▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex === pages.length - 1),
        new ButtonBuilder()
          .setCustomId(lastId)
          .setEmoji("⏭")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(pageIndex === pages.length - 1),
      );

      return [row];
    };

    await interaction.reply({
      embeds: [buildEmbed(currentPage)],
      components: buildButtons(currentPage),
      ephemeral: true,
    });
  };
}
