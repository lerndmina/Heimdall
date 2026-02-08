/**
 * /automod enable|disable|view|stats — Quick automod management.
 *
 * Full rule management is handled through the dashboard.
 * This command provides quick access for enabling/disabling and viewing status.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";

export const data = new SlashCommandBuilder()
  .setName("automod")
  .setDescription("Manage automod settings")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) => sub.setName("enable").setDescription("Enable automod for this server"))
  .addSubcommand((sub) => sub.setName("disable").setDescription("Disable automod for this server"))
  .addSubcommand((sub) => sub.setName("view").setDescription("View current automod configuration"))
  .addSubcommand((sub) => sub.setName("stats").setDescription("View automod statistics"));

export const config = { allowInDMs: false };

// Execution delegated to subcommands/automod/index.ts
