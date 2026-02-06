import type { Client, Guild, GuildMember, User, Role, Channel, Message, TextBasedChannel } from "discord.js";

/**
 * ThingGetter - Cache-first Discord entity fetching utility
 *
 * CRITICAL: Always use ThingGetter instead of cache.get() for Discord entities.
 *
 * Why: Discord.js caches are not always populated. ThingGetter checks cache first,
 * then falls back to API fetch if not found. Returns null on failure instead of throwing.
 */
export class ThingGetter {
  constructor(private client: Client) {}

  /**
   * Fetch a user by ID (cache-first, then API)
   */
  async getUser(userId: string): Promise<User | null> {
    try {
      const cached = this.client.users.cache.get(userId);
      if (cached) return cached;
      return await this.client.users.fetch(userId);
    } catch {
      return null;
    }
  }

  /**
   * Fetch a guild by ID (cache-first, then API)
   */
  async getGuild(guildId: string): Promise<Guild | null> {
    try {
      const cached = this.client.guilds.cache.get(guildId);
      if (cached) return cached;
      return await this.client.guilds.fetch(guildId);
    } catch {
      return null;
    }
  }

  /**
   * Fetch a guild member by ID (cache-first, then API)
   */
  async getMember(guild: Guild, userId: string): Promise<GuildMember | null> {
    try {
      const cached = guild.members.cache.get(userId);
      if (cached) return cached;
      return await guild.members.fetch(userId);
    } catch {
      return null;
    }
  }

  /**
   * Fetch a role by ID (cache-first, then API)
   */
  async getRole(guild: Guild, roleId: string): Promise<Role | null> {
    try {
      const cached = guild.roles.cache.get(roleId);
      if (cached) return cached;
      const roles = await guild.roles.fetch();
      return roles.get(roleId) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a channel by ID (cache-first, then API)
   */
  async getChannel(channelId: string): Promise<Channel | null> {
    try {
      const cached = this.client.channels.cache.get(channelId);
      if (cached) return cached;
      return await this.client.channels.fetch(channelId);
    } catch {
      return null;
    }
  }

  /**
   * Fetch a message from a channel by ID
   */
  async getMessage(channel: TextBasedChannel, messageId: string): Promise<Message | null> {
    try {
      const cached = channel.messages.cache.get(messageId);
      if (cached) return cached;
      return await channel.messages.fetch(messageId);
    } catch {
      return null;
    }
  }

  /**
   * Fetch a message from a Discord message URL
   * URL format: https://discord.com/channels/{guildId}/{channelId}/{messageId}
   */
  async getMessageFromUrl(url: URL | string): Promise<Message | null> {
    try {
      const urlString = url instanceof URL ? url.href : url;
      const match = urlString.match(/channels\/(\d+)\/(\d+)\/(\d+)/);
      if (!match) return null;

      const channelId = match[2];
      const messageId = match[3];
      if (!channelId || !messageId) return null;

      const channel = await this.getChannel(channelId);
      if (!channel || !("messages" in channel)) return null;

      return await this.getMessage(channel as TextBasedChannel, messageId);
    } catch {
      return null;
    }
  }

  /**
   * Get display name for a user or member
   * Returns nickname if member, otherwise global name or username
   */
  getMemberName(userOrMember: User | GuildMember): string {
    if ("nickname" in userOrMember && userOrMember.nickname) {
      return userOrMember.nickname;
    }
    if ("user" in userOrMember) {
      return userOrMember.user.globalName ?? userOrMember.user.username;
    }
    return userOrMember.globalName ?? userOrMember.username;
  }

  /**
   * Get username (global name or username)
   */
  getUsername(user: User): string {
    return user.globalName ?? user.username;
  }
}
