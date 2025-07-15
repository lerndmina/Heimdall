import type { SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("exportmembers")
  .setDescription("Export all members of the server to a file.");

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["Administrator"],
  botPermissions: [],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  // Check for cooldown
  await initialReply(interaction, true);

  try {
    // Fetch all members
    const guild = interaction.guild;
    if (!guild) {
      return await interaction.editReply({
        content: "This command can only be used in a server.",
      });
    }

    await guild.members.fetch();
    const members = guild.members.cache;

    // Create CSV content
    const csvHeader = "User ID,Username,Display Name\n";
    const csvRows = members
      .map((member) => {
        const userId = member.user.id;
        const username = member.user.username.replace(/"/g, '""'); // Escape quotes
        const displayName = member.displayName.replace(/"/g, '""'); // Escape quotes
        return `"${userId}","${username}","${displayName}"`;
      })
      .join("\n");

    const csvContent = csvHeader + csvRows;

    // Create buffer from CSV content
    const buffer = Buffer.from(csvContent, "utf8");

    // Send file as ephemeral reply
    await interaction.editReply({
      content: `✅ Exported ${members.size} members successfully!`,
      files: [
        {
          attachment: buffer,
          name: `members-${guild.name.replace(/[^a-zA-Z0-9]/g, "-")}-${Date.now()}.csv`,
        },
      ],
    });
  } catch (error) {
    console.error("Error exporting members:", error);
    await interaction.editReply({
      content: "❌ An error occurred while exporting members.",
    });
  }
}
