import { ActionRowBuilder, ButtonStyle, type ButtonInteraction, type ColorResolvable, type GuildTextBasedChannel, type GuildMember, type MessageActionRowComponentBuilder } from "discord.js";
import { nanoid } from "nanoid";
import { createLogger } from "../../../src/core/Logger.js";
import type { HeimdallClient } from "../../../src/types/Client.js";
import type { LibAPI } from "../../lib/index.js";
import RoleButtonPanel, { type IRoleButtonPanel } from "../models/RoleButtonPanel.js";

const log = createLogger("rolebuttons:service");

type PanelDoc = IRoleButtonPanel & { _id: unknown; createdAt: Date; updatedAt: Date };

interface PersistentMetadata {
  panelId?: string;
  buttonId?: string;
  roleId?: string;
  mode?: "toggle" | "add" | "remove";
}

export class RoleButtonService {
  async createPanel(guildId: string, name: string, createdBy: string): Promise<PanelDoc> {
    const existing = await RoleButtonPanel.findOne({ guildId, name: name.trim() });
    if (existing) throw new Error("Panel name already exists");

    const panel = await RoleButtonPanel.create({
      id: nanoid(),
      guildId,
      name: name.trim(),
      embed: {},
      buttons: [],
      exclusive: false,
      posts: [],
      createdBy,
    });

    return panel as unknown as PanelDoc;
  }

  async getPanel(guildId: string, panelId: string): Promise<PanelDoc | null> {
    return (await RoleButtonPanel.findOne({ guildId, id: panelId })) as PanelDoc | null;
  }

  async listPanels(guildId: string): Promise<PanelDoc[]> {
    return (await RoleButtonPanel.find({ guildId }).sort({ createdAt: -1 })) as PanelDoc[];
  }

  async updatePanel(guildId: string, panelId: string, updates: Partial<IRoleButtonPanel>): Promise<PanelDoc | null> {
    const payload: Record<string, unknown> = {};

    if (updates.name !== undefined) payload.name = String(updates.name).trim();
    if (updates.embed !== undefined) payload.embed = updates.embed;
    if (updates.buttons !== undefined) {
      const buttons = Array.isArray(updates.buttons) ? updates.buttons : [];
      if (buttons.length > 25) throw new Error("Panels support at most 25 buttons");
      payload.buttons = buttons;
    }
    if (updates.exclusive !== undefined) payload.exclusive = !!updates.exclusive;
    if (updates.posts !== undefined) payload.posts = updates.posts;

    return (await RoleButtonPanel.findOneAndUpdate({ guildId, id: panelId }, { $set: payload }, { new: true, runValidators: true })) as PanelDoc | null;
  }

  async deletePanel(guildId: string, panelId: string): Promise<PanelDoc | null> {
    return (await RoleButtonPanel.findOneAndDelete({ guildId, id: panelId })) as PanelDoc | null;
  }

  async buildPanelMessage(panel: PanelDoc, lib: LibAPI): Promise<{ embeds: any[]; components: ActionRowBuilder<MessageActionRowComponentBuilder>[] }> {
    const embed = lib.createEmbedBuilder();

    if (panel.embed?.title) embed.setTitle(panel.embed.title);
    if (panel.embed?.description) embed.setDescription(panel.embed.description);
    if (panel.embed?.color) embed.setColor(panel.embed.color as ColorResolvable);
    if (panel.embed?.image) embed.setImage(panel.embed.image);
    if (panel.embed?.thumbnail) embed.setThumbnail(panel.embed.thumbnail);
    if (panel.embed?.footer) embed.setFooter({ text: panel.embed.footer });
    if (panel.embed?.fields?.length) {
      embed.addFields(
        panel.embed.fields.map((field) => ({
          name: field.name,
          value: field.value,
          inline: !!field.inline,
        })),
      );
    }

    const rows = new Map<number, ActionRowBuilder<MessageActionRowComponentBuilder>>();
    for (const button of panel.buttons ?? []) {
      const builder = lib.createButtonBuilderPersistent("rolebuttons.assign", {
        panelId: panel.id,
        buttonId: button.id,
        roleId: button.roleId,
        mode: button.mode,
      });

      builder
        .setLabel(button.label)
        .setStyle((button.style || ButtonStyle.Secondary) as ButtonStyle)
        .setDisabled(!button.roleId);

      if (button.emoji) builder.setEmoji(button.emoji);

      await builder.ready();

      const rowNum = Math.max(0, Math.min(4, button.row ?? 0));
      const row = rows.get(rowNum) ?? new ActionRowBuilder<MessageActionRowComponentBuilder>();
      if (row.components.length < 5) {
        row.addComponents(builder as MessageActionRowComponentBuilder);
        rows.set(rowNum, row);
      }
    }

    const sortedRows = [...rows.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
    const embeds = panel.embed && Object.keys(panel.embed).length > 0 ? [embed] : [];

    return { embeds, components: sortedRows };
  }

  async postPanel(panel: PanelDoc, channel: GuildTextBasedChannel, userId: string, lib: LibAPI): Promise<PanelDoc> {
    if (!channel.isTextBased()) throw new Error("Target channel is not text-based");
    if (!panel.buttons?.length) throw new Error("Panel has no buttons configured");

    const payload = await this.buildPanelMessage(panel, lib);
    const message = await channel.send(payload as any);

    panel.posts.push({
      channelId: message.channelId,
      messageId: message.id,
      postedAt: new Date(),
      postedBy: userId,
    } as any);

    await (panel as any).save();
    return panel;
  }

  async updatePostedPanels(panel: PanelDoc, client: HeimdallClient, lib: LibAPI): Promise<{ updated: number; removed: number }> {
    const payload = await this.buildPanelMessage(panel, lib);
    let updated = 0;
    let removed = 0;
    const nextPosts: typeof panel.posts = [] as any;

    for (const post of panel.posts ?? []) {
      try {
        const guild = await client.guilds.fetch(panel.guildId);
        const channel = await guild.channels.fetch(post.channelId);
        if (!channel || !channel.isTextBased()) {
          removed += 1;
          continue;
        }
        const message = await channel.messages.fetch(post.messageId);
        await message.edit(payload as any);
        updated += 1;
        nextPosts.push(post as any);
      } catch {
        removed += 1;
      }
    }

    panel.posts = nextPosts as any;
    await (panel as any).save();
    return { updated, removed };
  }

  async handleRoleAssignment(interaction: ButtonInteraction, metadata: PersistentMetadata): Promise<void> {
    const panelId = metadata.panelId;
    const buttonId = metadata.buttonId;
    const roleId = metadata.roleId;
    const mode = metadata.mode;

    if (!panelId || !buttonId || !roleId || !mode || !interaction.guild) {
      await interaction.reply({ content: "❌ This role button is invalid or expired.", ephemeral: true });
      return;
    }

    const panel = (await RoleButtonPanel.findOne({ guildId: interaction.guild.id, id: panelId })) as PanelDoc | null;
    if (!panel) {
      await interaction.reply({ content: "❌ This role panel no longer exists.", ephemeral: true });
      return;
    }

    const role = interaction.guild.roles.cache.get(roleId) ?? (await interaction.guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
      await interaction.reply({ content: "❌ That role no longer exists.", ephemeral: true });
      return;
    }

    const member = ((interaction.member as GuildMember | null) ?? (await interaction.guild.members.fetch(interaction.user.id).catch(() => null))) as GuildMember | null;
    if (!member) {
      await interaction.reply({ content: "❌ Could not resolve your guild member record.", ephemeral: true });
      return;
    }

    const hasRole = member.roles.cache.has(role.id);
    const wantsAdd = mode === "add" || (mode === "toggle" && !hasRole);

    if (panel.exclusive && wantsAdd) {
      const otherRoleIds = (panel.buttons ?? []).map((button) => button.roleId).filter((id) => id && id !== role.id);
      const toRemove = otherRoleIds.filter((id) => member.roles.cache.has(id));
      if (toRemove.length > 0) {
        await member.roles.remove(toRemove, `RoleButtons exclusive panel (${panel.name})`).catch(() => null);
      }
    }

    try {
      if (mode === "add") {
        if (hasRole) {
          await interaction.reply({ content: `ℹ️ You already have **${role.name}**.`, ephemeral: true });
          return;
        }
        await member.roles.add(role, `RoleButtons add (${panel.name})`);
        await interaction.reply({ content: `✅ Added **${role.name}**.`, ephemeral: true });
        return;
      }

      if (mode === "remove") {
        if (!hasRole) {
          await interaction.reply({ content: `ℹ️ You don't have **${role.name}**.`, ephemeral: true });
          return;
        }
        await member.roles.remove(role, `RoleButtons remove (${panel.name})`);
        await interaction.reply({ content: `✅ Removed **${role.name}**.`, ephemeral: true });
        return;
      }

      if (hasRole) {
        await member.roles.remove(role, `RoleButtons toggle (${panel.name})`);
        await interaction.reply({ content: `✅ Removed **${role.name}**.`, ephemeral: true });
      } else {
        await member.roles.add(role, `RoleButtons toggle (${panel.name})`);
        await interaction.reply({ content: `✅ Added **${role.name}**.`, ephemeral: true });
      }
    } catch (error) {
      log.warn("Role assignment failed", error);
      await interaction.reply({
        content: "❌ Couldn't update your roles. The bot may be missing `Manage Roles` or the role is above the bot.",
        ephemeral: true,
      });
    }
  }

  async cleanupDeletedRole(guildId: string, roleId: string, client: HeimdallClient, lib: LibAPI): Promise<{ affectedPanels: number }> {
    const panels = (await RoleButtonPanel.find({ guildId, "buttons.roleId": roleId })) as PanelDoc[];
    let affectedPanels = 0;

    for (const panel of panels) {
      const before = panel.buttons.length;
      panel.buttons = panel.buttons.filter((button) => button.roleId !== roleId) as any;
      if (panel.buttons.length !== before) {
        affectedPanels += 1;
        await (panel as any).save();
        await this.updatePostedPanels(panel, client, lib).catch(() => null);
      }
    }

    return { affectedPanels };
  }
}
