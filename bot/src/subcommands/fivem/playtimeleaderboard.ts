import { CommandInteraction } from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import { formatPlaytime, getPlaytimeLeaderboard } from "./commons";

export default async function playtimeLeaderboard(
  interaction: CommandInteraction,
  limit: number = 10
) {
  // Get the playtime leaderboard data
  const leaderboardData = await getPlaytimeLeaderboard(interaction, limit);

  if (!leaderboardData) {
    return; // Error messages already handled in getPlaytimeLeaderboard
  }

  if (leaderboardData.length === 0) {
    return interaction.editReply("No playtime data available for any players.");
  }

  // Create a formatted leaderboard message
  const leaderboardFields = leaderboardData.map((entry, index) => {
    const position = index + 1;
    const name = `#${position} - ${entry.firstname} ${entry.lastname}`;
    const playtime = formatPlaytime(entry.playtime_minutes);

    return {
      name: name,
      value: `Playtime: ${playtime}`,
      inline: true,
    };
  });

  // Create the embed
  await interaction.editReply({
    embeds: [
      BasicEmbed(
        interaction.client,
        `🏆 Playtime Leaderboard - Top ${leaderboardData.length} Players`,
        `Showing the players with the most time on the server`,
        leaderboardFields
      ),
    ],
    content: "",
  });
}
