import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { ModernCommandData } from "../../../../command-handler/dist/types";

export default {
  data: new SlashCommandBuilder()
    .setName("testmodern")
    .setDescription("Test modern command syntax"),

  config: {
    devOnly: true,
    guildOnly: true,
    cooldown: 5000,
    userPermissions: [PermissionFlagsBits.UseApplicationCommands],
    botPermissions: [PermissionFlagsBits.SendMessages],
    category: "Testing",
    nsfw: false,
  },

  async execute({ interaction, client, handler }) {
    await interaction.reply({
      content: `🎉 Modern command syntax working!\n\n**Command Details:**\n- Category: Testing\n- Cooldown: 5 seconds\n- Dev only: Yes\n- Guild only: Yes`,
      ephemeral: true,
    });
  },
} as ModernCommandData;
