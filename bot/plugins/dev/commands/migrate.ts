/**
 * Migration Command - Import data from old bot database
 *
 * Usage:
 *   /migrate run <old_db_uri> [guild_id] [skip_open_threads] [skip_modmail]
 *   /migrate status - Check migration status (not implemented)
 */

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import { runFullMigration, type MigrationStats, type FullMigrationOptions } from "../utils/migration.js";

export const data = new SlashCommandBuilder()
  .setName("migrate")
  .setDescription("Import data from the old bot database")
  .setDefaultMemberPermissions("0") // Owner only
  .addSubcommand((sub) =>
    sub
      .setName("run")
      .setDescription("Execute data migration from old bot")
      .addStringOption((opt) => opt.setName("old_db_uri").setDescription("MongoDB URI for the old database").setRequired(true))
      .addStringOption((opt) => opt.setName("guild_id").setDescription("Specific guild ID to migrate (optional)"))
      .addBooleanOption((opt) => opt.setName("skip_open_threads").setDescription("Skip open modmail threads (by default all threads are imported)"))
      .addBooleanOption((opt) => opt.setName("skip_modmail").setDescription("Skip modmail thread migration"))
      .addStringOption((opt) => opt.setName("modmail_collection").setDescription("Custom MongoDB collection name for modmail threads (e.g. solacemodmails)")),
  )
  .addSubcommand((sub) => sub.setName("status").setDescription("Check recent migration status"));

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, client } = context;
  const subcommand = interaction.options.getSubcommand();

  // Only bot owner can run migrations
  const ownerId = client.application?.owner?.id;
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ Only the bot owner can run migrations.",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "run") {
    const oldDbUri = interaction.options.getString("old_db_uri", true);
    const guildId = interaction.options.getString("guild_id") || undefined;
    const skipOpenThreads = interaction.options.getBoolean("skip_open_threads") || false;
    const skipModmail = interaction.options.getBoolean("skip_modmail") || false;
    const modmailCollection = interaction.options.getString("modmail_collection") || undefined;

    await interaction.deferReply({ ephemeral: true });

    try {
      const stats = await runFullMigration({
        oldDbUri,
        guildId,
        importOpenThreads: !skipOpenThreads,
        skipModmail,
        modmailCollection,
      });

      const embed = buildMigrationEmbed(stats, guildId);
      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.editReply({
        content: `❌ Migration failed: ${error.message}`,
      });
    }
  } else if (subcommand === "status") {
    await interaction.reply({
      content: "Migration status tracking not yet implemented. Use `/migrate run` to perform migration.",
      ephemeral: true,
    });
  }
}

function buildMigrationEmbed(stats: MigrationStats, guildId?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle("📦 Migration Results").setColor(0x3b82f6).setTimestamp();

  if (guildId) {
    embed.setDescription(`Migration for guild: \`${guildId}\``);
  } else {
    embed.setDescription("Full database migration");
  }

  // TempVC
  embed.addFields({
    name: "🔊 Temp Voice Channels",
    value: formatMigrationResult(stats.tempVC),
    inline: false,
  });

  // Active Temp Channels
  embed.addFields({
    name: "🔊 Active Temp Channels",
    value: formatMigrationResult(stats.activeTempChannels),
    inline: false,
  });

  // Tags
  embed.addFields({
    name: "🏷️ Tags",
    value: formatMigrationResult(stats.tags),
    inline: false,
  });

  // Suggestion Config
  embed.addFields({
    name: "💡 Suggestion Config",
    value: formatMigrationResult(stats.suggestionConfig),
    inline: false,
  });

  // Suggestions
  embed.addFields({
    name: "💡 Suggestions",
    value: formatMigrationResult(stats.suggestions),
    inline: false,
  });

  // Modmail Config
  embed.addFields({
    name: "📨 Modmail Config",
    value: formatMigrationResult(stats.modmailConfig),
    inline: false,
  });

  // Modmail Threads
  embed.addFields({
    name: "📨 Modmail Threads",
    value: formatMigrationResult(stats.modmail),
    inline: false,
  });

  const totalImported =
    stats.tempVC.imported +
    stats.activeTempChannels.imported +
    stats.tags.imported +
    stats.suggestionConfig.imported +
    stats.suggestions.imported +
    stats.modmailConfig.imported +
    stats.modmail.imported;

  const totalSkipped =
    stats.tempVC.skipped + stats.activeTempChannels.skipped + stats.tags.skipped + stats.suggestionConfig.skipped + stats.suggestions.skipped + stats.modmailConfig.skipped + stats.modmail.skipped;

  embed.addFields({
    name: "📊 Summary",
    value: `✅ Imported: **${totalImported}**\n⏭️ Skipped: **${totalSkipped}**`,
    inline: false,
  });

  return embed;
}

function formatMigrationResult(result: { success: boolean; imported: number; skipped: number; errors: string[] }): string {
  if (!result.success) {
    return `❌ Failed\n${result.errors.slice(0, 2).join("\n")}${result.errors.length > 2 ? `\n... and ${result.errors.length - 2} more` : ""}`;
  }

  if (result.imported === 0 && result.skipped === 0) {
    return "⚠️ No data found";
  }

  let output = `✅ Imported: ${result.imported}`;
  if (result.skipped > 0) {
    output += `\n⏭️ Skipped: ${result.skipped}`;
  }
  if (result.errors.length > 0) {
    output += `\n⚠️ Errors: ${result.errors.length}`;
  }

  return output;
}
