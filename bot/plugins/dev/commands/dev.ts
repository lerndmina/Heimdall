/**
 * /dev command — Owner-only developer utilities
 *
 * Subcommands:
 * - mongo-import — Upload a MongoDB JSON export into a database/collection
 */

import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("dev")
  .setDescription("Developer utilities (owner-only)")
  .addSubcommand((sub) =>
    sub
      .setName("mongo-import")
      .setDescription("Import a MongoDB JSON export into a database collection")
      .addAttachmentOption((opt) => opt.setName("file").setDescription("JSON file to import (array of documents or newline-delimited JSON)").setRequired(true))
      .addStringOption((opt) => opt.setName("database").setDescription("Target database name").setRequired(true))
      .addStringOption((opt) => opt.setName("collection").setDescription("Target collection name").setRequired(true))
      .addBooleanOption((opt) => opt.setName("drop").setDescription("Drop the collection before importing (default: false)")),
  )
  .addSubcommand((sub) => sub.setName("activity").setDescription("Manage the bot's activity and online status"));

export const config = {
  allowInDMs: true,
  pluginName: "dev",
};

export { execute } from "../subcommands/dev/index.js";
