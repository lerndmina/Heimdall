import { SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { LibAPI } from "../../lib/index.js";

/**
 * Format milliseconds to a human-readable uptime string.
 * Shows the two most significant units (e.g. "3 days, 4 hours").
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];

  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours % 24 > 0) parts.push(`${hours % 24} hour${hours % 24 !== 1 ? "s" : ""}`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60} minute${minutes % 60 !== 1 ? "s" : ""}`);
  if (parts.length === 0) parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);

  return parts.slice(0, 2).join(", ");
}

export const data = new SlashCommandBuilder().setName("uptime").setDescription("Get the bot's uptime since last restart");

export const config = {
  allowInDMs: true,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, client, getPluginAPI } = context;
  const lib = getPluginAPI<LibAPI>("lib");

  try {
    const lastRestartStr = await client.redis.get(`${client.user.id}-lastRestart`);
    const lastRestart = parseInt(lastRestartStr ?? "0");

    if (lastRestart === 0) {
      // Fallback to process.uptime() if Redis key not set
      const uptimeMs = process.uptime() * 1000;
      const uptime = formatUptime(uptimeMs);

      const embed = lib ? lib.createEmbedBuilder().setTitle("⏱️ Bot Uptime").setDescription(`I've been running for **${uptime}**.`).setTimestamp() : undefined;

      await interaction.reply(embed ? { embeds: [embed] } : { content: `⏱️ Uptime: ${uptime}` });
      return;
    }

    const now = Date.now();
    const uptimeMs = now - lastRestart;
    const uptime = formatUptime(uptimeMs);

    if (lib) {
      const embed = lib
        .createEmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("⏱️ Bot Uptime")
        .setDescription(`I was last restarted **${uptime}** ago.`)
        .addFields({ name: "Last Restart", value: `<t:${Math.floor(lastRestart / 1000)}:F>`, inline: true }, { name: "Uptime", value: uptime, inline: true })
        .setTimestamp()
        .setFooter({ text: `Requested by ${interaction.user.username}` });

      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply({ content: `⏱️ Last restarted **${uptime}** ago.` });
    }
  } catch (error) {
    await interaction.reply({ content: "❌ An error occurred while fetching uptime.", flags: ["Ephemeral"] });
  }
}
