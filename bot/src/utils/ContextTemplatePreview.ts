import { contextService } from "../services/ContextService";
import { Client } from "discord.js";

/**
 * Utility function to preview how template variables are replaced in context
 * This can be used for testing or debugging purposes
 */
export async function previewContextTemplating(
  guildId: string,
  mockClient?: {
    user?: {
      username: string;
      id: string;
    };
    guild?: {
      name: string;
      id: string;
      memberCount: number;
    };
  }
): Promise<{
  raw: string;
  processed: string;
  variables: Record<string, string>;
}> {
  // Create mock client if provided
  let client: any = null;
  if (mockClient) {
    client = {
      user: mockClient.user,
      guilds: {
        cache: {
          get: () => mockClient.guild,
        },
      },
    };
  }

  // Get the raw context (without processing)
  const rawContext = await contextService.getContextForAI(guildId, "test query");

  // Get the processed context (with template variables replaced)
  const processedContext = await contextService.getContextForAI(guildId, "test query", client);

  // Extract the variables that would be used
  const variables: Record<string, string> = {
    BOT_NAME: client?.user?.username || "Bot",
    BOT_ID: client?.user?.id || "",
    BOT_MENTION: client?.user ? `<@${client.user.id}>` : "@Bot",
  };

  if (client && mockClient?.guild) {
    variables.GUILD_NAME = mockClient.guild.name;
    variables.GUILD_ID = mockClient.guild.id;
    variables.MEMBER_COUNT = mockClient.guild.memberCount.toString();
  }

  return {
    raw: rawContext,
    processed: processedContext,
    variables,
  };
}

/**
 * Example usage:
 *
 * const preview = await previewContextTemplating("123456789", {
 *   user: { username: "TestBot", id: "987654321" },
 *   guild: { name: "Test Server", id: "123456789", memberCount: 150 }
 * });
 *
 * console.log("Variables:", preview.variables);
 * console.log("Raw context:", preview.raw);
 * console.log("Processed context:", preview.processed);
 */
