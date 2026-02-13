/**
 * /logging command — Configure server logging for messages, users, and moderation
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("logging")
  .setDescription("Configure logging for your server")
  .addSubcommand((sub) =>
    sub
      .setName("setup")
      .setDescription("Setup logging for a category")
      .addStringOption((opt) =>
        opt
          .setName("category")
          .setDescription("Category to enable logging for")
          .setRequired(true)
          .addChoices(
            { name: "Messages (edits, deletes, bulk deletes)", value: "messages" },
            { name: "Users (profile changes, member updates)", value: "users" },
            { name: "Moderation (bans, unbans, timeouts)", value: "moderation" },
          ),
      )
      .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to send logs to").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("disable")
      .setDescription("Disable logging for a category")
      .addStringOption((opt) =>
        opt
          .setName("category")
          .setDescription("Category to disable logging for")
          .setRequired(true)
          .addChoices({ name: "Messages", value: "messages" }, { name: "Users", value: "users" }, { name: "Moderation", value: "moderation" }, { name: "All Categories", value: "all" }),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("view")
      .setDescription("View logging configuration")
      .addStringOption((opt) =>
        opt
          .setName("category")
          .setDescription("Specific category to view (optional)")
          .addChoices({ name: "Messages", value: "messages" }, { name: "Users", value: "users" }, { name: "Moderation", value: "moderation" }),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("toggle")
      .setDescription("Toggle specific subcategories")
      .addStringOption((opt) => opt.setName("category").setDescription("Category containing the subcategory").setRequired(true).setAutocomplete(true))
      .addStringOption((opt) => opt.setName("subcategory").setDescription("Subcategory to toggle").setRequired(true).setAutocomplete(true))
      .addBooleanOption((opt) => opt.setName("enabled").setDescription("Enable or disable the subcategory").setRequired(true)),
  );

export const config = {
  allowInDMs: false,
};

// Execution handled by subcommands/logging/index.ts
// Autocomplete handled by _autocomplete.ts
export { autocomplete } from "./_autocomplete.js";
