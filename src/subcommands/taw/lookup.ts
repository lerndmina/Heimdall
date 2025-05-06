import { CommandInteraction, User } from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import {
  getCharacterInfo,
  formatPlaytime,
  parseActivityData,
  getRecentActivityHistory,
} from "./commons";
import { getDiscordDate, TimeType } from "../../utils/TinyUtils";

export default async function lookup(interaction: CommandInteraction, targetUser: User | null) {
  const userToLookup = targetUser || interaction.user;
  const characterInfo = await getCharacterInfo(interaction, userToLookup);

  if (!characterInfo) {
    return; // Error messages already handled in getCharacterInfo
  }

  const { citizenId, charInfoParsed, userToProcess, playerIdentifiers } = characterInfo;

  // Format the last seen date from milliseconds since epoch
  const lastSeen = getDiscordDate(playerIdentifiers.last_seen, TimeType.FULL_SHORT);
  const lastSeenTimeAgo = getDiscordDate(playerIdentifiers.last_seen, TimeType.RELATIVE);
  // Format playtime
  const playtimeFormatted = formatPlaytime(playerIdentifiers.playtime_minutes);

  // Parse activity data and get recent history
  const activityRecords = parseActivityData(playerIdentifiers.last_active_data);
  const recentActivity = getRecentActivityHistory(activityRecords, 3);

  // Create a more detailed embed with the additional info
  await interaction.editReply({
    embeds: [
      BasicEmbed(
        interaction.client,
        `Info for ${charInfoParsed.firstname} ${charInfoParsed.lastname}`,
        `Character of <@${userToProcess.id}>`,
        [
          { name: "Citizen ID", value: `${citizenId}`, inline: true },
          { name: "Discord ID", value: `${userToProcess.id}`, inline: true },
          { name: "Birthdate", value: charInfoParsed.birthdate, inline: true },
          { name: "IBAN", value: `${charInfoParsed.iban}`, inline: true },
          { name: "Phone", value: charInfoParsed.phone || "None", inline: true },
          { name: "Nationality", value: charInfoParsed.nationality, inline: true },
          {
            name: "Online Status",
            value: playerIdentifiers.is_online ? "Online" : "Offline",
            inline: true,
          },
          { name: "Last Seen", value: `${lastSeen}\n(${lastSeenTimeAgo})`, inline: true },
          { name: "Total Playtime", value: playtimeFormatted, inline: true },
          { name: "Recent Activity", value: recentActivity, inline: false },
        ]
      ),
    ],
    content: null,
  });
}
