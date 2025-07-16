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

interface DiscordBot {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  bot: boolean;
  public: boolean;
  verified: boolean;
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

  /**
   * Get bot information using client credentials
   */
  async getBotInfo(): Promise<DiscordBot> {
    // First get access token using client credentials
    const tokenResponse = await fetch(`${this.baseUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "identify",
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Discord token API error: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();

    // Get bot information using the access token
    const botResponse = await fetch(`${this.baseUrl}/oauth2/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!botResponse.ok) {
      throw new Error(`Discord bot API error: ${botResponse.status}`);
    }

    const botData = await botResponse.json();
    return botData.application;
  }
}

export const discordApi = new DiscordApiClient();
