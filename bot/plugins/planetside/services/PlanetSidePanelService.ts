/**
 * PlanetSidePanelService — Persistent "Link PS2 Account" panel
 *
 * Posts a public embed with persistent buttons that let users:
 * - 🔗 Link Account — Opens a modal to enter their PS2 character name
 * - 📋 My Status — Shows their current linking status ephemerally
 * - ❌ Unlink Account — Lets them unlink their account
 *
 * Mirrors the Minecraft panel pattern.
 */

import { ActionRowBuilder, ButtonStyle, ChannelType, MessageFlags, type ButtonInteraction, type TextChannel } from "discord.js";
import type { LibAPI } from "../../lib/index.js";
import type { ComponentCallbackService } from "../../../src/core/services/ComponentCallbackService.js";
import type { PluginLogger } from "../../../src/types/Plugin.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import PlanetSidePlayer from "../models/PlanetSidePlayer.js";
import { PlanetSideApiService } from "./PlanetSideApiService.js";
import { getFactionEmoji, getServerName, formatBattleRank } from "../utils/census-helpers.js";
import { showAccountPanel } from "../utils/accountPanel.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";

export class PlanetSidePanelService {
  constructor(
    private lib: LibAPI,
    private componentCallbackService: ComponentCallbackService,
    private logger: PluginLogger,
    private apiService: PlanetSideApiService,
  ) {}

  /** Register all persistent handlers. Called once during plugin load. */
  initialize(): void {
    this.componentCallbackService.registerPersistentHandler("planetside.link", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleLinkButton(interaction);
    });

    this.componentCallbackService.registerPersistentHandler("planetside.status", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleStatusButton(interaction);
    });

    this.componentCallbackService.registerPersistentHandler("planetside.unlink", async (interaction) => {
      if (!interaction.isButton()) return;
      await this.handleUnlinkButton(interaction);
    });

    this.logger.debug("✅ PlanetSide panel persistent handlers registered");
  }

  /** Build and send the PS2 linking panel embed + buttons to a channel. */
  async sendPanel(channelId: string, guildId: string): Promise<{ success: boolean; messageUrl?: string; error?: string }> {
    try {
      const config = await PlanetSideConfig.findOne({ guildId }).lean();
      if (!config?.enabled) {
        return { success: false, error: "PlanetSide integration is not enabled. Configure it first." };
      }

      const channel = await this.lib.thingGetter.getChannel(channelId);
      if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        return { success: false, error: "Invalid text channel." };
      }

      const targetChannel = channel as TextChannel;
      const guild = targetChannel.guild;
      const botMember = guild.members.me;

      const displayTag = config.outfitTag ? `[${config.outfitTag}]` : "";
      const displayName = config.outfitName || "PlanetSide 2";

      // Template placeholders for description substitution
      const memberRoleMention = config.roles?.member ? `<@&${config.roles.member}>` : "the **Member** role";
      const guestRoleMention = config.roles?.guest ? `<@&${config.roles.guest}>` : "the **Guest** role";

      const placeholders: Record<string, string> = {
        memberRole: memberRoleMention,
        guestRole: guestRoleMention,
        outfitTag: displayTag,
        outfitName: displayName,
      };

      // ── Resolve panel embed values from config or defaults ──

      const panelTitle = config.panel?.title || "Get your role!";
      const panelColor = config.panel?.color ? parseInt(config.panel.color.replace("#", ""), 16) : 0xde3b79;
      const panelFooter = config.panel?.footerText || `${displayName} • PlanetSide 2 Account Linking`;
      const panelShowAuthor = config.panel?.showAuthor !== false;
      const panelShowTimestamp = config.panel?.showTimestamp !== false;

      let description: string;
      if (config.panel?.description) {
        // Custom description — substitute placeholders
        description = this.substitutePlaceholders(config.panel.description, placeholders);
      } else if (config.outfitTag) {
        // Default description for outfit-configured servers
        description =
          `Hello recruit! Click the button below and link your PlanetSide 2 account.\n\n` +
          `If you are in ${displayTag}, you will be given the ${memberRoleMention} role.\n\n` +
          `Guests are welcome too! If you are a guest, link your account and you will be given the ${guestRoleMention} role.`;
      } else {
        description = `Hello! Click the button below and link your PlanetSide 2 account.\n\n` + `Once verified, you will be given your role automatically.`;
      }

      const embed = this.lib.createEmbedBuilder().setTitle(panelTitle).setDescription(description).setColor(panelColor).setFooter({ text: panelFooter });

      if (panelShowTimestamp) {
        embed.setTimestamp(new Date());
      }

      if (panelShowAuthor && botMember) {
        embed.setAuthor({
          name: botMember.displayName || guild.client.user.username,
          iconURL: guild.client.user.displayAvatarURL(),
        });
      }

      // ── Buttons ──────────────────────────────────────────────

      const linkBtn = this.lib.createButtonBuilderPersistent("planetside.link", { guildId });
      linkBtn.setLabel("Link Account").setEmoji("🔗").setStyle(ButtonStyle.Primary);
      await linkBtn.ready();

      const statusBtn = this.lib.createButtonBuilderPersistent("planetside.status", { guildId });
      statusBtn.setLabel("My Status").setEmoji("📋").setStyle(ButtonStyle.Secondary);
      await statusBtn.ready();

      const unlinkBtn = this.lib.createButtonBuilderPersistent("planetside.unlink", { guildId });
      unlinkBtn.setLabel("Unlink Account").setEmoji("❌").setStyle(ButtonStyle.Danger);
      await unlinkBtn.ready();

      const row = new ActionRowBuilder<any>().addComponents(linkBtn, statusBtn, unlinkBtn);
      const message = await targetChannel.send({ embeds: [embed], components: [row] });

      await PlanetSideConfig.updateOne({ guildId }, { "channels.panel": channelId, panelMessageId: message.id });

      return { success: true, messageUrl: message.url };
    } catch (error) {
      this.logger.error("Failed to send PlanetSide panel:", error);
      return { success: false, error: "Failed to send panel. Check bot permissions." };
    }
  }

  /** Replace `{key}` placeholders in a template string. */
  private substitutePlaceholders(template: string, placeholders: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => placeholders[key] ?? match);
  }

  // ═══════════════════════════════════════════════════════════════
  // LINK BUTTON
  // ═══════════════════════════════════════════════════════════════

  private async handleLinkButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await showAccountPanel(interaction, this.lib, this.apiService);
  }

  // ═══════════════════════════════════════════════════════════════
  // STATUS BUTTON
  // ═══════════════════════════════════════════════════════════════

  private async handleStatusButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const discordId = interaction.user.id;

    const config = await PlanetSideConfig.findOne({ guildId }).lean();
    if (!config?.enabled) {
      await interaction.editReply("❌ PlanetSide linking is not currently enabled.");
      return;
    }

    // Check for linked account
    const linkedPlayer = await PlanetSidePlayer.findOne({ guildId, discordId, linkedAt: { $ne: null } }).lean();

    // Check for pending verification
    const pendingPlayer = await PlanetSidePlayer.findOne({
      guildId,
      discordId,
      linkedAt: null,
      verificationStartedAt: { $ne: null },
    });

    if (!linkedPlayer && !pendingPlayer) {
      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("❓ No Account Linked")
        .setDescription("You don't have a PlanetSide 2 account linked.\n\nClick **Link Account** to get started!");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // If linked, show status
    if (linkedPlayer) {
      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("🎮 Your PlanetSide 2 Account")
        .addFields(
          { name: "Character", value: `${getFactionEmoji(linkedPlayer.factionId ?? 0)} **${linkedPlayer.characterName}**`, inline: true },
          { name: "Battle Rank", value: formatBattleRank(linkedPlayer.battleRank || 0, linkedPlayer.prestige || 0), inline: true },
          { name: "Server", value: getServerName(linkedPlayer.serverId || 0), inline: true },
          { name: "Linked", value: `<t:${Math.floor(new Date(linkedPlayer.linkedAt!).getTime() / 1000)}:R>`, inline: true },
        );

      if (linkedPlayer.outfitTag) {
        embed.addFields({ name: "Outfit", value: `[${linkedPlayer.outfitTag}] ${linkedPlayer.outfitName || ""}`, inline: true });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // If pending, attempt verification
    if (pendingPlayer) {
      const verifyResult = await this.apiService.verifyCharacter(
        pendingPlayer.characterId,
        (config.verificationMethod as "online_now" | "recent_login") || "online_now",
        config.verificationWindowMinutes || 60,
        { honuBaseUrl: config.honuBaseUrl ?? undefined, censusServiceId: config.censusServiceId ?? undefined },
      );

      if (verifyResult.verified) {
        // Link the account
        pendingPlayer.linkedAt = new Date();
        pendingPlayer.verifiedAt = new Date();
        pendingPlayer.verificationResult = JSON.stringify(verifyResult);
        await pendingPlayer.save();

        // Assign roles
        await this.assignRoles(guildId, discordId, config, pendingPlayer);

        broadcastDashboardChange(guildId, "planetside", "player_linked", { requiredAction: "planetside.view_players" });

        const embed = this.lib
          .createEmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ Account Linked!")
          .setDescription(`**${pendingPlayer.characterName}** has been linked to your Discord account!\n\n` + verifyResult.detail);
        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = this.lib
          .createEmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Verification Failed")
          .setDescription(
            `${verifyResult.detail}\n\n` +
              (config.verificationMethod === "online_now"
                ? "Make sure you are **logged in to PlanetSide 2** on this character, then try again."
                : "Make sure you have **recently logged in** to PlanetSide 2 on this character."),
          );
        await interaction.editReply({ embeds: [embed] });
      }
    }
  }

  /** Assign configured roles after successful linking */
  private async assignRoles(guildId: string, discordId: string, config: any, player: any): Promise<void> {
    try {
      const guild = await this.lib.thingGetter.getGuild(guildId);
      if (!guild) return;

      const member = await this.lib.thingGetter.getMember(guild, discordId);
      if (!member) return;

      const rolesToAdd: string[] = [];

      // Member role (outfit members)
      if (config.roles?.member && config.outfitId && player.outfitId === config.outfitId) {
        rolesToAdd.push(config.roles.member);
      }

      // Guest role (non-outfit members)
      if (config.roles?.guest && (!config.outfitId || player.outfitId !== config.outfitId)) {
        rolesToAdd.push(config.roles.guest);
      }

      for (const roleId of rolesToAdd) {
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId).catch((err: Error) => {
            this.logger.warn(`Failed to add role ${roleId} to ${discordId}:`, err);
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to assign roles for ${discordId}:`, error);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // UNLINK BUTTON
  // ═══════════════════════════════════════════════════════════════

  private async handleUnlinkButton(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const discordId = interaction.user.id;

    const config = await PlanetSideConfig.findOne({ guildId }).lean();
    if (config && config.allowSelfUnlink === false) {
      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔒 Unlinking Requires Staff")
        .setDescription("Self-unlinking is disabled on this server. Please contact a staff member.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const linkedPlayer = await PlanetSidePlayer.findOne({ guildId, discordId, linkedAt: { $ne: null } }).lean();
    if (!linkedPlayer) {
      // Also check for pending
      const pending = await PlanetSidePlayer.findOne({ guildId, discordId, linkedAt: null });
      if (pending) {
        await PlanetSidePlayer.findByIdAndDelete(pending._id);
        broadcastDashboardChange(guildId, "planetside", "player_unlinked", { requiredAction: "planetside.view_players" });
        const embed = this.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Pending Link Cancelled").setDescription("Your pending link request has been removed.");
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const embed = this.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ No Account to Unlink").setDescription("You don't have a linked PlanetSide 2 account.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const confirmEmbed = this.lib
      .createEmbedBuilder()
      .setColor(0xff0000)
      .setTitle("⚠️ Unlink Account")
      .setDescription(`Are you sure you want to unlink **${linkedPlayer.characterName}**?\n\n` + `This will remove your linked roles.`);

    const confirmBtn = this.lib.createButtonBuilder(async (i) => {
      await PlanetSidePlayer.findByIdAndDelete(linkedPlayer._id);

      // Remove roles
      await this.removeRoles(guildId, discordId, config);

      broadcastDashboardChange(guildId, "planetside", "player_unlinked", { requiredAction: "planetside.view_players" });

      const doneEmbed = this.lib
        .createEmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("✅ Account Unlinked")
        .setDescription(`**${linkedPlayer.characterName}** has been unlinked.\n\nClick **Link Account** to link a new character.`);
      await i.update({ embeds: [doneEmbed], components: [] });
    }, 120);
    confirmBtn.setLabel("Yes, Unlink").setStyle(ButtonStyle.Danger);
    await confirmBtn.ready();

    const cancelBtn = this.lib.createButtonBuilder(async (i) => {
      await i.update({ content: "Cancelled.", embeds: [], components: [] });
    }, 120);
    cancelBtn.setLabel("Cancel").setStyle(ButtonStyle.Secondary);
    await cancelBtn.ready();

    const row = new ActionRowBuilder<any>().addComponents(confirmBtn, cancelBtn);
    await interaction.editReply({ embeds: [confirmEmbed], components: [row] });
  }

  /** Remove configured roles after unlinking */
  private async removeRoles(guildId: string, discordId: string, config: any): Promise<void> {
    try {
      const guild = await this.lib.thingGetter.getGuild(guildId);
      if (!guild) return;

      const member = await this.lib.thingGetter.getMember(guild, discordId);
      if (!member) return;

      const rolesToRemove = [config?.roles?.member, config?.roles?.guest].filter(Boolean) as string[];
      for (const roleId of rolesToRemove) {
        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId).catch((err: Error) => {
            this.logger.warn(`Failed to remove role ${roleId} from ${discordId}:`, err);
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove roles for ${discordId}:`, error);
    }
  }
}
