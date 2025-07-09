import { Client, Guild, User, GuildMember, ForumChannel } from "discord.js";
import { ThingGetter } from "../TinyUtils";
import ModmailCache from "../ModmailCache";
import Database from "../data/database";
import { tryCatch } from "../trycatch";
import log from "../log";

/**
 * Modmail validation utilities for consistent validation across commands
 * - Provides reusable validation functions for common modmail checks
 * - Uses tryCatch for consistent error handling
 * - Returns structured validation results with clear error messages
 */

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ModmailValidationContext {
  guild: Guild;
  client: Client;
  db: Database;
}

/**
 * Validate that a user can have a modmail thread opened for them
 */
export async function validateUserForModmail(
  user: User,
  context: ModmailValidationContext
): Promise<ValidationResult<GuildMember>> {
  // Check if user is a bot
  if (user.bot) {
    return {
      success: false,
      error: "You cannot open a modmail thread for a bot",
    };
  }

  // Get member and validate they're in the server
  const getter = new ThingGetter(context.client);
  const { data: member, error: memberError } = await tryCatch(
    getter.getMember(context.guild, user.id)
  );

  if (memberError) {
    log.error("Failed to get member:", memberError);
    return {
      success: false,
      error: "Failed to find the user in the server",
    };
  }

  if (!member) {
    return {
      success: false,
      error: "The user is not in the server",
    };
  }

  return {
    success: true,
    data: member,
  };
}

/**
 * Validate modmail configuration for a guild
 */
export async function validateModmailConfig(
  guildId: string,
  context: ModmailValidationContext
): Promise<ValidationResult<any>> {
  const { data: config, error: configError } = await tryCatch(
    ModmailCache.getModmailConfig(guildId, context.db)
  );

  if (configError) {
    log.error("Failed to get modmail config:", configError);
    return {
      success: false,
      error: "Failed to load modmail configuration",
    };
  }

  if (!config) {
    return {
      success: false,
      error: "Modmail is not set up in this server, please run the setup command first",
    };
  }

  return {
    success: true,
    data: config,
  };
}

/**
 * Validate and get the modmail forum channel
 */
export async function validateModmailChannel(
  channelId: string,
  context: ModmailValidationContext
): Promise<ValidationResult<ForumChannel>> {
  const getter = new ThingGetter(context.client);
  const { data: channel, error: channelError } = await tryCatch(
    getter.getChannel(channelId) as Promise<ForumChannel>
  );

  if (channelError) {
    log.error("Failed to get forum channel:", channelError);
    return {
      success: false,
      error: "Failed to access the modmail channel",
    };
  }

  if (!channel) {
    return {
      success: false,
      error: "The modmail channel could not be found",
    };
  }

  if (!channel.threads) {
    return {
      success: false,
      error: "The modmail channel is not set up properly (not a forum channel)",
    };
  }

  return {
    success: true,
    data: channel,
  };
}

/**
 * Complete validation for opening a modmail thread
 * Combines user, config, and channel validation
 */
export async function validateModmailSetup(
  user: User,
  context: ModmailValidationContext
): Promise<
  ValidationResult<{
    member: GuildMember;
    config: any;
    channel: ForumChannel;
  }>
> {
  // Validate user
  const userValidation = await validateUserForModmail(user, context);
  if (!userValidation.success) {
    return {
      success: false,
      error: userValidation.error,
    };
  }

  // Validate config
  const configValidation = await validateModmailConfig(context.guild.id, context);
  if (!configValidation.success) {
    return {
      success: false,
      error: configValidation.error,
    };
  }

  // Validate channel
  const channelValidation = await validateModmailChannel(
    configValidation.data.forumChannelId,
    context
  );
  if (!channelValidation.success) {
    return {
      success: false,
      error: channelValidation.error,
    };
  }

  return {
    success: true,
    data: {
      member: userValidation.data!,
      config: configValidation.data,
      channel: channelValidation.data!,
    },
  };
}

/**
 * Validate channel type for setup command
 */
export function validateForumChannel(channel: any): ValidationResult<ForumChannel> {
  if (!channel) {
    return {
      success: false,
      error: "You must provide a channel",
    };
  }

  if (channel.type !== 15) {
    return {
      success: false,
      error: "The channel must be a forum channel",
    };
  }

  return {
    success: true,
    data: channel as ForumChannel,
  };
}

/**
 * Validate description length for setup command
 */
export function validateDescription(
  description: string | null
): ValidationResult<string | undefined> {
  if (description && description.length > 60) {
    return {
      success: false,
      error: "The description must be 60 characters or less",
    };
  }

  return {
    success: true,
    data: description || undefined,
  };
}
