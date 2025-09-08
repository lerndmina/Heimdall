import { Client } from "discord.js";

interface UserInfo {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  displayName?: string;
}

/**
 * Get user information from Discord API
 * Falls back to basic info if user cannot be fetched
 */
export async function getUserInfo(userId: string, client?: Client): Promise<UserInfo> {
  try {
    // Try to get client from global scope if not provided
    const discordClient = client || (global as any).client;

    if (discordClient) {
      const user = await discordClient.users.fetch(userId).catch(() => null);
      if (user) {
        return {
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          avatar: user.avatar,
          displayName: user.displayName || user.username,
        };
      }
    }

    // Fallback to basic info if user cannot be fetched
    return {
      id: userId,
      username: "Unknown User",
      discriminator: "0000",
      avatar: null,
      displayName: "Unknown User",
    };
  } catch (error) {
    console.error(`Error fetching user info for ${userId}:`, error);
    // Return fallback user info
    return {
      id: userId,
      username: "Unknown User",
      discriminator: "0000",
      avatar: null,
      displayName: "Unknown User",
    };
  }
}
