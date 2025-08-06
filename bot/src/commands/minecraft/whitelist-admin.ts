import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import MinecraftConfig from "../../models/MinecraftConfig";
import MinecraftPlayer from "../../models/MinecraftPlayer";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs from "../../utils/FetchEnvs";

const env = FetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("whitelist-admin")
  .setDescription("Administrative tools for managing the Minecraft whitelist")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("bulk-approve")
      .setDescription("Approve the oldest pending whitelist requests")
      .addIntegerOption((option) =>
        option
          .setName("count")
          .setDescription("Number of requests to approve (1-50)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(50)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pending-count")
      .setDescription("Show how many requests are waiting for approval")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pending-list")
      .setDescription("List the oldest pending requests")
      .addIntegerOption((option) =>
        option
          .setName("limit")
          .setDescription("Number of requests to show (1-20)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(20)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

export const options: LegacyCommandOptions = {
  devOnly: false,
  deleted: !env.ENABLE_MINECRAFT_SYSTEMS,
};

export async function run({ interaction, client }: LegacySlashCommandProps) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId!;
  const subcommand = interaction.options.getSubcommand();

  // Check if minecraft integration is enabled for this guild
  const { data: config, error: configError } = await tryCatch(
    MinecraftConfig.findOne({ guildId }).lean()
  );

  if (configError) {
    log.error("Failed to fetch minecraft config:", configError);
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "Failed to check configuration. Please try again later."
        ).setColor("Red"),
      ],
    });
  }

  if (!config || !config.enabled) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Not Available",
          "Minecraft account linking is not enabled on this server."
        ).setColor("Red"),
      ],
    });
  }

  // Check if user has staff role
  const member = interaction.member;
  const hasStaffRole =
    member && !Array.isArray(member.roles) && member.roles.cache.has(config.staffRoleId);

  if (!hasStaffRole) {
    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Insufficient Permissions",
          "You need the staff role to use this command."
        ).setColor("Red"),
      ],
    });
  }

  if (subcommand === "pending-count") {
    const { data: pendingCount, error: countError } = await tryCatch(
      MinecraftPlayer.countDocuments({
        guildId,
        whitelistStatus: "pending_approval",
      })
    );

    if (countError) {
      log.error("Failed to count pending requests:", countError);
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Error",
            "Failed to count pending requests. Please try again later."
          ).setColor("Red"),
        ],
      });
    }

    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "📊 Pending Whitelist Requests",
          `There are currently **${pendingCount}** requests waiting for approval.${
            pendingCount > 0
              ? `\n\nUse \`/whitelist-admin bulk-approve\` to approve the oldest requests in the queue.`
              : ""
          }`
        ).setColor(pendingCount > 0 ? "Yellow" : "Green"),
      ],
    });
  }

  if (subcommand === "pending-list") {
    const limit = interaction.options.getInteger("limit") ?? 10;

    const { data: pendingPlayers, error: listError } = await tryCatch(
      MinecraftPlayer.find({
        guildId,
        whitelistStatus: "pending_approval",
      })
        .sort({ createdAt: 1 }) // Oldest first
        .limit(limit)
        .lean()
    );

    if (listError) {
      log.error("Failed to list pending requests:", listError);
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Error",
            "Failed to retrieve pending requests. Please try again later."
          ).setColor("Red"),
        ],
      });
    }

    if (!pendingPlayers || pendingPlayers.length === 0) {
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "✅ No Pending Requests",
            "There are no pending whitelist requests at this time."
          ).setColor("Green"),
        ],
      });
    }

    const playerList = pendingPlayers
      .map((player, index) => {
        const waitTime = Math.floor((Date.now() - player.createdAt.getTime()) / (1000 * 60));
        const discordMention = player.discordId ? `<@${player.discordId}>` : "Not linked";
        return `**${index + 1}.** ${
          player.minecraftUsername
        } • ${discordMention} • ${waitTime}m ago`;
      })
      .join("\n");

    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "📝 Oldest Pending Requests",
          `Showing the oldest ${pendingPlayers.length} pending requests:\n\n${playerList}\n\n` +
            `Use \`/whitelist-admin bulk-approve count:${pendingPlayers.length}\` to approve all of these.`
        ).setColor("Yellow"),
      ],
    });
  }

  if (subcommand === "bulk-approve") {
    const count = interaction.options.getInteger("count") ?? 10;

    // First check how many are actually pending
    const { data: pendingCount, error: countError } = await tryCatch(
      MinecraftPlayer.countDocuments({
        guildId,
        whitelistStatus: "pending_approval",
      })
    );

    if (countError) {
      log.error("Failed to count pending requests:", countError);
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Error",
            "Failed to check pending requests. Please try again later."
          ).setColor("Red"),
        ],
      });
    }

    if (pendingCount === 0) {
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "✅ No Pending Requests",
            "There are no pending whitelist requests to approve."
          ).setColor("Green"),
        ],
      });
    }

    const actualCount = Math.min(count, pendingCount);

    // Get the players that will be approved for confirmation
    const { data: playersToApprove, error: previewError } = await tryCatch(
      MinecraftPlayer.find({
        guildId,
        whitelistStatus: "pending_approval",
      })
        .sort({ createdAt: 1 })
        .limit(actualCount)
        .lean()
    );

    if (previewError || !playersToApprove) {
      log.error("Failed to preview players for approval:", previewError);
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Error",
            "Failed to preview requests for approval. Please try again later."
          ).setColor("Red"),
        ],
      });
    }

    // Perform the bulk approval
    const { error: approvalError } = await tryCatch(
      MinecraftPlayer.updateMany(
        {
          guildId,
          whitelistStatus: "pending_approval",
        },
        {
          whitelistStatus: "whitelisted",
          isWhitelisted: true,
          approvedBy: interaction.user.id,
          whitelistedAt: new Date(),
          updatedAt: new Date(),
        },
        { sort: { createdAt: 1 }, limit: actualCount }
      )
    );

    if (approvalError) {
      log.error("Failed to bulk approve requests:", approvalError);
      return interaction.editReply({
        embeds: [
          BasicEmbed(
            client,
            "❌ Error",
            "Failed to approve requests. Please try again later."
          ).setColor("Red"),
        ],
      });
    }

    const approvedList = playersToApprove
      .map((player, index) => {
        const discordMention = player.discordId ? `<@${player.discordId}>` : "Not linked";
        return `**${index + 1}.** ${player.minecraftUsername} • ${discordMention}`;
      })
      .join("\n");

    log.info(
      `[Whitelist Admin] ${interaction.user.tag} (${interaction.user.id}) bulk approved ${actualCount} requests in guild ${guildId}`
    );

    return interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "✅ Bulk Approval Completed",
          `Successfully approved **${actualCount}** whitelist requests!\n\n` +
            `**Approved Players:**\n${approvedList}\n\n` +
            `These players can now join the Minecraft server.`
        ).setColor("Green"),
      ],
    });
  }
}
