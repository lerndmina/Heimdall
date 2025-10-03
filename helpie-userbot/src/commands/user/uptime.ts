/**
 * Uptime command - Shows bot uptime
 * Owner-only command
 *
 * Example: /helpie uptime
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import fetchEnvs from "../../utils/FetchEnvs";
import { botStartTime } from "../../index";
import HelpieReplies from "../../utils/HelpieReplies";

const env = fetchEnvs();

export const data = new SlashCommandBuilder().setName("uptime").setDescription("Shows bot uptime (owner only)");

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Owner-only validation
  if (!env.OWNER_IDS.includes(interaction.user.id)) {
    return HelpieReplies.warning(interaction, "This command is only available to bot owners.");
  }

  await HelpieReplies.deferThinking(interaction, true);

  // Calculate uptime
  const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
  const uptimeSeconds = currentTime - botStartTime;

  // Format uptime components
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;

  // Build uptime string
  const uptimeParts: string[] = [];
  if (days > 0) uptimeParts.push(`${days}d`);
  if (hours > 0) uptimeParts.push(`${hours}h`);
  if (minutes > 0) uptimeParts.push(`${minutes}m`);
  if (seconds > 0 || uptimeParts.length === 0) uptimeParts.push(`${seconds}s`);

  const uptimeString = uptimeParts.join(" ");

  // Discord timestamp formats:
  // <t:timestamp:R> = Relative (e.g., "2 hours ago")
  // <t:timestamp:F> = Full date/time
  const relativeTimestamp = `<t:${botStartTime}:R>`;
  const fullTimestamp = `<t:${botStartTime}:F>`;

  const message = `**Started:** ${fullTimestamp}
**Uptime:** ${uptimeString} (${relativeTimestamp})

**Bot:** ${client.user?.tag || "Unknown"}
**Ping:** ${client.ws.ping}ms`;

  await HelpieReplies.success(
    interaction,
    {
      title: "Helpie Uptime",
      message,
    },
    true
  );
}
