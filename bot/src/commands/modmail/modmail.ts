import {
  ChannelType,
  ForumChannel,
  InteractionContextType,
  SlashCommandBuilder,
  ThreadChannel,
} from "discord.js";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import Modmail from "../../models/Modmail";
import { waitingEmoji } from "../../Bot";
import { ThingGetter } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import { CommandOptions, SlashCommandProps } from "commandkit";
import log from "../../utils/log";
import FetchEnvs from "../../utils/FetchEnvs";
import ModmailConfig from "../../models/ModmailConfig";
import closeModmail from "../../subcommands/modmail/closeModmail";
import banModmail, { banModmailOptions } from "../../subcommands/modmail/banModmail";
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
  .setDMPermission(true);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  // userPermissions: ["ManageMessages"],
};

export async function autocomplete({ interaction, client, handler }: any) {
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

export async function run({ interaction, client, handler }: SlashCommandProps) {
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
      return interaction.reply(`Not implemented yet`);
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
