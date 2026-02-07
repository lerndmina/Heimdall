/**
 * DM Handler - Process incoming DM messages for modmail
 *
 * Handles:
 * - Existing modmail: relay message to forum thread
 * - New modmail: initiate creation flow (guild selection → category → questions)
 * - Rate limiting to prevent spam
 * - Ban status checking
 */

import { Events, Message, Guild, ActionRowBuilder, type StringSelectMenuInteraction } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import type { ModmailPluginAPI } from "../../index.js";
import Modmail, { ModmailStatus } from "../../models/Modmail.js";
import ModmailConfig from "../../models/ModmailConfig.js";
import { ModmailEmbeds } from "../../utils/ModmailEmbeds.js";
import { stripMentions } from "../../utils/mentionSanitizer.js";
import { getPluginAPI } from "../../utils/getPluginAPI.js";
import { createCloseTicketRow } from "../../utils/modmailButtons.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("modmail:dm-handler");

export const event = Events.MessageCreate;
export const pluginName = "modmail";

// Rate limiting cache
interface RateLimitEntry {
  lastMessageTime: number;
  messageCount: number;
  cooldownUntil?: number;
}

const rateLimitCache = new Map<string, RateLimitEntry>();

const RATE_LIMIT = {
  WINDOW_MS: 60000, // 1 minute window
  MAX_MESSAGES: 5, // Max 5 messages per window
  COOLDOWN_MS: 300000, // 5 minute cooldown after exceeding
};

// Active flow sessions (prevents duplicate flows)
const activeFlows = new Set<string>();

/**
 * Force flag regex pattern
 * Matches --force or -f at the end of a message (case-insensitive)
 */
const FORCE_FLAG_PATTERN = /\s*(?:--force|-f)\s*$/i;

/**
 * Check if message contains force flag and extract clean content
 * @returns Object with forceFlag boolean and cleanContent string
 */
function parseForceFlag(content: string): { forceFlag: boolean; cleanContent: string } {
  const forceFlag = FORCE_FLAG_PATTERN.test(content);
  const cleanContent = forceFlag ? content.replace(FORCE_FLAG_PATTERN, "").trim() : content;
  return { forceFlag, cleanContent };
}

/**
 * Check if user is rate limited
 * @returns Object with isLimited flag and wait time in seconds
 */
function checkRateLimit(userId: string): { isLimited: boolean; waitSeconds: number } {
  const now = Date.now();
  const entry = rateLimitCache.get(userId);

  // No entry = not rate limited
  if (!entry) {
    rateLimitCache.set(userId, { lastMessageTime: now, messageCount: 1 });
    return { isLimited: false, waitSeconds: 0 };
  }

  // Check if in cooldown
  if (entry.cooldownUntil && now < entry.cooldownUntil) {
    const waitSeconds = Math.ceil((entry.cooldownUntil - now) / 1000);
    return { isLimited: true, waitSeconds };
  }

  // Reset if window expired
  if (now - entry.lastMessageTime > RATE_LIMIT.WINDOW_MS) {
    rateLimitCache.set(userId, { lastMessageTime: now, messageCount: 1 });
    return { isLimited: false, waitSeconds: 0 };
  }

  // Increment count
  entry.messageCount++;
  entry.lastMessageTime = now;

  // Check if exceeded
  if (entry.messageCount > RATE_LIMIT.MAX_MESSAGES) {
    entry.cooldownUntil = now + RATE_LIMIT.COOLDOWN_MS;
    const waitSeconds = Math.ceil(RATE_LIMIT.COOLDOWN_MS / 1000);
    return { isLimited: true, waitSeconds };
  }

  return { isLimited: false, waitSeconds: 0 };
}

/**
 * Main event handler
 */
export async function execute(client: HeimdallClient, message: Message): Promise<void> {
  // Only process DMs from non-bots
  if (message.author.bot) return;
  if (message.guild) return; // Skip guild messages

  // Skip empty messages (no content and no attachments)
  if (!message.content.trim() && message.attachments.size === 0) return;

  const pluginAPI = getPluginAPI(client);
  if (!pluginAPI) {
    log.warn("Modmail plugin API not available");
    return;
  }

  const userId = message.author.id;

  // Check rate limit
  const rateLimit = checkRateLimit(userId);
  if (rateLimit.isLimited) {
    try {
      await message.reply({
        embeds: [ModmailEmbeds.rateLimited(rateLimit.waitSeconds)],
      });
    } catch {
      // Ignore DM send failures
    }
    return;
  }

  try {
    // Check for existing active modmail
    const existingModmail = await Modmail.findOne({
      userId,
      status: { $in: [ModmailStatus.OPEN, ModmailStatus.RESOLVED] },
    });

    if (existingModmail) {
      // Relay message to existing thread
      await handleExistingModmail(client, pluginAPI, message, existingModmail);
    } else {
      // Start new modmail flow
      await startNewModmailFlow(client, pluginAPI, message);
    }
  } catch (error) {
    log.error(`Error handling DM from ${userId}:`, error);
    try {
      await message.reply({
        embeds: [ModmailEmbeds.error("Error", "An error occurred while processing your message. Please try again later.")],
      });
    } catch {
      // Ignore DM send failures
    }
  }
}

/**
 * Handle message for existing modmail - relay to thread
 */
async function handleExistingModmail(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message, modmail: typeof Modmail.prototype): Promise<void> {
  const modmailId = modmail.modmailId as string;

  // Note: Minimum message length only applies to initial modmail creation, not ongoing messages

  // Sanitize mentions before relay
  const sanitizedContent = stripMentions(message.content);

  // Relay to thread (pass sanitized content to prevent @everyone/@here pings)
  const success = await pluginAPI.flowService.relayUserMessageToThread(modmailId, message, sanitizedContent);

  if (success) {
    // React to indicate message was delivered
    try {
      await message.react("📨");
    } catch {
      // Ignore reaction failures
    }

    log.debug(`Relayed user message to modmail ${modmailId}`);
  } else {
    try {
      await message.reply({
        embeds: [ModmailEmbeds.error("Delivery Failed", "Failed to deliver your message. The support thread may have been closed.")],
      });
    } catch {
      // Ignore DM send failures
    }
  }
}

/**
 * Start new modmail creation flow
 */
async function startNewModmailFlow(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message): Promise<void> {
  const userId = message.author.id;

  // Check if user has an active modmail session (answering form questions).
  // If so, queue this message so it is forwarded after thread creation.
  const activeSessionId = await pluginAPI.sessionService.getUserActiveSession(userId);
  if (activeSessionId) {
    const queued = await pluginAPI.sessionService.queueMessage(activeSessionId, {
      channelId: message.channel.id,
      messageId: message.id,
    });
    if (queued) {
      try {
        await message.react("📝");
      } catch {
        // Ignore reaction failures
      }
      log.debug(`Queued DM message ${message.id} for active session ${activeSessionId}`);
      return;
    }
    // If queuing failed (e.g. session expired between check and queue), fall through
    // to normal flow.
  }

  // Prevent duplicate flows
  if (activeFlows.has(userId)) {
    try {
      await message.reply({
        embeds: [ModmailEmbeds.warning("Flow In Progress", "You already have a modmail creation flow in progress. Please complete or wait for it to expire.")],
      });
    } catch {
      // Ignore DM send failures
    }
    return;
  }

  activeFlows.add(userId);

  try {
    // Find eligible guilds
    const eligibleGuilds = await findEligibleGuilds(client, pluginAPI, userId);

    if (eligibleGuilds.length === 0) {
      await message.reply({
        embeds: [ModmailEmbeds.error("No Available Servers", "You are not a member of any server that has modmail enabled, or you may be banned from using modmail in all shared servers.")],
      });
      return;
    }

    if (eligibleGuilds.length === 1) {
      // Single guild - proceed directly
      const guild = eligibleGuilds[0]!;
      await handleSingleGuild(client, pluginAPI, message, guild);
    } else {
      // Multiple guilds - show selection menu
      await showGuildSelection(client, pluginAPI, message, eligibleGuilds);
    }
  } finally {
    // Clear flow lock immediately — the flow is done (success or failure).
    // Menu interactions are handled by persistent component handlers, not this flow.
    activeFlows.delete(userId);
  }
}

/**
 * Find guilds where user can create modmail
 * Checks: guild membership, modmail enabled, not banned
 *
 * Uses batch config fetch to avoid O(n) individual DB queries per guild.
 */
async function findEligibleGuilds(client: HeimdallClient, pluginAPI: ModmailPluginAPI, userId: string): Promise<Guild[]> {
  const eligibleGuilds: Guild[] = [];
  const guildIds = Array.from(client.guilds.cache.keys());

  if (guildIds.length === 0) return eligibleGuilds;

  // Batch fetch all modmail configs in one query instead of one per guild
  const configs = await ModmailConfig.find({ guildId: { $in: guildIds } }).lean();
  const configMap = new Map(configs.map((c) => [c.guildId as string, c]));

  for (const [, guild] of client.guilds.cache) {
    try {
      // Check if modmail is configured for this guild
      const config = configMap.get(guild.id);
      if (!config) continue;

      // Check if guild has any enabled categories
      const enabledCategories = (config.categories || []).filter((c: { enabled: boolean }) => c.enabled);
      if (enabledCategories.length === 0) continue;

      // Check if user is a member of this guild
      const member = await pluginAPI.lib.thingGetter.getMember(guild, userId);
      if (!member) continue;

      // Check if user is banned from modmail in this guild
      const isBanned = await pluginAPI.modmailService.isUserBanned(guild.id, userId);
      if (isBanned) continue;

      // Check if user already has open modmail in this guild
      const hasOpen = await pluginAPI.modmailService.userHasOpenModmail(guild.id, userId);
      if (hasOpen) continue;

      eligibleGuilds.push(guild);
    } catch (error) {
      log.debug(`Error checking guild ${guild.id} eligibility:`, error);
      // Continue checking other guilds
    }
  }

  return eligibleGuilds;
}

/**
 * Handle flow when only one guild is eligible
 */
async function handleSingleGuild(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message, guild: Guild): Promise<void> {
  const config = await pluginAPI.modmailService.getConfig(guild.id);
  if (!config) {
    await message.reply({
      embeds: [ModmailEmbeds.notConfigured(guild.name)],
    });
    return;
  }

  // Check minimum message length BEFORE showing any category selection
  const { forceFlag, cleanContent } = parseForceFlag(message.content);
  if (config.minimumMessageLength && cleanContent.length < config.minimumMessageLength && message.attachments.size === 0) {
    if (!forceFlag) {
      await message.reply({
        embeds: [ModmailEmbeds.shortMessage(config.minimumMessageLength, cleanContent.length)],
      });
      return;
    }
    await message.reply({
      embeds: [ModmailEmbeds.forceFlag()],
    });
  }

  const enabledCategories = (config.categories || []).filter((c: { enabled: boolean }) => c.enabled);

  if (enabledCategories.length === 1) {
    // Single category - create session and check for questions
    await handleSingleCategory(client, pluginAPI, message, guild, config, enabledCategories[0]!);
  } else {
    // Multiple categories - show selection
    await showCategorySelection(client, pluginAPI, message, guild, config, enabledCategories);
  }
}

/**
 * Handle flow when only one category is available
 */
async function handleSingleCategory(
  client: HeimdallClient,
  pluginAPI: ModmailPluginAPI,
  message: Message,
  guild: Guild,
  config: typeof ModmailConfig.prototype,
  category: { id: string; name: string; formFields?: unknown[] },
): Promise<void> {
  const userId = message.author.id;
  const member = await pluginAPI.lib.thingGetter.getMember(guild, userId);
  const displayName = member ? pluginAPI.lib.thingGetter.getMemberName(member) : message.author.username;

  // Parse force flag from message content (length already validated in handleSingleGuild)
  const { cleanContent } = parseForceFlag(message.content);

  // Create session with clean content (force flag stripped)
  const sessionId = await pluginAPI.sessionService.createSession({
    guildId: guild.id,
    userId,
    userDisplayName: displayName,
    categoryId: category.id,
    initialMessage: cleanContent,
    initialMessageRef: {
      channelId: message.channel.id,
      messageId: message.id,
    },
  });

  // Check if category has form fields
  const formFields = (category.formFields || []) as unknown[];
  if (formFields.length > 0) {
    // Start question flow
    const confirmEmbed = ModmailEmbeds.info("Starting Modmail", `Creating a support ticket in **${guild.name}** (${category.name}).\n\nPlease answer a few questions first.`);

    const continueButton = pluginAPI.lib.createButtonBuilder(async (interaction) => {
      // Do NOT defer here — processNextStep may need to show a modal,
      // and showModal() requires the interaction to be unacknowledged.
      await pluginAPI.questionHandler.processNextStep(interaction, sessionId);
    }, 900);

    continueButton.setLabel("Continue").setStyle(1); // Primary
    await continueButton.ready();

    const row = new ActionRowBuilder<typeof continueButton>().addComponents(continueButton);

    await message.reply({
      embeds: [confirmEmbed],
      components: [row],
    });
  } else {
    // No questions - create modmail directly
    await createModmailDirectly(client, pluginAPI, message, guild, category.id, sessionId);
  }
}

/**
 * Show guild selection menu for multiple eligible guilds
 */
async function showGuildSelection(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message, guilds: Guild[]): Promise<void> {
  const GUILD_SELECT_HANDLER = "modmail.dm.guild-select";

  // Store initial message temporarily for the handler
  const tempData = {
    initialMessage: message.content,
    userId: message.author.id,
    guildOptions: guilds.map((g) => ({ id: g.id, name: g.name })),
  };

  // Register ephemeral handler for this specific selection
  const selectMenu = pluginAPI.lib.createStringSelectMenuBuilder(async (interaction: StringSelectMenuInteraction) => {
    const selectedGuildId = interaction.values[0];
    if (!selectedGuildId) {
      await interaction.reply({
        embeds: [ModmailEmbeds.error("No Selection", "Please select a server.")],
        ephemeral: true,
      });
      return;
    }

    const guild = client.guilds.cache.get(selectedGuildId);
    if (!guild) {
      await interaction.reply({
        embeds: [ModmailEmbeds.error("Server Not Found", "The selected server is no longer available.")],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();

    // Continue with category selection for chosen guild
    await handleGuildSelected(client, pluginAPI, interaction, message, guild);
  }, 900); // 15 minute TTL

  selectMenu.setPlaceholder("Select a server to contact...");

  // Add guild options (max 25)
  const options = guilds.slice(0, 25).map((guild) => ({
    label: guild.name.substring(0, 100),
    value: guild.id,
    description: `Members: ${guild.memberCount}`,
  }));

  selectMenu.addOptions(options);
  await selectMenu.ready();

  const row = new ActionRowBuilder<typeof selectMenu>().addComponents(selectMenu);

  const embed = ModmailEmbeds.info("Select a Server", `You are a member of **${guilds.length}** server(s) with modmail enabled.\n\nPlease select which server you want to contact:`);

  await message.reply({
    embeds: [embed],
    components: [row],
  });
}

/**
 * Handle guild selection from menu
 */
async function handleGuildSelected(client: HeimdallClient, pluginAPI: ModmailPluginAPI, interaction: StringSelectMenuInteraction, originalMessage: Message, guild: Guild): Promise<void> {
  const config = await pluginAPI.modmailService.getConfig(guild.id);
  if (!config) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.notConfigured(guild.name)],
      components: [],
    });
    return;
  }

  // Check minimum message length BEFORE showing category selection
  const { forceFlag, cleanContent } = parseForceFlag(originalMessage.content);
  if (config.minimumMessageLength && cleanContent.length < config.minimumMessageLength && originalMessage.attachments.size === 0) {
    if (!forceFlag) {
      await interaction.editReply({
        embeds: [ModmailEmbeds.shortMessage(config.minimumMessageLength, cleanContent.length)],
        components: [],
      });
      return;
    }
    try {
      await originalMessage.reply({
        embeds: [ModmailEmbeds.forceFlag()],
      });
    } catch {
      // Ignore if we can't send the warning DM
    }
  }

  const enabledCategories = (config.categories || []).filter((c: { enabled: boolean }) => c.enabled);

  if (enabledCategories.length === 1) {
    // Single category - proceed
    await handleCategorySelected(client, pluginAPI, interaction, originalMessage, guild, config, enabledCategories[0]!);
  } else {
    // Show category selection
    await showCategorySelectionFromInteraction(client, pluginAPI, interaction, originalMessage, guild, config, enabledCategories);
  }
}

/**
 * Show category selection menu
 */
async function showCategorySelection(
  client: HeimdallClient,
  pluginAPI: ModmailPluginAPI,
  message: Message,
  guild: Guild,
  config: typeof ModmailConfig.prototype,
  categories: Array<{ id: string; name: string; description?: string; emoji?: string }>,
): Promise<void> {
  const selectMenu = pluginAPI.lib.createStringSelectMenuBuilder(async (interaction: StringSelectMenuInteraction) => {
    const selectedCategoryId = interaction.values[0];
    if (!selectedCategoryId) {
      await interaction.reply({
        embeds: [ModmailEmbeds.error("No Selection", "Please select a category.")],
        ephemeral: true,
      });
      return;
    }

    const category = categories.find((c) => c.id === selectedCategoryId);
    if (!category) {
      await interaction.reply({
        embeds: [ModmailEmbeds.error("Category Not Found", "The selected category is no longer available.")],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferUpdate();
    await handleCategorySelected(client, pluginAPI, interaction, message, guild, config, category);
  }, 900);

  selectMenu.setPlaceholder("Select a category...");

  const options = categories.slice(0, 25).map((cat) => ({
    label: cat.name.substring(0, 100),
    value: cat.id,
    description: cat.description?.substring(0, 100),
    emoji: cat.emoji ? { name: cat.emoji } : undefined,
  }));

  selectMenu.addOptions(options);
  await selectMenu.ready();

  const row = new ActionRowBuilder<typeof selectMenu>().addComponents(selectMenu);

  const embed = ModmailEmbeds.categorySelection(
    guild.name,
    categories.map((c) => ({ name: c.name, description: c.description, emoji: c.emoji })),
  );

  await message.reply({
    embeds: [embed],
    components: [row],
  });
}

/**
 * Show category selection from an interaction (after guild selection)
 */
async function showCategorySelectionFromInteraction(
  client: HeimdallClient,
  pluginAPI: ModmailPluginAPI,
  interaction: StringSelectMenuInteraction,
  originalMessage: Message,
  guild: Guild,
  config: typeof ModmailConfig.prototype,
  categories: Array<{ id: string; name: string; description?: string; emoji?: string }>,
): Promise<void> {
  const selectMenu = pluginAPI.lib.createStringSelectMenuBuilder(async (catInteraction: StringSelectMenuInteraction) => {
    const selectedCategoryId = catInteraction.values[0];
    if (!selectedCategoryId) {
      await catInteraction.reply({
        embeds: [ModmailEmbeds.error("No Selection", "Please select a category.")],
        ephemeral: true,
      });
      return;
    }

    const category = categories.find((c) => c.id === selectedCategoryId);
    if (!category) {
      await catInteraction.reply({
        embeds: [ModmailEmbeds.error("Category Not Found", "The selected category is no longer available.")],
        ephemeral: true,
      });
      return;
    }

    await catInteraction.deferUpdate();
    await handleCategorySelected(client, pluginAPI, catInteraction, originalMessage, guild, config, category);
  }, 900);

  selectMenu.setPlaceholder("Select a category...");

  const options = categories.slice(0, 25).map((cat) => ({
    label: cat.name.substring(0, 100),
    value: cat.id,
    description: cat.description?.substring(0, 100),
    emoji: cat.emoji ? { name: cat.emoji } : undefined,
  }));

  selectMenu.addOptions(options);
  await selectMenu.ready();

  const row = new ActionRowBuilder<typeof selectMenu>().addComponents(selectMenu);

  const embed = ModmailEmbeds.categorySelection(
    guild.name,
    categories.map((c) => ({ name: c.name, description: c.description, emoji: c.emoji })),
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}

/**
 * Handle category selection - create session and check for questions
 */
async function handleCategorySelected(
  client: HeimdallClient,
  pluginAPI: ModmailPluginAPI,
  interaction: StringSelectMenuInteraction,
  originalMessage: Message,
  guild: Guild,
  config: typeof ModmailConfig.prototype,
  category: { id: string; name: string; formFields?: unknown[] },
): Promise<void> {
  const userId = originalMessage.author.id;
  const member = await pluginAPI.lib.thingGetter.getMember(guild, userId);
  const displayName = member ? pluginAPI.lib.thingGetter.getMemberName(member) : originalMessage.author.username;

  // Parse force flag from original message content (length already validated upstream)
  const { cleanContent } = parseForceFlag(originalMessage.content);

  // Create session with clean content (force flag stripped)
  const sessionId = await pluginAPI.sessionService.createSession({
    guildId: guild.id,
    userId,
    userDisplayName: displayName,
    categoryId: category.id,
    initialMessage: cleanContent,
    initialMessageRef: {
      channelId: originalMessage.channel.id,
      messageId: originalMessage.id,
    },
  });

  // Check if category has form fields
  const formFields = (category.formFields || []) as unknown[];
  if (formFields.length > 0) {
    // Start question flow
    await pluginAPI.questionHandler.processNextStep(interaction, sessionId);
  } else {
    // No questions - create modmail directly
    await createModmailFromInteraction(client, pluginAPI, interaction, originalMessage, guild, category.id, sessionId);
  }
}

/**
 * Create modmail directly (no questions)
 */
async function createModmailDirectly(client: HeimdallClient, pluginAPI: ModmailPluginAPI, message: Message, guild: Guild, categoryId: string, sessionId: string): Promise<void> {
  const session = await pluginAPI.sessionService.getSession(sessionId);
  if (!session) {
    await message.reply({
      embeds: [ModmailEmbeds.sessionExpired()],
    });
    return;
  }

  // Show loading state
  const loadingReply = await message.reply({
    embeds: [ModmailEmbeds.loading("Creating your support ticket...")],
  });

  try {
    const result = await pluginAPI.creationService.createModmail({
      guildId: guild.id,
      userId: message.author.id,
      userDisplayName: session.userDisplayName,
      initialMessage: session.initialMessage,
      initialMessageRef: session.initialMessageRef,
      queuedMessageRefs: session.queuedMessageRefs,
      categoryId,
      createdVia: "dm",
    });

    // Clean up session
    await pluginAPI.sessionService.deleteSession(sessionId);

    if (result.success && result.metadata) {
      // Get category name for confirmation
      const config = await pluginAPI.modmailService.getConfig(guild.id);
      const category = config?.categories?.find((c: { id: string }) => c.id === categoryId);

      const closeRow = await createCloseTicketRow(pluginAPI.lib);

      await loadingReply.edit({
        embeds: [ModmailEmbeds.threadCreated(guild.name, category?.name || "General")],
        components: [closeRow],
      });

      // Clear the flow lock
      activeFlows.delete(message.author.id);

      log.info(`Created modmail ${result.modmailId} for user ${message.author.id} in guild ${guild.id}`);
    } else {
      await loadingReply.edit({
        embeds: [ModmailEmbeds.error("Creation Failed", result.userMessage || "Failed to create modmail. Please try again.")],
      });
    }
  } catch (error) {
    log.error(`Error creating modmail:`, error);
    await loadingReply.edit({
      embeds: [ModmailEmbeds.error("Error", "An error occurred while creating your ticket. Please try again later.")],
    });
  }
}

/**
 * Create modmail from an interaction context
 */
async function createModmailFromInteraction(
  client: HeimdallClient,
  pluginAPI: ModmailPluginAPI,
  interaction: StringSelectMenuInteraction,
  originalMessage: Message,
  guild: Guild,
  categoryId: string,
  sessionId: string,
): Promise<void> {
  const session = await pluginAPI.sessionService.getSession(sessionId);
  if (!session) {
    await interaction.editReply({
      embeds: [ModmailEmbeds.sessionExpired()],
      components: [],
    });
    return;
  }

  // Show loading state
  await interaction.editReply({
    embeds: [ModmailEmbeds.loading("Creating your support ticket...")],
    components: [],
  });

  try {
    const result = await pluginAPI.creationService.createModmail({
      guildId: guild.id,
      userId: originalMessage.author.id,
      userDisplayName: session.userDisplayName,
      initialMessage: session.initialMessage,
      initialMessageRef: session.initialMessageRef,
      queuedMessageRefs: session.queuedMessageRefs,
      categoryId,
      createdVia: "dm",
    });

    // Clean up session
    await pluginAPI.sessionService.deleteSession(sessionId);

    if (result.success && result.metadata) {
      // Get category name for confirmation
      const config = await pluginAPI.modmailService.getConfig(guild.id);
      const category = config?.categories?.find((c: { id: string }) => c.id === categoryId);

      const closeRow = await createCloseTicketRow(pluginAPI.lib);

      await interaction.editReply({
        embeds: [ModmailEmbeds.threadCreated(guild.name, category?.name || "General")],
        components: [closeRow],
      });

      // Clear the flow lock
      activeFlows.delete(originalMessage.author.id);

      log.info(`Created modmail ${result.modmailId} for user ${originalMessage.author.id} in guild ${guild.id}`);
    } else {
      await interaction.editReply({
        embeds: [ModmailEmbeds.error("Creation Failed", result.userMessage || "Failed to create modmail. Please try again.")],
        components: [],
      });
    }
  } catch (error) {
    log.error(`Error creating modmail:`, error);
    await interaction.editReply({
      embeds: [ModmailEmbeds.error("Error", "An error occurred while creating your ticket. Please try again later.")],
      components: [],
    });
  }
}
