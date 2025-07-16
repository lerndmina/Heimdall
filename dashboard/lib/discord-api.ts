interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  permissions_new?: string;
}

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
}

export class DiscordApiClient {
  private baseUrl = "https://discord.com/api/v10";

  async getUser(accessToken: string): Promise<DiscordUser> {
    const response = await fetch(`${this.baseUrl}/users/@me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    return response.json();
  }

  async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const response = await fetch(`${this.baseUrl}/users/@me/guilds`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Check if user has administrator permissions in a guild
   */
  hasAdminPermissions(guild: DiscordGuild): boolean {
    const permissions = BigInt(guild.permissions);
    const ADMINISTRATOR = BigInt(0x8);
    return (permissions & ADMINISTRATOR) === ADMINISTRATOR || guild.owner;
  }

  /**
   * Check if user has manage guild permissions
   */
  hasManageGuildPermissions(guild: DiscordGuild): boolean {
    const permissions = BigInt(guild.permissions);
    const MANAGE_GUILD = BigInt(0x20);
    const ADMINISTRATOR = BigInt(0x8);
    return (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR || guild.owner;
  }
}

export const discordApi = new DiscordApiClient();
