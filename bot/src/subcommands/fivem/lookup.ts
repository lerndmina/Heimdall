import { CommandInteraction, User } from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import {
  getCharacterInfo,
  formatPlaytime,
  parseActivityData,
  getRecentActivityHistory,
} from "./commons";
import { getDiscordDate, TimeType } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import TawLinks from "../../models/TawLinks";
const db = new Database();

export default async function lookup(interaction: CommandInteraction, targetUser: User | null) {
  const userToLookup = targetUser || interaction.user;
  const characterInfo = await getCharacterInfo(interaction, userToLookup, { includeJobInfo: true });

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

  const embed = BasicEmbed(
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
    ]
  );

  const tawLinkData = await TawLinks.findOne({ discordUserId: userToProcess.id });
  if (tawLinkData && tawLinkData.fullyLinked) {
    embed.addFields({ name: "TAW Callsign", value: tawLinkData.tawUserCallsign, inline: true });
  }

  embed.addFields(
    { name: "Last Seen", value: `${lastSeen}\n(${lastSeenTimeAgo})`, inline: true },
    { name: "Total Playtime", value: playtimeFormatted, inline: true },
    { name: "Recent Activity", value: recentActivity, inline: false }
  );

  // Add job info if available
  if (characterInfo.jobInfoParsed) {
    for (const job of characterInfo.jobInfoParsed) {
      embed.addFields({
        name: `Job: ${job.name}`,
        value: `Rank: ${job.grade}\nPlaytime (Week) ${job.week} minutes\nPlaytime (Total) ${job.total} minutes`,
        inline: false,
      });
    }
  }

  // Create a more detailed embed with the additional info
  await interaction.editReply({
    embeds: [embed],
    content: null,
  });
}
