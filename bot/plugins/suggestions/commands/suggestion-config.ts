import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("suggestion-config")
  .setDescription("Configure the suggestion system")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("add-channel")
      .setDescription("Add a channel for suggestions")
      .addChannelOption((opt) => opt.setName("channel").setDescription("The channel to use for suggestions").addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum).setRequired(true))
      .addBooleanOption((opt) => opt.setName("use-ai-titles").setDescription("Use AI to generate suggestion titles (requires OpenAI API key)").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove-channel")
      .setDescription("Remove a suggestion channel")
      .addChannelOption((opt) => opt.setName("channel").setDescription("The channel to remove").setRequired(true)),
  )
  .addSubcommand((sub) => sub.setName("list-channels").setDescription("List all configured suggestion channels"))
  .addSubcommand((sub) =>
    sub
      .setName("set-limits")
      .setDescription("Configure suggestion system limits")
      .addIntegerOption((opt) => opt.setName("max-channels").setDescription("Maximum suggestion channels (1-10)").setMinValue(1).setMaxValue(10).setRequired(false))
      .addIntegerOption((opt) => opt.setName("vote-cooldown").setDescription("Seconds between votes (10-300)").setMinValue(10).setMaxValue(300).setRequired(false))
      .addIntegerOption((opt) => opt.setName("submission-cooldown").setDescription("Seconds between submissions (60-7200)").setMinValue(60).setMaxValue(7200).setRequired(false)),
  )
  .addSubcommand((sub) => sub.setName("view-config").setDescription("View current suggestion system configuration"))
  .addSubcommand((sub) =>
    sub
      .setName("create-opener")
      .setDescription("Create a suggestion opener with dropdown menu in a channel")
      .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to post the opener message").addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((opt) => opt.setName("title").setDescription("Title of the opener embed").setRequired(false))
      .addStringOption((opt) => opt.setName("description").setDescription("Description of the opener embed").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove-opener")
      .setDescription("Remove a suggestion opener message")
      .addChannelOption((opt) => opt.setName("channel").setDescription("Channel with the opener message").setRequired(true)),
  );

export const config = {
  allowInDMs: false,
};

// Execution handled by subcommands/suggestion-config/index.ts
