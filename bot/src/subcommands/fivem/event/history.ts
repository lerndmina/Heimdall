import { EmbedBuilder } from "discord.js";
import BasicEmbed from "../../../utils/BasicEmbed";
import { SlashCommandProps } from "commandkit";
import {
  getDbConnection,
  getPlayerLicenseFromDiscord,
  getPlayerEventHistory,
  EventParticipation,
} from "./commons";
import log from "../../../utils/log";

/**
 * Lists the current user's events with their participation start and end times with total time calculated
 */
export default async function eventHistory(props: SlashCommandProps) {
  const { interaction } = props;

  // Get database connection
  const { connection } = await getDbConnection(props);
  if (!connection) return;

  try {
    // Get the user's Discord ID
    const discordId = interaction.user.id;

    // Find the user's FiveM license from their Discord ID
    const playerLicense = await getPlayerLicenseFromDiscord(connection, discordId);

    if (!playerLicense) {
      log.debug(`[TawEvents History]`, `User ${discordId} does not have a linked FiveM account.`, {
        userId: discordId,
        playerLicense: playerLicense,
      });
      await interaction.editReply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "No Player Record Found",
            "You do not have a linked FiveM account. Please join the server before using this command."
          ),
        ],
        content: null,
      });
      return;
    }

    // Query the user's event participation history
    const history = await getPlayerEventHistory(connection, playerLicense);

    if (history.length === 0) {
      await interaction.editReply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "No Event History",
            "You haven't participated in any events yet."
          ),
        ],
        content: null,
      });
      return;
    }

    const embed = BasicEmbed(
      interaction.client,
      "🏆 Your Event Participation History",
      `Here's a record of your event participation:`
    ).setColor("#2ecc71");

    // Add each event participation record to the embed
    history.forEach((record: any) => {
      // Format times using Discord timestamp format
      const joinTimeFormatted = `<t:${record.time_joined}:f>`;
      const leaveTimeFormatted = record.time_left
        ? `<t:${record.time_left}:f>`
        : "Still participating";

      // Calculate total participation time in minutes
      let totalTimeText = "Still participating";
      if (record.time_participated) {
        const minutes = Math.floor(record.time_participated / 60);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        totalTimeText =
          hours > 0 ? `${hours} hours ${remainingMinutes} minutes` : `${minutes} minutes`;
      }

      embed.addFields({
        name: `${record.event_name} (ID: ${record.event_id})`,
        value: `**Joined:** ${joinTimeFormatted}\n**Left:** ${leaveTimeFormatted}\n**Total Time:** ${totalTimeText}`,
      });
    });

    await interaction.editReply({ embeds: [embed], content: null });
  } catch (error) {
    console.error("Error fetching event history:", error);
    await interaction.editReply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Error",
          "Failed to fetch event history. Please try again later."
        ),
      ],
      content: null,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
