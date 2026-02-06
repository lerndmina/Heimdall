/**
 * WelcomeService — CRUD, template parsing, and message sending for welcome messages
 */

import type { Client, GuildMember, TextChannel } from "discord.js";
import { createLogger } from "../../../src/core/Logger.js";
import type { LibAPI } from "../../lib/index.js";
import WelcomeMessageModel, { type IWelcomeMessage } from "../models/WelcomeMessage.js";

const log = createLogger("welcome:service");

/**
 * Template variables available in welcome messages.
 * Each entry maps a placeholder to a resolver function and description.
 */
const TEMPLATE_VARIABLES: Record<string, { value: (member: GuildMember) => string; description: string }> = {
  "{username}": {
    value: (member) => member.user.username,
    description: "The member's Discord username",
  },
  "{displayname}": {
    value: (member) => member.displayName,
    description: "The display name (nickname or username)",
  },
  "{mention}": {
    value: (member) => `<@${member.id}>`,
    description: "A mention of the member",
  },
  "{id}": {
    value: (member) => member.id,
    description: "The member's Discord user ID",
  },
  "{guild}": {
    value: (member) => member.guild.name,
    description: "The name of the server",
  },
  "{membercount}": {
    value: (member) => member.guild.memberCount.toString(),
    description: "Total member count of the server",
  },
  "{newline}": {
    value: () => "\n",
    description: "A newline character",
  },
};

export class WelcomeService {
  private client: Client<true>;
  private lib: LibAPI;

  constructor(client: Client<true>, lib: LibAPI) {
    this.client = client;
    this.lib = lib;
  }

  // ── CRUD ────────────────────────────────────────────────

  /** Get the welcome config for a guild, or null. */
  async getConfig(guildId: string): Promise<(IWelcomeMessage & { _id: any; createdAt: Date; updatedAt: Date }) | null> {
    return WelcomeMessageModel.findOne({ guildId });
  }

  /** Create or update the welcome config (upsert). */
  async upsertConfig(guildId: string, channelId: string, message: string): Promise<IWelcomeMessage> {
    const doc = await WelcomeMessageModel.findOneAndUpdate({ guildId }, { guildId, channelId, message }, { upsert: true, new: true });
    return doc;
  }

  /** Delete the welcome config. Returns true if a config was deleted. */
  async deleteConfig(guildId: string): Promise<{ deleted: boolean; previous?: { channelId: string; message: string } }> {
    const existing = await WelcomeMessageModel.findOne({ guildId });
    if (!existing) return { deleted: false };

    const previous = { channelId: existing.channelId, message: existing.message };
    await WelcomeMessageModel.deleteOne({ guildId });
    return { deleted: true, previous };
  }

  // ── Template parsing ────────────────────────────────────

  /** Replace all template placeholders with member data. */
  parseMessage(template: string, member: GuildMember): string {
    let parsed = template;
    for (const [placeholder, { value }] of Object.entries(TEMPLATE_VARIABLES)) {
      const escaped = placeholder.replace(/[{}]/g, "\\$&");
      parsed = parsed.replace(new RegExp(escaped, "g"), value(member));
    }
    return parsed;
  }

  /** Return documentation for all available template variables. */
  getTemplateDocumentation(): Record<string, string> {
    return Object.fromEntries(Object.entries(TEMPLATE_VARIABLES).map(([key, { description }]) => [key, description]));
  }

  // ── Sending ─────────────────────────────────────────────

  /**
   * Send a welcome message for a member using the guild's config.
   * Can also be called with an ad-hoc config object for testing.
   */
  async sendWelcomeMessage(config: { channelId: string; message: string }, member: GuildMember): Promise<{ success: boolean; error?: string }> {
    try {
      const channel = await this.lib.thingGetter.getChannel(config.channelId);

      if (!channel) {
        log.error(`Welcome channel ${config.channelId} not found for guild ${member.guild.id}`);
        return { success: false, error: "Welcome channel not found" };
      }

      if (!channel.isTextBased() || channel.isDMBased()) {
        log.error(`Welcome channel ${config.channelId} is not a guild text channel`);
        return { success: false, error: "Channel is not a text channel" };
      }

      const textChannel = channel as TextChannel;

      // Permission check
      const permissions = textChannel.permissionsFor(this.client.user);
      if (!permissions?.has("SendMessages")) {
        log.error(`Bot lacks SendMessages permission in welcome channel ${config.channelId}`);
        return { success: false, error: "Missing SendMessages permission" };
      }

      const parsed = this.parseMessage(config.message, member);

      await textChannel.send({
        content: parsed,
        allowedMentions: { parse: ["users"] },
      });

      log.info(`Welcome message sent for ${member.user.username} in guild ${member.guild.name}`);
      return { success: true };
    } catch (error) {
      log.error("Error sending welcome message:", error);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }
}
