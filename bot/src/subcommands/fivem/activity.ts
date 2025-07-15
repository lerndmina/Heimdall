import { CommandInteraction, User } from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import { getCharacterInfo, parseActivityData, formatTimestamp } from "./commons";

export default async function activityHistory(
  interaction: CommandInteraction,
  targetUser: User | null,
  limit: number = 5
) {
  const userToLookup = targetUser || interaction.user;
  const characterInfo = await getCharacterInfo(interaction, userToLookup);

  if (!characterInfo) {
    return; // Error messages already handled in getCharacterInfo
  }

  const { charInfoParsed, userToProcess, playerIdentifiers } = characterInfo;

  // Parse activity data JSON
  const activityRecords = parseActivityData(playerIdentifiers.last_active_data);

  // Limit the number of records to display
  const recordsToDisplay = activityRecords.slice(0, limit);

  if (recordsToDisplay.length === 0) {
    return interaction.editReply(
      `No activity records found for ${charInfoParsed.firstname} ${charInfoParsed.lastname}.`
    );
  }

  // Create fields for the embed
  const fields = recordsToDisplay.map((record, index) => {
    const action = record.type === "join" ? "🟢 Joined server" : "🔴 Left server";
    const time = formatTimestamp(record.time); // Convert to milliseconds from seconds

    return {
      name: `${index + 1}. ${action}`,
      value: `Time: ${time}`,
      inline: false,
    };
  });

  // Add total playtime field
  fields.unshift({
    name: "Total Playtime",
    value: `${playerIdentifiers.playtime_minutes} minutes`,
    inline: false,
  });

  // Create the embed
  await interaction.editReply({
    embeds: [
      BasicEmbed(
        interaction.client,
        `Activity History for ${charInfoParsed.firstname} ${charInfoParsed.lastname}`,
        `Showing the last ${recordsToDisplay.length} server join/leave events.`,
        fields
      ),
    ],
    content: null,
  });
}
