import { Client, User, Message, Guild } from "discord.js";
import { HookType, BeforeCreationHookContext, hookManager } from "../hooks";
import { ModmailConfigType } from "../../models/ModmailConfig";
import { createModmailThread } from "../ModmailUtils";
import { ThingGetter } from "../TinyUtils";
import { removeMentions } from "../../Bot";
import { TicketPriority } from "../../models/ModmailConfig";
import Database from "../data/database";
import ModmailConfig from "../../models/ModmailConfig";
import { tryCatch } from "../trycatch";
import log from "../log";

/**
 * Hook-based modmail creation system
 * Replaces the hardcoded logic in gotMail.ts with a dynamic hook system
 */
export class HookBasedModmailCreator {
  private client: Client<true>;
  private db: Database;

  constructor(client: Client<true>) {
    this.client = client;
    this.db = new Database();
  }

  /**
   * Create a modmail thread using the hook system
   */
  public async createModmail(
    user: User,
    originalMessage: Message,
    messageContent: string
  ): Promise<ModmailCreationResult> {
    log.debug(`HookBasedModmailCreator: Starting modmail creation for user ${user.id}`);

    try {
      // Step 1: Gather available guilds with modmail
      const availableGuilds = await this.getAvailableGuilds(user);

      if (availableGuilds.length === 0) {
        return {
          success: false,
          error: "No servers with modmail available",
          userMessage: "You are not in any servers that have modmail configured.",
        };
      }

      // Step 2: Create hook context
      const requestId = `modmail-${user.id}-${Date.now()}`;
      const hookContext: BeforeCreationHookContext = {
        client: this.client,
        user,
        guild: availableGuilds[0].guild, // Default guild, can be overridden by hooks
        originalMessage,
        messageContent: removeMentions(messageContent),
        hookType: HookType.BEFORE_CREATION,
        requestId,
        availableGuilds,
      };

      // Step 3: Execute beforeCreation hooks
      log.debug(`HookBasedModmailCreator: Executing beforeCreation hooks`);
      const hookResult = await hookManager.executeHooks(HookType.BEFORE_CREATION, hookContext);

      if (!hookResult.success) {
        log.error(`HookBasedModmailCreator: Hook execution failed`, hookResult);
        return {
          success: false,
          error: hookResult.error || "Hook execution failed",
          userMessage: hookResult.userMessage || "Failed to process modmail creation.",
        };
      }

      // Step 4: Extract data from hook results
      const {
        selectedGuildId,
        selectedCategoryId,
        formResponses,
        formMetadata,
        targetGuild,
        modmailConfig,
      } = hookResult.aggregatedData;

      // Step 5: Validate required data
      if (!selectedGuildId && !targetGuild) {
        return {
          success: false,
          error: "No guild selected",
          userMessage: "Please select a server for your modmail.",
        };
      }

      // Step 6: Prepare thread creation data
      const finalGuild = targetGuild || (await this.getGuildById(selectedGuildId));
      const finalConfig = modmailConfig || (await this.getModmailConfig(finalGuild.id));

      if (!finalGuild || !finalConfig) {
        return {
          success: false,
          error: "Guild or config not found",
          userMessage: "The selected server is no longer available.",
        };
      }

      // Step 7: Verify user membership
      const getter = new ThingGetter(this.client);
      const member = await getter.getMember(finalGuild, user.id);
      if (!member) {
        return {
          success: false,
          error: "User not member of target guild",
          userMessage: `You are not a member of ${finalGuild.name}.`,
        };
      }

      // Step 8: Prepare category information
      const categoryInfo = await this.prepareCategoryInfo(
        finalGuild.id,
        selectedCategoryId,
        formResponses,
        formMetadata
      );

      // Step 9: Create the modmail thread
      log.debug(`HookBasedModmailCreator: Creating modmail thread for guild ${finalGuild.id}`);

      const result = await createModmailThread(this.client, {
        guild: finalGuild,
        targetUser: user,
        targetMember: member,
        forumChannel: await getter.getChannel(finalConfig.forumChannelId),
        modmailConfig: finalConfig,
        reason:
          messageContent.length >= 50 ? messageContent.substring(0, 50) + "..." : messageContent,
        openedBy: {
          type: "User",
          username: user.username,
          userId: user.id,
        },
        initialMessage: removeMentions(messageContent),
        ...categoryInfo,
      });

      if (!result || !result.success) {
        log.error(`HookBasedModmailCreator: Thread creation failed`, result);
        return {
          success: false,
          error: result?.error || "Thread creation failed",
          userMessage: "Failed to create modmail thread. Please try again.",
        };
      }

      log.info(
        `HookBasedModmailCreator: Successfully created modmail thread for user ${user.id} in guild ${finalGuild.id}`
      );

      return {
        success: true,
        thread: result.thread,
        dmSuccess: result.dmSuccess,
        guild: finalGuild,
        config: finalConfig,
      };
    } catch (error) {
      log.error("HookBasedModmailCreator: Unexpected error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        userMessage: "An unexpected error occurred. Please try again.",
      };
    }
  }

  /**
   * Get available guilds with modmail for the user
   */
  private async getAvailableGuilds(
    user: User
  ): Promise<Array<{ guild: Guild; config: ModmailConfigType }>> {
    const sharedGuilds: Guild[] = [];
    const cachedGuilds = this.client.guilds.cache;

    // Find shared guilds
    for (const [, guild] of cachedGuilds) {
      const { data: member, error: memberError } = await tryCatch(guild.members.fetch(user));

      if (member) {
        sharedGuilds.push(guild);
      } else if (memberError) {
        log.debug(`User ${user.id} not found in guild ${guild.id}:`, memberError);
      }
    }

    // Filter guilds with modmail configured
    const guildsWithModmail: Array<{ guild: Guild; config: ModmailConfigType }> = [];
    for (const guild of sharedGuilds) {
      const { data: config, error: configError } = await tryCatch(
        this.db.findOne(ModmailConfig, { guildId: guild.id })
      );

      if (configError) {
        log.warn(`Failed to fetch modmail config for guild ${guild.id}:`, configError);
        continue;
      }

      if (config) {
        guildsWithModmail.push({ guild, config });
      }
    }

    return guildsWithModmail;
  }

  /**
   * Get guild by ID
   */
  private async getGuildById(guildId: string): Promise<Guild | null> {
    const getter = new ThingGetter(this.client);
    try {
      return await getter.getGuild(guildId);
    } catch (error) {
      log.error(`Failed to get guild ${guildId}:`, error);
      return null;
    }
  }

  /**
   * Get modmail config for guild
   */
  private async getModmailConfig(guildId: string): Promise<ModmailConfigType | null> {
    const { data: config, error } = await tryCatch(this.db.findOne(ModmailConfig, { guildId }));

    if (error) {
      log.error(`Failed to get modmail config for guild ${guildId}:`, error);
      return null;
    }

    return config;
  }

  /**
   * Prepare category information for thread creation
   */
  private async prepareCategoryInfo(
    guildId: string,
    categoryId?: string,
    formResponses?: Record<string, any>,
    formMetadata?: Record<string, { label: string; type: string }>
  ): Promise<any> {
    const defaultInfo = {
      priority: TicketPriority.MEDIUM,
    };

    if (!categoryId) {
      return defaultInfo;
    }

    try {
      const { CategoryManager } = await import("../modmail/CategoryManager");
      const categoryManager = new CategoryManager();
      const category = await categoryManager.getCategoryById(guildId, categoryId);

      if (!category) {
        log.warn(`Category ${categoryId} not found for guild ${guildId}`);
        return defaultInfo;
      }

      const ticketNumber = await categoryManager.getNextTicketNumber(guildId);

      return {
        categoryId: category.id,
        categoryName: category.name,
        priority: Number(category.priority) as TicketPriority,
        ticketNumber,
        formResponses: formResponses || {},
        formMetadata: formMetadata || {},
      };
    } catch (error) {
      log.error("Error preparing category info:", error);
      return defaultInfo;
    }
  }
}

/**
 * Result of modmail creation process
 */
export interface ModmailCreationResult {
  success: boolean;
  thread?: any;
  dmSuccess?: boolean;
  guild?: Guild;
  config?: ModmailConfigType;
  error?: string;
  userMessage?: string;
}
