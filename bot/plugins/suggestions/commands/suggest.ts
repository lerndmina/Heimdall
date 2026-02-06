import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder().setName("suggest").setDescription("Submit a suggestion for the server");

export const config = {
  allowInDMs: false,
};

// Execution handled by subcommands/suggest/index.ts
