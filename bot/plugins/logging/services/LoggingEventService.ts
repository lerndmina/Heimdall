/**
 * LoggingEventService — Builds and sends log embeds for Discord events
 *
 * Centralized handler that checks config, builds rich embeds, and sends
 * them to the configured logging channels. Includes edit debouncing.
 */

import {
  type Client,
  type Message,
  type PartialMessage,
  type User,
  type PartialUser,
  type GuildMember,
  type PartialGuildMember,
  type GuildBan,
  type GuildTextBasedChannel,
  type ReadonlyCollection,
  TextChannel,
} from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { LibAPI } from "../../lib/index.js";
import { LoggingService } from "./LoggingService.js";
import { LoggingCategory, MessageSubcategory, UserSubcategory, ModerationSubcategory } from "../models/LoggingConfig.js";

const log = createLogger("logging:events");

export class LoggingEventService {
  private service: LoggingService;
  private lib: LibAPI;
  private recentEdits: Map<string, number> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly DEBOUNCE_MS = 2000;

  constructor(service: LoggingService, lib: LibAPI) {
    this.service = service;
    this.lib = lib;
    this.startCleanup();
  }

  /** Stop the debounce cleanup interval */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, ts] of this.recentEdits.entries()) {
        if (now - ts > 300_000) this.recentEdits.delete(id);
      }
    }, 300_000);
  }

  // ── Message Events ─────────────────────────────────────

  async handleMessageDelete(message: Message | PartialMessage): Promise<void> {
    try {
      if (message.author?.bot) return;
      // Don't bail on no content — partial messages (uncached) have null content
      // but we still want to log that a deletion occurred.

      const guildId = message.guild?.id;
      if (!guildId) return;

      const cfg = await this.service.getCategoryChannel(guildId, LoggingCategory.MESSAGES);
      if (!cfg) return;
      if (!this.service.isSubcategoryEnabled(cfg.subcategories, MessageSubcategory.DELETES)) return;

      const logChannel =
        (message.guild?.channels.cache.get(cfg.channelId) ??
          (await this.lib.thingGetter.getChannel(cfg.channelId))) as TextChannel | null;
      if (!logChannel?.isTextBased()) return;

      const isPartial = message.partial || message.content === null;

      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🗑️ Message Deleted")
        .setDescription(`Message deleted in ${message.channel}`)
        .addFields(
          { name: "Author", value: message.author ? `${message.author.tag} (${message.author})` : "*Unknown*", inline: true },
          { name: "Channel", value: `${message.channel}`, inline: true },
          { name: "Message ID", value: message.id, inline: true },
        )
        .setTimestamp();

      if (isPartial) {
        embed.addFields({ name: "Content", value: "*Not available — message was not cached*" });
      } else if (message.content) {
        const content = message.content.length > 1024 ? `${message.content.substring(0, 1021)}...` : message.content;
        embed.addFields({ name: "Content", value: content });
      }

      if (!isPartial && message.attachments && message.attachments.size > 0) {
        const list = message.attachments.map((a) => `• [${a.name}](${a.url})`).join("\n");
        embed.addFields({
          name: `📎 Attachments (${message.attachments.size})`,
          value: list.length > 1024 ? `${list.substring(0, 1021)}...` : list,
        });
      }

      if (!isPartial && message.stickers && message.stickers.size > 0) {
        embed.addFields({
          name: `🎨 Stickers (${message.stickers.size})`,
          value: message.stickers.map((s) => `• ${s.name}`).join("\n"),
        });
      }

      if (message.author) {
        embed.setThumbnail(message.author.displayAvatarURL({ size: 64 }));
        embed.setFooter({ text: `User ID: ${message.author.id}` });
      }

      await (logChannel as TextChannel).send({ embeds: [embed] });
    } catch (error) {
      log.error("handleMessageDelete error:", error);
    }
  }

  async handleMessageUpdate(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
    try {
      if (newMessage.author?.bot) return;
      // If either side is partial/uncached we can't show a meaningful before/after diff
      if (oldMessage.partial || newMessage.partial) return;
      if (!oldMessage.content || !newMessage.content) return;
      if (oldMessage.content === newMessage.content) return;

      // Debounce rapid edits
      const now = Date.now();
      const last = this.recentEdits.get(newMessage.id);
      if (last && now - last < this.DEBOUNCE_MS) return;

      const guildId = newMessage.guild?.id;
      if (!guildId) return;

      const cfg = await this.service.getCategoryChannel(guildId, LoggingCategory.MESSAGES);
      if (!cfg) return;
      if (!this.service.isSubcategoryEnabled(cfg.subcategories, MessageSubcategory.EDITS)) return;

      const logChannel =
        (newMessage.guild?.channels.cache.get(cfg.channelId) ??
          (await this.lib.thingGetter.getChannel(cfg.channelId))) as TextChannel | null;
      if (!logChannel?.isTextBased()) return;

      this.recentEdits.set(newMessage.id, now);

      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0xffa500)
        .setTitle("✏️ Message Edited")
        .setDescription(`Message edited in ${newMessage.channel}\n[Jump to Message](${newMessage.url})`)
        .addFields(
          { name: "Author", value: `${newMessage.author!.tag} (${newMessage.author})`, inline: true },
          { name: "Channel", value: `${newMessage.channel}`, inline: true },
          { name: "Message ID", value: newMessage.id, inline: true },
        )
        .setFooter({ text: `User ID: ${newMessage.author!.id}` })
        .setTimestamp();

      const oldContent = oldMessage.content.length > 1024 ? `${oldMessage.content.substring(0, 1021)}...` : oldMessage.content;
      const newContent = newMessage.content.length > 1024 ? `${newMessage.content.substring(0, 1021)}...` : newMessage.content;

      embed.addFields({ name: "Before", value: oldContent || "*Empty*" }, { name: "After", value: newContent || "*Empty*" });

      if (newMessage.author) {
        embed.setThumbnail(newMessage.author.displayAvatarURL({ size: 64 }));
      }

      await (logChannel as TextChannel).send({ embeds: [embed] });
    } catch (error) {
      log.error("handleMessageUpdate error:", error);
    }
  }

  async handleMessageBulkDelete(messages: ReadonlyCollection<string, Message | PartialMessage>, channel: GuildTextBasedChannel): Promise<void> {
    try {
      const guildId = channel.guild?.id;
      if (!guildId) return;

      const cfg = await this.service.getCategoryChannel(guildId, LoggingCategory.MESSAGES);
      if (!cfg) return;
      if (!this.service.isSubcategoryEnabled(cfg.subcategories, MessageSubcategory.BULK_DELETES)) return;

      const logChannel =
        (channel.guild.channels.cache.get(cfg.channelId) ??
          (await this.lib.thingGetter.getChannel(cfg.channelId))) as TextChannel | null;
      if (!logChannel?.isTextBased()) return;

      const authorCounts = new Map<string, number>();
      let totalUser = 0;
      let botCount = 0;

      for (const [, msg] of messages) {
        if (msg.author?.bot) {
          botCount++;
        } else {
          totalUser++;
          const uid = msg.author?.id ?? "Unknown";
          authorCounts.set(uid, (authorCounts.get(uid) ?? 0) + 1);
        }
      }

      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle("🗑️ Bulk Message Deletion")
        .setDescription(`${messages.size} messages deleted in ${channel}`)
        .addFields({ name: "Channel", value: `${channel}`, inline: true }, { name: "User Messages", value: `${totalUser}`, inline: true }, { name: "Bot Messages", value: `${botCount}`, inline: true })
        .setTimestamp();

      if (authorCounts.size > 0 && authorCounts.size <= 10) {
        const list = Array.from(authorCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([uid, count]) => `<@${uid}>: ${count} message${count > 1 ? "s" : ""}`)
          .join("\n");
        embed.addFields({ name: "Messages by Author", value: list });
      } else if (authorCounts.size > 10) {
        embed.addFields({ name: "Messages by Author", value: `Too many authors to display (${authorCounts.size} users)` });
      }

      await (logChannel as TextChannel).send({ embeds: [embed] });
    } catch (error) {
      log.error("handleMessageBulkDelete error:", error);
    }
  }

  // ── User Events ────────────────────────────────────────

  async handleUserUpdate(oldUser: User | PartialUser, newUser: User, client: Client): Promise<void> {
    try {
      const guildsWithUser = client.guilds.cache.filter((g) => g.members.cache.has(newUser.id));

      for (const [guildId, guild] of guildsWithUser) {
        const cfg = await this.service.getCategoryChannel(guildId, LoggingCategory.USERS);
        if (!cfg) continue;
        if (!this.service.isSubcategoryEnabled(cfg.subcategories, UserSubcategory.PROFILE_UPDATES)) continue;

        const logChannel = guild.channels.cache.get(cfg.channelId);
        if (!logChannel?.isTextBased()) continue;

        const embed = this.lib
          .createEmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("👤 User Updated")
          .setThumbnail(newUser.displayAvatarURL({ size: 256 }))
          .setFooter({ text: `User ID: ${newUser.id}` })
          .setTimestamp();

        let hasChanges = false;

        if (oldUser.username !== newUser.username) {
          embed.addFields({ name: "📝 Username Changed", value: `**Old:** ${oldUser.username}\n**New:** ${newUser.username}` });
          hasChanges = true;
        }

        if (oldUser.globalName !== newUser.globalName) {
          embed.addFields({ name: "✏️ Display Name Changed", value: `**Old:** ${oldUser.globalName ?? "None"}\n**New:** ${newUser.globalName ?? "None"}` });
          hasChanges = true;
        }

        if (oldUser.avatar !== newUser.avatar) {
          embed.addFields({ name: "🖼️ Avatar Changed", value: "User changed their profile picture" });
          embed.setImage(newUser.displayAvatarURL({ size: 512 }));
          if (oldUser.avatar) {
            embed.addFields({ name: "Old Avatar", value: `[View Old Avatar](${oldUser.displayAvatarURL({ size: 512 })})`, inline: true });
          }
          hasChanges = true;
        }

        if (oldUser.banner !== newUser.banner) {
          const oldBanner = oldUser.banner ? `[View](${oldUser.bannerURL({ size: 1024 })})` : "None";
          const newBanner = newUser.banner ? `[View](${newUser.bannerURL({ size: 1024 })})` : "None";
          embed.addFields({ name: "🎨 Banner Changed", value: `**Old:** ${oldBanner}\n**New:** ${newBanner}` });
          hasChanges = true;
        }

        if (hasChanges) {
          await (logChannel as TextChannel).send({ embeds: [embed] });
        }
      }
    } catch (error) {
      log.error("handleUserUpdate error:", error);
    }
  }

  async handleGuildMemberUpdate(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember): Promise<void> {
    try {
      const guildId = newMember.guild.id;

      const cfg = await this.service.getCategoryChannel(guildId, LoggingCategory.USERS);
      if (!cfg) return;
      if (!this.service.isSubcategoryEnabled(cfg.subcategories, UserSubcategory.MEMBER_UPDATES)) return;

      const logChannel = newMember.guild.channels.cache.get(cfg.channelId);
      if (!logChannel?.isTextBased()) return;

      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("👤 Member Updated")
        .setThumbnail(newMember.user.displayAvatarURL({ size: 256 }))
        .setDescription(`${newMember.user.tag} (${newMember.user})`)
        .setFooter({ text: `User ID: ${newMember.user.id}` })
        .setTimestamp();

      let hasChanges = false;

      // Nickname
      if (oldMember.nickname !== newMember.nickname) {
        embed.addFields({ name: "📝 Nickname Changed", value: `**Old:** ${oldMember.nickname ?? "None"}\n**New:** ${newMember.nickname ?? "None"}` });
        hasChanges = true;
      }

      // Roles
      const oldRoles = oldMember.roles.cache;
      const newRoles = newMember.roles.cache;
      const added = newRoles.filter((r) => !oldRoles.has(r.id));
      const removed = oldRoles.filter((r) => !newRoles.has(r.id));

      if (added.size > 0) {
        embed.addFields({ name: "➕ Roles Added", value: added.map((r) => r.toString()).join(", ") });
        hasChanges = true;
      }
      if (removed.size > 0) {
        embed.addFields({ name: "➖ Roles Removed", value: removed.map((r) => r.toString()).join(", ") });
        hasChanges = true;
      }

      // Timeout
      if (oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil) {
        if (newMember.communicationDisabledUntil) {
          const ts = Math.floor(newMember.communicationDisabledUntil.getTime() / 1000);
          embed.addFields({ name: "🔇 Timeout Applied", value: `Until <t:${ts}:F> (<t:${ts}:R>)` });
        } else {
          embed.addFields({ name: "🔊 Timeout Removed", value: "Timeout has been removed" });
        }
        hasChanges = true;
      }

      if (hasChanges) {
        await (logChannel as TextChannel).send({ embeds: [embed] });
      }
    } catch (error) {
      log.error("handleGuildMemberUpdate error:", error);
    }
  }

  // ── Moderation Events ──────────────────────────────────

  async handleBanAdd(ban: GuildBan): Promise<void> {
    try {
      const guildId = ban.guild.id;

      const cfg = await this.service.getCategoryChannel(guildId, LoggingCategory.MODERATION);
      if (!cfg) return;
      if (!this.service.isSubcategoryEnabled(cfg.subcategories, ModerationSubcategory.BANS)) return;

      const logChannel = ban.guild.channels.cache.get(cfg.channelId);
      if (!logChannel?.isTextBased()) return;

      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🔨 Member Banned")
        .setThumbnail(ban.user.displayAvatarURL({ size: 256 }))
        .addFields({ name: "User", value: `${ban.user.tag} (${ban.user})`, inline: true }, { name: "Reason", value: ban.reason ?? "No reason provided", inline: true })
        .setFooter({ text: `User ID: ${ban.user.id}` })
        .setTimestamp();

      await (logChannel as TextChannel).send({ embeds: [embed] });
    } catch (error) {
      log.error("handleBanAdd error:", error);
    }
  }

  async handleBanRemove(ban: GuildBan): Promise<void> {
    try {
      const guildId = ban.guild.id;

      const cfg = await this.service.getCategoryChannel(guildId, LoggingCategory.MODERATION);
      if (!cfg) return;
      if (!this.service.isSubcategoryEnabled(cfg.subcategories, ModerationSubcategory.UNBANS)) return;

      const logChannel = ban.guild.channels.cache.get(cfg.channelId);
      if (!logChannel?.isTextBased()) return;

      const embed = this.lib
        .createEmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🔓 Member Unbanned")
        .setThumbnail(ban.user.displayAvatarURL({ size: 256 }))
        .addFields({ name: "User", value: `${ban.user.tag} (${ban.user})`, inline: true })
        .setFooter({ text: `User ID: ${ban.user.id}` })
        .setTimestamp();

      await (logChannel as TextChannel).send({ embeds: [embed] });
    } catch (error) {
      log.error("handleBanRemove error:", error);
    }
  }

  // ── Moderation Log Methods (for moderation plugin) ─────

  /**
   * Send an automod log embed to the MODERATION category channel.
   * Used by the moderation plugin when automod rules trigger.
   */
  async sendAutomodLog(guildId: string, embed: any): Promise<boolean> {
    try {
      const cfg = await this.service.getCategoryChannel(guildId, LoggingCategory.MODERATION);
      if (!cfg) return false;
      if (!this.service.isSubcategoryEnabled(cfg.subcategories, ModerationSubcategory.AUTOMOD)) return false;

      const guild = await this.lib.thingGetter.getGuild(guildId);
      if (!guild) return false;

      const logChannel = guild.channels.cache.get(cfg.channelId);
      if (!logChannel?.isTextBased()) return false;

      await (logChannel as TextChannel).send({ embeds: [embed] });
      return true;
    } catch (error) {
      log.error("sendAutomodLog error:", error);
      return false;
    }
  }

  /**
   * Send a mod action log embed to the MODERATION category channel.
   * Used by the moderation plugin for manual actions (kick, ban, warn, mute, purge).
   */
  async sendModActionLog(guildId: string, embed: any): Promise<boolean> {
    try {
      const cfg = await this.service.getCategoryChannel(guildId, LoggingCategory.MODERATION);
      if (!cfg) return false;
      if (!this.service.isSubcategoryEnabled(cfg.subcategories, ModerationSubcategory.MOD_ACTIONS)) return false;

      const guild = await this.lib.thingGetter.getGuild(guildId);
      if (!guild) return false;

      const logChannel = guild.channels.cache.get(cfg.channelId);
      if (!logChannel?.isTextBased()) return false;

      await (logChannel as TextChannel).send({ embeds: [embed] });
      return true;
    } catch (error) {
      log.error("sendModActionLog error:", error);
      return false;
    }
  }
}
