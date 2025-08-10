import {
  ChannelType,
  ForumChannel,
  InteractionContextType,
  SlashCommandBuilder,
  ThreadChannel,
} from "discord.js";
import {
  LegacyCommandOptions,
  LegacySlashCommandProps,
  LegacyAutocompleteProps,
} from "@heimdall/command-handler";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import Modmail from "../../models/Modmail";
import { waitingEmoji } from "../../Bot";
import { ThingGetter } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import log from "../../utils/log";
import FetchEnvs from "../../utils/FetchEnvs";
import ModmailConfig from "../../models/ModmailConfig";
import closeModmail from "../../subcommands/modmail/closeModmail";
import banModmail, { banModmailOptions } from "../../subcommands/modmail/banModmail";
import unbanModmail, { unbanModmailOptions } from "../../subcommands/modmail/unbanModmail";
import canRunCommand from "../../utils/canRunCommand";
import sendbuttonModmail, {
  sendModmailButtonOptions,
} from "../../subcommands/modmail/sendbuttonModmail";
import setupModmail, { setupModmailOptions } from "../../subcommands/modmail/setupModmail";
import openModmail, { openModmailOptions } from "../../subcommands/modmail/openModmail";
import neverautocloseModmail from "../../subcommands/modmail/neverautocloseModmail";
import enableautocloseModmail from "../../subcommands/modmail/enableautocloseModmail";
import markresolvedModmail from "../../subcommands/modmail/markresolvedModmail";

const env = FetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("modmail")
  .setDescription("The main modmail command")
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("close")
      .setDescription("Close a modmail thread")
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("The reason for closing the modmail thread")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("ban")
      .setDescription("Ban a user from using modmail")
      .addStringOption((option) =>
        option.setName("user").setDescription("The user to ban").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("The reason for the ban").setRequired(true)
      )
      .addIntegerOption((option) =>
        option.setName("duration").setDescription("The duration of the ban").setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName("permanent")
          .setDescription("Whether the ban is permanent")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("unban")
      .setDescription("Unban a user from using modmail")
      .addStringOption((option) =>
        option.setName("user").setDescription("The user to unban").setRequired(true)
      )
      .addStringOption((option) =>
        option.setName("reason").setDescription("The reason for the unban").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("sendbutton")
      .setDescription("Send the modmail button in a channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel to send the button in")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("setup")
      .setDescription("Setup the modmail system")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The forum channel to use for modmail threads")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildForum)
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("The role to ping when a new modmail is created")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("description")
          .setDescription(
            "The description for this server in the modmail system (60 characters max)"
          )
          .setRequired(false)
      )
      .addBooleanOption((option) =>
        option
          .setName("disable-default-category")
          .setDescription("Disable the default category - users must select a custom category")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("open")
      .setDescription("Open a modmail thread")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to open a modmail thread with")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("The reason for opening the modmail thread")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("neverautoclose")
      .setDescription(
        "Permanently disable auto-closing for this modmail thread (Manage Server required)"
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("enableautoclose")
      .setDescription("Re-enable auto-closing for this modmail thread (Manage Server required)")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("markresolved")
      .setDescription("Mark this modmail thread as resolved with user response options")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("migrate")
      .setDescription("Migrate existing modmail setup to use categories (Administrator only)")
  )
  .addSubcommandGroup((group) =>
    group
      .setName("category")
      .setDescription("Manage modmail categories")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("create")
          .setDescription("Create a new modmail category")
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Category name")
              .setRequired(true)
              .setMaxLength(50)
          )
          .addChannelOption((option) =>
            option
              .setName("forum-channel")
              .setDescription("Forum channel for this category")
              .setRequired(true)
              .addChannelTypes(ChannelType.GuildForum)
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("Category description")
              .setRequired(false)
              .setMaxLength(200)
          )
          .addStringOption((option) =>
            option
              .setName("priority")
              .setDescription("Category priority level")
              .setRequired(false)
              .setChoices(
                { name: "Low", value: "1" },
                { name: "Medium", value: "2" },
                { name: "High", value: "3" },
                { name: "Urgent", value: "4" }
              )
          )
          .addStringOption((option) =>
            option.setName("emoji").setDescription("Category emoji").setRequired(false)
          )
          .addRoleOption((option) =>
            option
              .setName("staff-role")
              .setDescription(
                "Staff role for this category (optional, uses main staff role if not set)"
              )
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("list").setDescription("List all modmail categories")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("edit")
          .setDescription("Edit an existing modmail category")
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category to edit")
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("New category name")
              .setRequired(false)
              .setMaxLength(50)
          )
          .addStringOption((option) =>
            option
              .setName("description")
              .setDescription("New category description")
              .setRequired(false)
              .setMaxLength(200)
          )
          .addChannelOption((option) =>
            option
              .setName("forum-channel")
              .setDescription("New forum channel for this category")
              .setRequired(false)
              .addChannelTypes(ChannelType.GuildForum)
          )
          .addStringOption((option) =>
            option
              .setName("priority")
              .setDescription("New category priority level")
              .setRequired(false)
              .setChoices(
                { name: "Low", value: "1" },
                { name: "Medium", value: "2" },
                { name: "High", value: "3" },
                { name: "Urgent", value: "4" }
              )
          )
          .addStringOption((option) =>
            option.setName("emoji").setDescription("New category emoji").setRequired(false)
          )
          .addRoleOption((option) =>
            option
              .setName("staff-role")
              .setDescription("New staff role for this category (optional)")
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("delete")
          .setDescription("Delete a modmail category")
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category to delete")
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addBooleanOption((option) =>
            option
              .setName("force")
              .setDescription("Force delete even if category has active tickets")
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("form")
          .setDescription("Manage form fields for a category")
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category to manage forms for")
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName("ai")
      .setDescription("Configure AI responses for modmail")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("enable")
          .setDescription("Enable AI responses for a category or globally")
          .addStringOption((option) =>
            option
              .setName("scope")
              .setDescription("Where to enable AI")
              .setRequired(true)
              .addChoices(
                { name: "Global (all categories)", value: "global" },
                { name: "Specific Category", value: "category" }
              )
          )
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category ID (required if scope is 'category')")
              .setRequired(false)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("disable")
          .setDescription("Disable AI responses for a category or globally")
          .addStringOption((option) =>
            option
              .setName("scope")
              .setDescription("Where to disable AI")
              .setRequired(true)
              .addChoices(
                { name: "Global (all categories)", value: "global" },
                { name: "Specific Category", value: "category" }
              )
          )
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category ID (required if scope is 'category')")
              .setRequired(false)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("configure")
          .setDescription("Configure AI settings for a category or globally")
          .addStringOption((option) =>
            option
              .setName("scope")
              .setDescription("What to configure")
              .setRequired(true)
              .addChoices(
                { name: "Global (all categories)", value: "global" },
                { name: "Specific Category", value: "category" }
              )
          )
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category ID (required if scope is 'category')")
              .setRequired(false)
              .setAutocomplete(true)
          )
          .addStringOption((option) =>
            option
              .setName("prompt")
              .setDescription("Custom system prompt for AI responses")
              .setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("documentation-url")
              .setDescription("URL to text documentation (Pastebin raw, GitHub raw, etc.)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("use-global-docs")
              .setDescription("Whether to include global documentation (category scope only)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("prevent-modmail")
              .setDescription(
                "AI answers first, user clicks button to continue with modmail if needed"
              )
              .setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("style")
              .setDescription("AI response style")
              .setRequired(false)
              .addChoices(
                { name: "Helpful", value: "helpful" },
                { name: "Formal", value: "formal" },
                { name: "Casual", value: "casual" }
              )
          )
          .addIntegerOption((option) =>
            option
              .setName("max-tokens")
              .setDescription("Maximum tokens for AI response (50-2000)")
              .setRequired(false)
              .setMinValue(50)
              .setMaxValue(2000)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("View current AI configuration")
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName("docs")
      .setDescription("Manage AI documentation")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("import")
          .setDescription("Import documentation from URL")
          .addStringOption((option) =>
            option
              .setName("scope")
              .setDescription("Where to import documentation")
              .setRequired(true)
              .addChoices(
                { name: "Global (all categories)", value: "global" },
                { name: "Specific Category", value: "category" }
              )
          )
          .addStringOption((option) =>
            option
              .setName("url")
              .setDescription("URL to documentation (Pastebin raw, GitHub raw, etc.)")
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category ID (required if scope is 'category')")
              .setRequired(false)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("export")
          .setDescription("Export documentation as downloadable file")
          .addStringOption((option) =>
            option
              .setName("scope")
              .setDescription("What to export")
              .setRequired(true)
              .addChoices(
                { name: "All Documentation", value: "all" },
                { name: "Global Only", value: "global" },
                { name: "Specific Category", value: "category" }
              )
          )
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category ID (required if scope is 'category')")
              .setRequired(false)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("upload")
          .setDescription("Upload documentation from text file")
          .addStringOption((option) =>
            option
              .setName("scope")
              .setDescription("Where to upload documentation")
              .setRequired(true)
              .addChoices(
                { name: "Global (all categories)", value: "global" },
                { name: "Specific Category", value: "category" }
              )
          )
          .addAttachmentOption((option) =>
            option
              .setName("file")
              .setDescription("Text file containing documentation")
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category ID (required if scope is 'category')")
              .setRequired(false)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("clear")
          .setDescription("Clear documentation")
          .addStringOption((option) =>
            option
              .setName("scope")
              .setDescription("What to clear")
              .setRequired(true)
              .addChoices(
                { name: "Global Documentation", value: "global" },
                { name: "Category Documentation", value: "category" }
              )
          )
          .addBooleanOption((option) =>
            option
              .setName("confirm")
              .setDescription("Confirm that you want to delete the documentation")
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("category")
              .setDescription("Category ID (required for category scopes)")
              .setRequired(false)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("status").setDescription("View documentation status")
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName("debug")
      .setDescription("Debug modmail system issues (Administrator only)")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("run-scheduler")
          .setDescription("Manually run the modmail inactivity scheduler")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("check-resolved")
          .setDescription("Check all resolved modmails that should be auto-closed")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("check-ticket")
          .setDescription("Check a specific ticket's auto-close status")
          .addIntegerOption((option) =>
            option
              .setName("ticket-number")
              .setDescription("The ticket number to check")
              .setRequired(true)
          )
      )
  )
  .setDMPermission(true);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: false,
  // userPermissions: ["ManageMessages"],
};

export async function autocomplete({ interaction, client, handler }: LegacyAutocompleteProps) {
  const focusedOption = interaction.options.getFocused(true);

  if (focusedOption.name === "category") {
    try {
      const db = new Database();
      const config = await db.findOne(ModmailConfig, { guildId: interaction.guildId });

      if (!config) {
        return interaction.respond([]);
      }

      const categories = config.categories || [];
      const choices = categories
        .filter(
          (cat) =>
            cat.isActive && cat.name.toLowerCase().includes(focusedOption.value.toLowerCase())
        )
        .slice(0, 25) // Discord limit
        .map((cat) => ({
          name: `${cat.emoji || "📁"} ${cat.name}`,
          value: cat.id,
        }));

      return interaction.respond(choices);
    } catch (error) {
      log.error("Error in category autocomplete:", error);
      return interaction.respond([]);
    }
  }
}

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
  const subcommand = interaction.options.getSubcommand();
  const subcommandGroup = interaction.options.getSubcommandGroup();

  // Handle category subcommands - Phase 4 implementation
  if (subcommandGroup === "category") {
    // Import dynamically to avoid module resolution issues
    switch (subcommand) {
      case "create":
        try {
          const { default: createCategory, createCategoryOptions } = await import(
            "../../subcommands/modmail/category/createCategory"
          );
          const createCategoryCheck = await canRunCommand(
            { interaction, client, handler },
            createCategoryOptions
          );
          if (createCategoryCheck !== false) return createCategoryCheck;
          return createCategory({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading createCategory:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the category creation command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "list":
        try {
          const { default: listCategories, listCategoriesOptions } = await import(
            "../../subcommands/modmail/category/listCategories"
          );
          const listCategoriesCheck = await canRunCommand(
            { interaction, client, handler },
            listCategoriesOptions
          );
          if (listCategoriesCheck !== false) return listCategoriesCheck;
          return listCategories({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading listCategories:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the category list command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "edit":
        try {
          const { default: editCategory, editCategoryOptions } = await import(
            "../../subcommands/modmail/category/editCategory"
          );
          const editCategoryCheck = await canRunCommand(
            { interaction, client, handler },
            editCategoryOptions
          );
          if (editCategoryCheck !== false) return editCategoryCheck;
          return editCategory({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading editCategory:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the category edit command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "form":
        try {
          const { default: manageForm, manageFormOptions } = await import(
            "../../subcommands/modmail/category/manageForm"
          );
          const manageFormCheck = await canRunCommand(
            { interaction, client, handler },
            manageFormOptions
          );
          if (manageFormCheck !== false) return manageFormCheck;
          return manageForm({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading manageForm:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the form management command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "delete":
        try {
          const { default: deleteCategory, deleteCategoryOptions } = await import(
            "../../subcommands/modmail/category/deleteCategory"
          );
          const deleteCategoryCheck = await canRunCommand(
            { interaction, client, handler },
            deleteCategoryOptions
          );
          if (deleteCategoryCheck !== false) return deleteCategoryCheck;
          return deleteCategory({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading deleteCategory:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the category deletion command."
              ),
            ],
            ephemeral: true,
          });
        }
      default:
        return interaction.reply({
          embeds: [ModmailEmbeds.subcommandNotFound(client)],
          ephemeral: true,
        });
    }
    return;
  }

  // Handle AI subcommands
  if (subcommandGroup === "ai") {
    switch (subcommand) {
      case "enable":
        try {
          const { default: enableAI, enableAIOptions } = await import(
            "../../subcommands/modmail/ai/enableAI"
          );
          const enableAICheck = await canRunCommand(
            { interaction, client, handler },
            enableAIOptions
          );
          if (enableAICheck !== false) return enableAICheck;
          return enableAI({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading enableAI:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(client, "Command Error", "Failed to load the AI enable command."),
            ],
            ephemeral: true,
          });
        }
      case "disable":
        try {
          const { default: disableAI, disableAIOptions } = await import(
            "../../subcommands/modmail/ai/disableAI"
          );
          const disableAICheck = await canRunCommand(
            { interaction, client, handler },
            disableAIOptions
          );
          if (disableAICheck !== false) return disableAICheck;
          return disableAI({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading disableAI:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the AI disable command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "configure":
        try {
          const { default: configureAI, configureAIOptions } = await import(
            "../../subcommands/modmail/ai/configureAI"
          );
          const configureAICheck = await canRunCommand(
            { interaction, client, handler },
            configureAIOptions
          );
          if (configureAICheck !== false) return configureAICheck;
          return configureAI({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading configureAI:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the AI configure command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "status":
        try {
          const { default: statusAI, statusAIOptions } = await import(
            "../../subcommands/modmail/ai/statusAI"
          );
          const statusAICheck = await canRunCommand(
            { interaction, client, handler },
            statusAIOptions
          );
          if (statusAICheck !== false) return statusAICheck;
          return statusAI({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading statusAI:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(client, "Command Error", "Failed to load the AI status command."),
            ],
            ephemeral: true,
          });
        }
    }
    return;
  }

  // Handle docs subcommands
  if (subcommandGroup === "docs") {
    switch (subcommand) {
      case "import":
        try {
          const { default: importDocs, importDocsOptions } = await import(
            "../../subcommands/modmail/docs/importDocs"
          );
          const importDocsCheck = await canRunCommand(
            { interaction, client, handler },
            importDocsOptions
          );
          if (importDocsCheck !== false) return importDocsCheck;
          return importDocs({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading importDocs:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the docs import command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "export":
        try {
          const { default: exportDocs, exportDocsOptions } = await import(
            "../../subcommands/modmail/docs/exportDocs"
          );
          const exportDocsCheck = await canRunCommand(
            { interaction, client, handler },
            exportDocsOptions
          );
          if (exportDocsCheck !== false) return exportDocsCheck;
          return exportDocs({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading exportDocs:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the docs export command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "upload":
        try {
          const { default: uploadDocs, uploadDocsOptions } = await import(
            "../../subcommands/modmail/docs/uploadDocs"
          );
          const uploadDocsCheck = await canRunCommand(
            { interaction, client, handler },
            uploadDocsOptions
          );
          if (uploadDocsCheck !== false) return uploadDocsCheck;
          return uploadDocs({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading uploadDocs:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the docs upload command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "clear":
        try {
          const { default: clearDocs, clearDocsOptions } = await import(
            "../../subcommands/modmail/docs/clearDocs"
          );
          const clearDocsCheck = await canRunCommand(
            { interaction, client, handler },
            clearDocsOptions
          );
          if (clearDocsCheck !== false) return clearDocsCheck;
          return clearDocs({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading clearDocs:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the docs clear command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "status":
        try {
          const { default: statusDocs, statusDocsOptions } = await import(
            "../../subcommands/modmail/docs/statusDocs"
          );
          const statusDocsCheck = await canRunCommand(
            { interaction, client, handler },
            statusDocsOptions
          );
          if (statusDocsCheck !== false) return statusDocsCheck;
          return statusDocs({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading statusDocs:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the docs status command."
              ),
            ],
            ephemeral: true,
          });
        }
    }
    return;
  }

  // Handle debug subcommands - Administrator only
  if (subcommandGroup === "debug") {
    // Check for administrator permissions
    if (!interaction.memberPermissions?.has("Administrator")) {
      return interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Permission Denied",
            "You need Administrator permissions to use debug commands."
          ),
        ],
        ephemeral: true,
      });
    }

    switch (subcommand) {
      case "run-scheduler":
        try {
          const { default: runScheduler, runSchedulerOptions } = await import(
            "../../subcommands/modmail/debug/runScheduler"
          );
          const runSchedulerCheck = await canRunCommand(
            { interaction, client, handler },
            runSchedulerOptions
          );
          if (runSchedulerCheck !== false) return runSchedulerCheck;
          return runScheduler({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading runScheduler:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the scheduler debug command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "check-resolved":
        try {
          const { default: checkResolved, checkResolvedOptions } = await import(
            "../../subcommands/modmail/debug/checkResolved"
          );
          const checkResolvedCheck = await canRunCommand(
            { interaction, client, handler },
            checkResolvedOptions
          );
          if (checkResolvedCheck !== false) return checkResolvedCheck;
          return checkResolved({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading checkResolved:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the resolved tickets debug command."
              ),
            ],
            ephemeral: true,
          });
        }
      case "check-ticket":
        try {
          const { default: checkTicket, checkTicketOptions } = await import(
            "../../subcommands/modmail/debug/checkTicket"
          );
          const checkTicketCheck = await canRunCommand(
            { interaction, client, handler },
            checkTicketOptions
          );
          if (checkTicketCheck !== false) return checkTicketCheck;
          return checkTicket({ interaction, client, handler });
        } catch (error) {
          log.error("Error loading checkTicket:", error);
          return interaction.reply({
            embeds: [
              ModmailEmbeds.error(
                client,
                "Command Error",
                "Failed to load the ticket debug command."
              ),
            ],
            ephemeral: true,
          });
        }
      default:
        return interaction.reply({
          embeds: [ModmailEmbeds.subcommandNotFound(client)],
          ephemeral: true,
        });
    }
    return;
  }

  // Handle regular subcommands
  switch (subcommand) {
    case "close":
      closeModmail({ interaction, client, handler });
      break;
    case "ban":
      const banCheck = await canRunCommand({ interaction, client, handler }, banModmailOptions);
      if (banCheck !== false) return banCheck;
      banModmail({ interaction, client, handler });
      break;
    case "unban":
      const unbanCheck = await canRunCommand({ interaction, client, handler }, unbanModmailOptions);
      if (unbanCheck !== false) return unbanCheck;
      unbanModmail({ interaction, client, handler });
      break;
    case "sendbutton":
      const sendButtonCheck = await canRunCommand(
        { interaction, client, handler },
        sendModmailButtonOptions
      );
      if (sendButtonCheck !== false) return sendButtonCheck;
      sendbuttonModmail({ interaction, client, handler });
      break;
    case "setup":
      const setupModmailCheck = await canRunCommand(
        { interaction, client, handler },
        setupModmailOptions
      );
      if (setupModmailCheck !== false) return setupModmailCheck;
      setupModmail({ interaction, client, handler });
      break;
    case "open":
      const openModmailCheck = await canRunCommand(
        { interaction, client, handler },
        openModmailOptions
      );
      if (openModmailCheck !== false) return openModmailCheck;
      openModmail({ interaction, client, handler });
      break;
    case "neverautoclose":
      neverautocloseModmail({ interaction, client, handler });
      break;
    case "enableautoclose":
      enableautocloseModmail({ interaction, client, handler });
      break;
    case "markresolved":
      markresolvedModmail({ interaction, client, handler });
      break;
    case "migrate":
      const migrateCheck = await canRunCommand(
        { interaction, client, handler },
        (
          await import("../../subcommands/modmail/migrateCategories")
        ).migrateCategoriesOptions
      );
      if (migrateCheck !== false) return migrateCheck;
      const { default: migrateCategories } = await import(
        "../../subcommands/modmail/migrateCategories"
      );
      migrateCategories({ interaction, client, handler });
      break;
    default:
      return interaction.reply({
        embeds: [ModmailEmbeds.subcommandNotFound(client)],
        ephemeral: true,
      });
  }
}
