/**
 * Guilds Panel — Browse, inspect, and leave guilds the bot is in.
 */

import { ActionRowBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type StringSelectMenuInteraction } from "discord.js";
import { createBackButton, PANEL_TTL, PanelId, type DevPanelContext, type PanelResult } from "../devPanel.js";
import { nanoid } from "nanoid";

const GUILDS_PER_PAGE = 10;

export async function buildGuildsPanel(ctx: DevPanelContext, page = 0): Promise<PanelResult> {
  const { lib, client } = ctx;

  const guilds = [...client.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
  const totalPages = Math.max(1, Math.ceil(guilds.length / GUILDS_PER_PAGE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageGuilds = guilds.slice(currentPage * GUILDS_PER_PAGE, (currentPage + 1) * GUILDS_PER_PAGE);

  // ── Embed ────────────────────────────────────────────────────────────────
  const lines = pageGuilds.map((g, idx) => {
    const num = currentPage * GUILDS_PER_PAGE + idx + 1;
    return `**${num}.** ${g.name} — \`${g.id}\` · ${g.memberCount.toLocaleString()} members`;
  });

  const embed = lib
    .createEmbedBuilder()
    .setTitle("🏠 Guilds")
    .setDescription(lines.length > 0 ? lines.join("\n") : "No guilds.")
    .setFooter({ text: `Page ${currentPage + 1}/${totalPages} · ${guilds.length} total guilds` });

  // ── Select menu for guild actions ────────────────────────────────────────
  const rows: ActionRowBuilder<any>[] = [];

  if (pageGuilds.length > 0) {
    const selectOptions = pageGuilds.map((g) => ({
      label: g.name.slice(0, 100),
      value: g.id,
      description: `${g.memberCount.toLocaleString()} members`,
    }));

    const guildSelect = lib.createStringSelectMenuBuilder(async (i: StringSelectMenuInteraction) => {
      const guildId = i.values[0];
      if (!guildId) return;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        await i.reply({ content: "❌ Guild not found in cache.", ephemeral: true });
        return;
      }

      await i.deferUpdate();

      // Show guild detail as a followUp
      const owner = await guild.fetchOwner().catch(() => null);
      const detailLines = [
        `**Name:** ${guild.name}`,
        `**ID:** \`${guild.id}\``,
        `**Owner:** ${owner ? `${owner.user.tag} (\`${owner.id}\`)` : "Unknown"}`,
        `**Members:** ${guild.memberCount.toLocaleString()}`,
        `**Channels:** ${guild.channels.cache.size}`,
        `**Roles:** ${guild.roles.cache.size}`,
        `**Emojis:** ${guild.emojis.cache.size}`,
        `**Boosts:** ${guild.premiumSubscriptionCount ?? 0} (Tier ${guild.premiumTier})`,
        `**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
        `**Joined:** <t:${Math.floor((guild.joinedTimestamp ?? Date.now()) / 1000)}:R>`,
      ];

      const detailEmbed = lib.createEmbedBuilder().setTitle(`🏠 ${guild.name}`).setDescription(detailLines.join("\n"));

      if (guild.iconURL()) detailEmbed.setThumbnail(guild.iconURL({ size: 128 }));

      await ctx.originalInteraction.followUp({ embeds: [detailEmbed], ephemeral: true });
    }, PANEL_TTL);

    guildSelect.setPlaceholder("Select a guild for details…");
    for (const opt of selectOptions) {
      guildSelect.addOptions(opt);
    }

    await guildSelect.ready();
    rows.push(new ActionRowBuilder<any>().addComponents(guildSelect));
  }

  // ── Buttons ──────────────────────────────────────────────────────────────
  const backBtn = await createBackButton(ctx);

  const btnRow: any[] = [backBtn];

  if (currentPage > 0) {
    const prevBtn = lib
      .createButtonBuilder(async (i: ButtonInteraction) => {
        await i.deferUpdate();
        const result = await buildGuildsPanel(ctx, currentPage - 1);
        await ctx.originalInteraction.editReply({ embeds: result.embeds, components: result.components });
      }, PANEL_TTL)
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary);
    await prevBtn.ready();
    btnRow.push(prevBtn);
  }

  if (currentPage < totalPages - 1) {
    const nextBtn = lib
      .createButtonBuilder(async (i: ButtonInteraction) => {
        await i.deferUpdate();
        const result = await buildGuildsPanel(ctx, currentPage + 1);
        await ctx.originalInteraction.editReply({ embeds: result.embeds, components: result.components });
      }, PANEL_TTL)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary);
    await nextBtn.ready();
    btnRow.push(nextBtn);
  }

  // Leave guild button – opens a modal to enter guild ID + confirm
  const leaveBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      const modalId = nanoid();
      const modal = new ModalBuilder()
        .setCustomId(modalId)
        .setTitle("Leave Guild")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("guildId").setLabel("Guild ID").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("123456789012345678"),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("confirm").setLabel('Type "LEAVE" to confirm').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder("LEAVE"),
          ),
        );

      await i.showModal(modal);
      const submit = await i
        .awaitModalSubmit({
          filter: (s) => s.customId === modalId && s.user.id === i.user.id,
          time: 60_000,
        })
        .catch(() => null);

      if (!submit) return;

      const confirmValue = submit.fields.getTextInputValue("confirm").trim();
      if (confirmValue !== "LEAVE") {
        await submit.reply({ content: "❌ Confirmation failed. Expected `LEAVE`.", ephemeral: true });
        return;
      }

      const guildId = submit.fields.getTextInputValue("guildId").trim();
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        await submit.reply({ content: `❌ Guild \`${guildId}\` not found.`, ephemeral: true });
        return;
      }

      await submit.deferUpdate();

      try {
        const guildName = guild.name;
        await guild.leave();
        await ctx.originalInteraction.followUp({ content: `✅ Left **${guildName}** (\`${guildId}\`).`, ephemeral: true });
      } catch (err) {
        await ctx.originalInteraction.followUp({
          content: `❌ Failed to leave: ${err instanceof Error ? err.message : "Unknown error"}`,
          ephemeral: true,
        });
      }

      // Refresh the panel
      const result = await buildGuildsPanel(ctx, currentPage);
      await ctx.originalInteraction.editReply({ embeds: result.embeds, components: result.components });
    }, PANEL_TTL)
    .setLabel("🚪 Leave Guild")
    .setStyle(ButtonStyle.Danger);
  await leaveBtn.ready();
  btnRow.push(leaveBtn);

  const refreshBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      const result = await buildGuildsPanel(ctx, currentPage);
      await ctx.originalInteraction.editReply({ embeds: result.embeds, components: result.components });
    }, PANEL_TTL)
    .setLabel("🔄 Refresh")
    .setStyle(ButtonStyle.Primary);
  await refreshBtn.ready();
  btnRow.push(refreshBtn);

  rows.push(new ActionRowBuilder<any>().addComponents(...btnRow));

  return { embeds: [embed], components: rows };
}
