import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction, EmbedBuilder, ActionRowBuilder, ButtonStyle, Colors, ApplicationCommand, Client } from "discord.js";
import type { CommandHandler } from "../CommandHandler";
import type { LoadedCommand } from "../types/Command";
import { ButtonKit, createSignal, createEffect } from "../ButtonKit";

export interface HelpCommandConfig {
  enabled: boolean;
  showHidden: boolean;
  maxCommandsPerPage: number;
  showCategories: boolean;
  ephemeral: boolean;
  enableSearch: boolean;
}

export interface CategoryInfo {
  name: string;
  displayName: string;
  commands: CommandInfo[];
  hidden: boolean;
}

export interface CommandInfo {
  name: string;
  description: string;
  category: string;
  id?: string;
  subcommands?: SubcommandInfo[];
  isDevOnly: boolean;
  guildOnly: boolean;
}

export interface SubcommandInfo {
  name: string;
  description: string;
}

export class HelpCommand {
  private handler: CommandHandler;
  private config: HelpCommandConfig;
  private client: Client;

  constructor(handler: CommandHandler, client: Client, config?: Partial<HelpCommandConfig>) {
    this.handler = handler;
    this.client = client;
    this.config = {
      enabled: true,
      showHidden: false,
      maxCommandsPerPage: 6,
      showCategories: true,
      ephemeral: true,
      enableSearch: true,
      ...config,
    };
  }

  /**
   * Get the help command as a LoadedCommand object
   */
  getHelpCommand(): LoadedCommand {
    const data = new SlashCommandBuilder()
      .setName("help")
      .setDescription("Get help with commands and categories")
      .addStringOption((option) => option.setName("category").setDescription("Show commands from a specific category").setRequired(false).setAutocomplete(true))
      .addStringOption((option) => option.setName("command").setDescription("Get detailed help for a specific command").setRequired(false).setAutocomplete(true))
      .addBooleanOption((option) => option.setName("show-dev").setDescription("Include development-only commands (if you have access)").setRequired(false));

    return {
      name: "help",
      data: data as SlashCommandBuilder,
      filePath: "builtin/HelpCommand.ts",
      isLegacy: false,
      type: "slash",

      config: {
        devOnly: false,
        deleted: false,
        userPermissions: [],
        botPermissions: ["SendMessages", "EmbedLinks"],
        category: "utility",
      },

      execute: async (interaction: ChatInputCommandInteraction, client: Client, handler: CommandHandler) => {
        await this.handleHelpCommand(interaction);
      },

      autocomplete: async (interaction: AutocompleteInteraction, client: Client, handler: CommandHandler) => {
        await this.handleAutocomplete(interaction);
      },
    } as LoadedCommand;
  }

  /**
   * Handle the help command execution
   */
  private async handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const categoryFilter = interaction.options.getString("category");
    const commandFilter = interaction.options.getString("command");
    const showDev = interaction.options.getBoolean("show-dev") ?? false;

    // For now, we'll just use showDev directly - can be enhanced later with proper dev user checking
    const canSeeDev = showDev;

    await interaction.deferReply({ ephemeral: this.config.ephemeral });

    try {
      // If specific command requested, show command details
      if (commandFilter) {
        await this.showCommandDetails(interaction, commandFilter, canSeeDev);
        return;
      }

      // Get all commands organized by category
      const categories = await this.organizeCommandsByCategory(canSeeDev);

      // If specific category requested, show category commands
      if (categoryFilter) {
        await this.showCategoryCommands(interaction, categoryFilter, categories, canSeeDev);
        return;
      }

      // Show paginated help menu
      await this.showPaginatedHelp(interaction, categories);
    } catch (error) {
      console.error("Error in help command:", error);
      await interaction.editReply({
        embeds: [this.createErrorEmbed("Help Error", "An error occurred while loading help information.")],
      });
    }
  }

  /**
   * Handle autocomplete for help command
   */
  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);

    try {
      if (focusedOption.name === "category") {
        const categories = await this.getAvailableCategories();
        const filtered = categories
          .filter((cat) => cat.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25)
          .map((cat) => ({ name: cat.displayName, value: cat.name }));

        await interaction.respond(filtered);
      } else if (focusedOption.name === "command") {
        const commands = await this.getAllCommands();
        const filtered = commands
          .filter((cmd) => cmd.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25)
          .map((cmd) => ({ name: `${cmd.name} - ${cmd.description.slice(0, 80)}`, value: cmd.name }));

        await interaction.respond(filtered);
      }
    } catch (error) {
      console.error("Error in help autocomplete:", error);
      await interaction.respond([]);
    }
  }

  /**
   * Show details for a specific command
   */
  private async showCommandDetails(interaction: ChatInputCommandInteraction, commandName: string, showDev: boolean): Promise<void> {
    const commands = this.handler.getCommands();
    const command = commands.get(commandName);

    if (!command) {
      await interaction.editReply({
        embeds: [this.createErrorEmbed("Command Not Found", `No command named \`${commandName}\` was found.`)],
      });
      return;
    }

    // Check if user can see dev-only commands
    if (command.config.devOnly && !showDev) {
      await interaction.editReply({
        embeds: [this.createErrorEmbed("Command Not Found", `No command named \`${commandName}\` was found.`)],
      });
      return;
    }

    // Get Discord application command info for slash command mentions
    let applicationCommand: ApplicationCommand | undefined;
    try {
      const appCommands = await this.client.application!.commands.fetch();
      applicationCommand = appCommands.find((cmd) => cmd.name === commandName);
    } catch (error) {
      console.error("Failed to fetch application commands:", error);
    }

    const embed = new EmbedBuilder().setTitle(`📖 Command: ${commandName}`).setColor(Colors.Blue).setTimestamp();

    // Get description safely
    const description = this.getCommandDescription(command);

    // Basic info
    embed.addFields([
      { name: "Description", value: description || "No description provided", inline: false },
      { name: "Category", value: this.formatCategory(command.config.category || "other"), inline: true },
      { name: "Usage Context", value: this.getCommandContext(command), inline: true },
    ]);

    // Show command mention if available
    if (applicationCommand) {
      embed.addFields([{ name: "Usage", value: `</${commandName}:${applicationCommand.id}>`, inline: false }]);
    }

    // Show permissions if any
    const permissions = this.getPermissionInfo(command);
    if (permissions) {
      embed.addFields([{ name: "Permissions Required", value: permissions, inline: false }]);
    }

    // Show subcommands if any
    const subcommands = this.getSubcommandInfo(applicationCommand);
    if (subcommands.length > 0) {
      const subcommandText = subcommands.map((sub) => `• **${sub.name}**: ${sub.description}`).join("\n");

      embed.addFields([{ name: "Subcommands", value: subcommandText.slice(0, 1024), inline: false }]);
    }

    // Show dev-only badge
    if (command.config.devOnly) {
      embed.setFooter({ text: "🔧 Development Only Command" });
    }

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Get command description safely
   */
  private getCommandDescription(command: LoadedCommand): string {
    if (command.data instanceof SlashCommandBuilder) {
      const json = command.data.toJSON();
      return json.description || "No description provided";
    }
    return "No description provided";
  }

  /**
   * Show commands for a specific category
   */
  private async showCategoryCommands(interaction: ChatInputCommandInteraction, categoryName: string, categories: Map<string, CategoryInfo>, showDev: boolean): Promise<void> {
    const category = categories.get(categoryName.toLowerCase());

    if (!category) {
      await interaction.editReply({
        embeds: [this.createErrorEmbed("Category Not Found", `No category named \`${categoryName}\` was found.`)],
      });
      return;
    }

    const commands = category.commands.filter((cmd) => showDev || !cmd.isDevOnly);

    if (commands.length === 0) {
      await interaction.editReply({
        embeds: [this.createErrorEmbed("No Commands", `No available commands found in the \`${category.displayName}\` category.`)],
      });
      return;
    }

    // Create paginated view for category
    const pages = this.createCategoryPages(category, commands);

    if (pages.length === 1) {
      await interaction.editReply({ embeds: [pages[0]] });
      return;
    }

    await this.showPaginatedEmbeds(interaction, pages, `${category.displayName} Commands`);
  }

  /**
   * Show the main paginated help menu
   */
  private async showPaginatedHelp(interaction: ChatInputCommandInteraction, categories: Map<string, CategoryInfo>): Promise<void> {
    const pages = this.createOverviewPages(categories);

    if (pages.length === 1) {
      await interaction.editReply({ embeds: [pages[0]] });
      return;
    }

    await this.showPaginatedEmbeds(interaction, pages, "Help Menu");
  }

  /**
   * Show paginated embeds with ButtonKit
   */
  private async showPaginatedEmbeds(interaction: ChatInputCommandInteraction, pages: EmbedBuilder[], title: string): Promise<void> {
    const [currentPage, setCurrentPage, disposeSignal] = createSignal(0);

    // Create buttons with unique IDs
    const interactionId = interaction.id;
    const prevButton = new ButtonKit().setEmoji("⬅️").setStyle(ButtonStyle.Primary).setCustomId(`help-prev-${interactionId}`).setDisabled(true);

    const homeButton = new ButtonKit().setEmoji("🏠").setStyle(ButtonStyle.Secondary).setCustomId(`help-home-${interactionId}`).setDisabled(true);

    const nextButton = new ButtonKit()
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`help-next-${interactionId}`)
      .setDisabled(pages.length <= 1);

    const row = new ActionRowBuilder<ButtonKit>().addComponents(prevButton, homeButton, nextButton);

    // Send initial message
    const message = await interaction.editReply({
      embeds: [pages[0].setFooter({ text: `${title} • Page 1/${pages.length}` })],
      components: [row],
    });

    // Update embed when page changes
    createEffect(() => {
      const page = currentPage();
      const embed = pages[page].setFooter({ text: `${title} • Page ${page + 1}/${pages.length}` });

      // Update button states
      prevButton.setDisabled(page === 0);
      homeButton.setDisabled(page === 0);
      nextButton.setDisabled(page === pages.length - 1);

      if (message && "edit" in message) {
        message
          .edit({
            embeds: [embed],
            components: [row],
          })
          .catch(console.error);
      }
    });

    // Button handlers
    prevButton.onClick(
      (btnInteraction) => {
        setCurrentPage((prev) => Math.max(0, prev - 1));
        btnInteraction.deferUpdate().catch(console.error);
      },
      { message }
    );

    homeButton.onClick(
      (btnInteraction) => {
        setCurrentPage(0);
        btnInteraction.deferUpdate().catch(console.error);
      },
      { message }
    );

    nextButton.onClick(
      (btnInteraction) => {
        setCurrentPage((prev) => Math.min(pages.length - 1, prev + 1));
        btnInteraction.deferUpdate().catch(console.error);
      },
      { message }
    );

    // Auto-cleanup after 15 minutes
    setTimeout(() => {
      disposeSignal();
    }, 900000);
  }

  /**
   * Organize commands by category
   */
  private async organizeCommandsByCategory(includeDevOnly: boolean = false): Promise<Map<string, CategoryInfo>> {
    const categories = new Map<string, CategoryInfo>();

    // Get Discord application commands for IDs
    let applicationCommands: Map<string, ApplicationCommand> = new Map();
    try {
      const appCommands = await this.client.application!.commands.fetch();
      appCommands.forEach((cmd) => applicationCommands.set(cmd.name, cmd));
    } catch (error) {
      console.error("Failed to fetch application commands:", error);
    }

    const commands = this.handler.getCommands();
    for (const [name, command] of commands) {
      // Skip deleted commands
      if (command.config.deleted) continue;

      // Skip dev-only commands if not requested
      if (command.config.devOnly && !includeDevOnly) continue;

      const categoryName = (command.config.category || "other").toLowerCase();
      const appCommand = applicationCommands.get(name);

      if (!categories.has(categoryName)) {
        categories.set(categoryName, {
          name: categoryName,
          displayName: this.formatCategory(categoryName),
          commands: [],
          hidden: false,
        });
      }

      const category = categories.get(categoryName)!;
      const description = this.getCommandDescription(command);

      category.commands.push({
        name,
        description: description || "No description",
        category: categoryName,
        id: appCommand?.id,
        subcommands: this.getSubcommandInfo(appCommand),
        isDevOnly: command.config.devOnly || false,
        guildOnly: this.isGuildOnly(command),
      });
    }

    // Sort commands within categories
    categories.forEach((category) => {
      category.commands.sort((a, b) => a.name.localeCompare(b.name));
    });

    return categories;
  }

  /**
   * Create overview pages showing all categories
   */
  private createOverviewPages(categories: Map<string, CategoryInfo>): EmbedBuilder[] {
    const pages: EmbedBuilder[] = [];
    const categoriesArray = Array.from(categories.values())
      .filter((cat) => cat.commands.length > 0)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const categoriesPerPage = 6;

    for (let i = 0; i < categoriesArray.length; i += categoriesPerPage) {
      const pageCategories = categoriesArray.slice(i, i + categoriesPerPage);

      const embed = new EmbedBuilder()
        .setTitle("📚 Help Menu")
        .setDescription("Use `/help category:<category>` to see commands in a specific category, or `/help command:<command>` for detailed command information.")
        .setColor(Colors.Blue)
        .setTimestamp();

      pageCategories.forEach((category) => {
        const commandCount = category.commands.length;
        const commandList = category.commands
          .slice(0, 3)
          .map((cmd) => `\`${cmd.name}\``)
          .join(", ");

        const more = commandCount > 3 ? ` and ${commandCount - 3} more...` : "";

        embed.addFields([
          {
            name: `${category.displayName} (${commandCount} command${commandCount === 1 ? "" : "s"})`,
            value: commandList + more,
            inline: true,
          },
        ]);
      });

      pages.push(embed);
    }

    return pages.length > 0 ? pages : [this.createErrorEmbed("No Commands", "No commands are currently available.")];
  }

  /**
   * Create pages for a specific category
   */
  private createCategoryPages(category: CategoryInfo, commands: CommandInfo[]): EmbedBuilder[] {
    const pages: EmbedBuilder[] = [];
    const commandsPerPage = this.config.maxCommandsPerPage;

    for (let i = 0; i < commands.length; i += commandsPerPage) {
      const pageCommands = commands.slice(i, i + commandsPerPage);

      const embed = new EmbedBuilder().setTitle(`📂 ${category.displayName} Commands`).setColor(Colors.Blue).setTimestamp();

      pageCommands.forEach((command) => {
        const commandMention = command.id ? `</${command.name}:${command.id}>` : `\`/${command.name}\``;
        const devBadge = command.isDevOnly ? " 🔧" : "";
        const guildBadge = command.guildOnly ? " 🏠" : "";

        embed.addFields([
          {
            name: `${commandMention}${devBadge}${guildBadge}`,
            value: command.description.slice(0, 200),
            inline: false,
          },
        ]);
      });

      if (embed.data.fields && embed.data.fields.length === 0) {
        embed.setDescription("No commands available in this category.");
      }

      pages.push(embed);
    }

    return pages.length > 0 ? pages : [this.createErrorEmbed("No Commands", "No commands found in this category.")];
  }

  /**
   * Get available categories for autocomplete
   */
  private async getAvailableCategories(): Promise<CategoryInfo[]> {
    const categories = await this.organizeCommandsByCategory(false);
    return Array.from(categories.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  /**
   * Get all available commands
   */
  private async getAllCommands(): Promise<CommandInfo[]> {
    const commands: CommandInfo[] = [];

    const handlerCommands = this.handler.getCommands();
    for (const [name, command] of handlerCommands) {
      if (command.config.deleted) continue;

      const description = this.getCommandDescription(command);

      commands.push({
        name,
        description: description || "No description",
        category: command.config.category || "other",
        isDevOnly: command.config.devOnly || false,
        guildOnly: this.isGuildOnly(command),
      });
    }

    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get subcommand information from application command
   */
  private getSubcommandInfo(applicationCommand?: ApplicationCommand): SubcommandInfo[] {
    if (!applicationCommand?.options) return [];

    return applicationCommand.options
      .filter((option) => option.type === 1) // Subcommand type
      .map((option) => ({
        name: option.name,
        description: option.description,
      }));
  }

  /**
   * Format category name for display
   */
  private formatCategory(category: string): string {
    return category
      .split(/[-_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  /**
   * Check if command is guild-only
   */
  private isGuildOnly(command: LoadedCommand): boolean {
    if (command.data instanceof SlashCommandBuilder) {
      const json = command.data.toJSON();
      const dmPermission = json.dm_permission ?? true; // Default to true if undefined
      return dmPermission === false || (json.contexts && !json.contexts.includes(1) && !json.contexts.includes(2)) || false;
    }
    return false;
  }

  /**
   * Get command context description
   */
  private getCommandContext(command: LoadedCommand): string {
    const guildOnly = this.isGuildOnly(command);
    const devOnly = command.config.devOnly;

    let context = guildOnly ? "Guild Only" : "Guild & DM";
    if (devOnly) context += " • Dev Only";

    return context;
  }

  /**
   * Get permission information for a command
   */
  private getPermissionInfo(command: LoadedCommand): string | null {
    const userPerms = command.config.userPermissions || [];
    const botPerms = command.config.botPermissions || [];

    if (userPerms.length === 0 && botPerms.length === 0) return null;

    let info = "";
    if (userPerms.length > 0) {
      info += `**User:** ${userPerms.map((p) => `\`${p}\``).join(", ")}`;
    }
    if (botPerms.length > 0) {
      if (info) info += "\n";
      info += `**Bot:** ${botPerms.map((p) => `\`${p}\``).join(", ")}`;
    }

    return info;
  }

  /**
   * Create error embed
   */
  private createErrorEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder().setTitle(`❌ ${title}`).setDescription(description).setColor(Colors.Red).setTimestamp();
  }
}
