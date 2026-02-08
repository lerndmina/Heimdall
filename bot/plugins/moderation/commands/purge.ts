/**
 * /purge count|time — Bulk delete messages with filters.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";

export const data = new SlashCommandBuilder()
  .setName("purge")
  .setDescription("Bulk delete messages with optional filters")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand((sub) =>
    sub
      .setName("count")
      .setDescription("Delete a specific number of messages")
      .addIntegerOption((opt) => opt.setName("amount").setDescription("Number of messages to delete (1-200)").setRequired(true).setMinValue(1).setMaxValue(200))
      .addUserOption((opt) => opt.setName("user").setDescription("Only messages from this user").setRequired(false))
      .addStringOption((opt) => opt.setName("contains").setDescription("Only messages matching this regex").setRequired(false))
      .addBooleanOption((opt) => opt.setName("bots_only").setDescription("Only bot messages").setRequired(false))
      .addBooleanOption((opt) => opt.setName("has_attachments").setDescription("Only messages with attachments").setRequired(false))
      .addStringOption((opt) =>
        opt
          .setName("attachment_type")
          .setDescription("Only specific attachment types")
          .setRequired(false)
          .addChoices({ name: "Images", value: "image" }, { name: "Videos", value: "video" }, { name: "Audio", value: "audio" }),
      )
      .addBooleanOption((opt) => opt.setName("has_embeds").setDescription("Only messages with embeds").setRequired(false))
      .addBooleanOption((opt) => opt.setName("gifs_only").setDescription("Only GIF attachments and tenor/giphy links").setRequired(false))
      .addBooleanOption((opt) => opt.setName("has_links").setDescription("Only messages containing links").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("time")
      .setDescription("Delete messages within a time range")
      .addStringOption((opt) => opt.setName("duration").setDescription("Time range (e.g. 2h, 30m, 1d)").setRequired(true))
      .addUserOption((opt) => opt.setName("user").setDescription("Only messages from this user").setRequired(false))
      .addStringOption((opt) => opt.setName("contains").setDescription("Only messages matching this regex").setRequired(false))
      .addBooleanOption((opt) => opt.setName("bots_only").setDescription("Only bot messages").setRequired(false))
      .addBooleanOption((opt) => opt.setName("has_attachments").setDescription("Only messages with attachments").setRequired(false))
      .addStringOption((opt) =>
        opt
          .setName("attachment_type")
          .setDescription("Only specific attachment types")
          .setRequired(false)
          .addChoices({ name: "Images", value: "image" }, { name: "Videos", value: "video" }, { name: "Audio", value: "audio" }),
      )
      .addBooleanOption((opt) => opt.setName("has_embeds").setDescription("Only messages with embeds").setRequired(false))
      .addBooleanOption((opt) => opt.setName("gifs_only").setDescription("Only GIF attachments and tenor/giphy links").setRequired(false))
      .addBooleanOption((opt) => opt.setName("has_links").setDescription("Only messages containing links").setRequired(false)),
  );

export const config = { allowInDMs: false };

// Execution delegated to subcommands/purge/index.ts
