/**
 * /minecraft-status — Check your Minecraft account linking status
 *
 * Shows all linked accounts with their whitelist status.
 * Supports unlinking individual accounts when multiple are linked.
 */

import { ActionRowBuilder, ButtonStyle, SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { MinecraftPluginAPI } from "../index.js";
import MinecraftConfig from "../models/MinecraftConfig.js";
import MinecraftPlayer from "../models/MinecraftPlayer.js";

export const data = new SlashCommandBuilder().setName("minecraft-status").setDescription("Check your Minecraft account linking and whitelist status");

export const config = { allowInDMs: false };

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<MinecraftPluginAPI>("minecraft");
  if (!pluginAPI) {
    await interaction.editReply("❌ Minecraft plugin not loaded.");
    return;
  }

  const guildId = interaction.guildId!;
  const discordId = interaction.user.id;

  const mcConfig = await MinecraftConfig.findOne({ guildId }).lean();
  if (!mcConfig?.enabled) {
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Available").setDescription("Minecraft account linking is not enabled.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Fetch ALL linked accounts for this user
  const linkedPlayers = await MinecraftPlayer.find({ guildId, discordId, linkedAt: { $ne: null } })
    .sort({ linkedAt: 1 })
    .lean();

  // Check for pending auth
  const pendingAuth = await MinecraftPlayer.findOne({
    guildId,
    discordId,
    authCode: { $ne: null },
    linkedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean();

  const maxAccounts = mcConfig.maxPlayersPerUser ?? 1;

  if (linkedPlayers.length > 0) {
    const fields = linkedPlayers.map((player, i) => {
      const isWhitelisted = !!player.whitelistedAt && !player.revokedAt;
      const statusEmoji = player.revokedAt ? "🔴" : isWhitelisted ? "🟢" : "🟡";
      const statusText = player.revokedAt ? "Revoked" : isWhitelisted ? "Whitelisted" : "Pending Approval";

      return {
        name: `${statusEmoji} ${player.minecraftUsername}`,
        value:
          `**Status:** ${statusText}\n` +
          `**Linked:** <t:${Math.floor(new Date(player.linkedAt!).getTime() / 1000)}:R>` +
          (isWhitelisted ? `\n**Whitelisted:** <t:${Math.floor(new Date(player.whitelistedAt!).getTime() / 1000)}:R>` : ""),
        inline: linkedPlayers.length <= 3,
      };
    });

    const allWhitelisted = linkedPlayers.every((p) => !!p.whitelistedAt && !p.revokedAt);
    const slotsRemaining = maxAccounts - linkedPlayers.length;

    let footer = `Server: ${mcConfig.serverHost}:${mcConfig.serverPort}`;
    if (maxAccounts > 1) {
      footer += ` • ${linkedPlayers.length}/${maxAccounts} account slots used`;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(allWhitelisted ? 0x00ff00 : 0xffa500)
      .setTitle("🎮 Your Minecraft Accounts")
      .addFields(fields)
      .setFooter({ text: footer });

    if (pendingAuth) {
      embed.addFields({
        name: "🔄 Pending Link Request",
        value:
          `**Username:** ${pendingAuth.minecraftUsername}\n` +
          `**Expires:** <t:${Math.floor((pendingAuth.expiresAt?.getTime() || 0) / 1000)}:R>\n` +
          (pendingAuth.codeShownAt ? `**Code:** \`${pendingAuth.authCode}\` — Use \`/confirm-code ${pendingAuth.authCode}\`` : `Join the server to receive your code`),
        inline: false,
      });
    }

    if (slotsRemaining > 0 && !pendingAuth) {
      embed.setDescription(`Use \`/link-minecraft <username>\` to link ${linkedPlayers.length > 0 ? "another" : "your"} Minecraft account.`);
    }

    // Build unlink buttons if multiple accounts are linked
    const components: ActionRowBuilder<any>[] = [];
    if (linkedPlayers.length > 1) {
      const row = new ActionRowBuilder<any>();
      for (const player of linkedPlayers.slice(0, 5)) {
        const btn = pluginAPI.lib.createButtonBuilder(async (i) => {
          // Confirm unlink
          const confirmEmbed = pluginAPI.lib
            .createEmbedBuilder()
            .setColor(0xff0000)
            .setTitle("⚠️ Unlink Account")
            .setDescription(`Are you sure you want to unlink **${player.minecraftUsername}**?\n\nThis will remove your whitelist for this account.`);

          const confirmBtn = pluginAPI.lib
            .createButtonBuilder(async (ci) => {
              const doc = await MinecraftPlayer.findById(player._id);
              if (doc) {
                doc.unlinkAccount();
                doc.revokeWhitelist(discordId, "Unlinked by user");
                await doc.save();
              }

              const doneEmbed = pluginAPI.lib
                .createEmbedBuilder()
                .setColor(0x00ff00)
                .setTitle("✅ Account Unlinked")
                .setDescription(`**${player.minecraftUsername}** has been unlinked from your Discord account.`);
              await ci.update({ embeds: [doneEmbed], components: [] });
            }, 120)
            .setLabel("Yes, Unlink")
            .setStyle(ButtonStyle.Danger);
          await confirmBtn.ready();

          const cancelBtn = pluginAPI.lib
            .createButtonBuilder(async (ci) => {
              await ci.update({ content: "Cancelled.", embeds: [], components: [] });
            }, 120)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary);
          await cancelBtn.ready();

          const confirmRow = new ActionRowBuilder<any>().addComponents(confirmBtn, cancelBtn);
          await i.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
        }, 300);

        btn.setLabel(`Unlink ${player.minecraftUsername}`).setStyle(ButtonStyle.Danger).setEmoji("🔗");
        await btn.ready();
        row.addComponents(btn);
      }
      components.push(row);
    } else if (linkedPlayers.length === 1) {
      // Single account — offer unlink button
      const player = linkedPlayers[0]!;
      const btn = pluginAPI.lib.createButtonBuilder(async (i) => {
        const confirmEmbed = pluginAPI.lib
          .createEmbedBuilder()
          .setColor(0xff0000)
          .setTitle("⚠️ Unlink Account")
          .setDescription(`Are you sure you want to unlink **${player.minecraftUsername}**?\n\nThis will remove your whitelist for this account.`);

        const confirmBtn = pluginAPI.lib
          .createButtonBuilder(async (ci) => {
            const doc = await MinecraftPlayer.findById(player._id);
            if (doc) {
              doc.unlinkAccount();
              doc.revokeWhitelist(discordId, "Unlinked by user");
              await doc.save();
            }
            const doneEmbed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Account Unlinked").setDescription(`**${player.minecraftUsername}** has been unlinked.`);
            await ci.update({ embeds: [doneEmbed], components: [] });
          }, 120)
          .setLabel("Yes, Unlink")
          .setStyle(ButtonStyle.Danger);
        await confirmBtn.ready();

        const cancelBtn = pluginAPI.lib
          .createButtonBuilder(async (ci) => {
            await ci.update({ content: "Cancelled.", embeds: [], components: [] });
          }, 120)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary);
        await cancelBtn.ready();

        const confirmRow = new ActionRowBuilder<any>().addComponents(confirmBtn, cancelBtn);
        await i.reply({ embeds: [confirmEmbed], components: [confirmRow], ephemeral: true });
      }, 300);

      btn.setLabel(`Unlink ${player.minecraftUsername}`).setStyle(ButtonStyle.Danger).setEmoji("🔗");
      await btn.ready();
      components.push(new ActionRowBuilder<any>().addComponents(btn));
    }

    await interaction.editReply({ embeds: [embed], components });
    return;
  }

  if (pendingAuth) {
    const code = pendingAuth.authCode;
    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0xffff00)
      .setTitle("🔄 Authentication In Progress")
      .setDescription(
        `**Minecraft Username:** ${pendingAuth.minecraftUsername}\n` +
          `**Status:** ⏳ Pending Confirmation\n` +
          `**Expires:** <t:${Math.floor((pendingAuth.expiresAt?.getTime() || 0) / 1000)}:R>\n\n` +
          `**Next Steps:**\n` +
          (pendingAuth.codeShownAt
            ? `**Your Code:** \`${code}\`\nUse \`/confirm-code ${code}\``
            : `1. Join the server: \`${mcConfig.serverHost}:${mcConfig.serverPort}\`\n2. Get code\n3. Use \`/confirm-code <code>\``),
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Not linked
  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("❓ No Minecraft Account Linked")
    .setDescription(
      "You don't have a Minecraft account linked.\n\n" +
        `Use \`/link-minecraft <username>\` to get started!` +
        (maxAccounts > 1 ? `\n\n💡 You can link up to **${maxAccounts}** Minecraft accounts.` : ""),
    );
  await interaction.editReply({ embeds: [embed] });
}
