import type { LegacySlashCommandProps, LegacyCommandOptions } from "@heimdall/command-handler";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ForumChannel,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
  ThreadChannel,
} from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji, redisClient } from "../../Bot";
import ButtonWrapper from "../../utils/ButtonWrapper";
import { ThingGetter } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import ModmailCache from "../../utils/ModmailCache";
import ModmailConfig, { TicketPriority } from "../../models/ModmailConfig";
import Modmail from "../../models/Modmail";
import FetchEnvs from "../../utils/FetchEnvs";
import { createModmailThread } from "../../utils/ModmailUtils";
import { tryCatch } from "../../utils/trycatch";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import { validateModmailSetup } from "../../utils/modmail/ModmailValidation";
import log from "../../utils/log";

const env = FetchEnvs();

export const openModmailOptions: LegacyCommandOptions = {
  devOnly: false,
  deleted: true,
  userPermissions: ["ManageMessages", "KickMembers", "BanMembers"], // This is a mod command
};

/**
 * Open a modmail thread for a user (staff command)
 * - Creates a modmail thread in the forum channel
 * - Sends a DM to the user
 * - Enhanced error handling with tryCatch utility
 * - Follows new gotMail patterns for consistency
 */
export default async function ({ interaction, client, handler }: LegacySlashCommandProps) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({
      embeds: [
        ModmailEmbeds.error(client, "Server Only", "This command can only be used in a server"),
      ],
      ephemeral: true,
    });
  }

  const user = interaction.options.getUser("user");
  if (!user) {
    return interaction.reply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "Missing User",
          "Please provide a user to open a modmail thread for"
        ),
      ],
      ephemeral: true,
    });
  }

  if (user.bot) {
    return interaction.reply({
      embeds: [
        ModmailEmbeds.error(client, "Invalid User", "You cannot open a modmail thread for a bot"),
      ],
      ephemeral: true,
    });
  }

  const reason = interaction.options.getString("reason") || "(no reason specified)";

  // Initial reply
  const { error: replyError } = await tryCatch(
    interaction.reply({ content: waitingEmoji, ephemeral: true })
  );
  if (replyError) {
    log.error("Failed to send initial reply:", replyError);
    return;
  }

  // Rate limiting check (following gotMail pattern)
  const rateLimitKey = `modmail_creation_rate_limit:${user.id}`;
  const isRateLimited = await redisClient.get(rateLimitKey);

  if (isRateLimited) {
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.warning(
          client,
          "Rate Limited",
          "This user has had a modmail thread created recently. Please wait a moment before trying again."
        ),
      ],
    });
  }

  // Set rate limit for 5 seconds
  await redisClient.setEx(rateLimitKey, 5, "true");

  // Check if user is banned from modmail - SKIPPED FOR ADMIN COMMAND
  // Admin/staff commands bypass ban restrictions

  // Validate complete modmail setup
  const db = new Database();
  const { data: validation, error: validationError } = await tryCatch(
    validateModmailSetup(user, { guild, client, db })
  );

  if (validationError) {
    log.error("Failed during modmail validation:", validationError);
    await redisClient.del(rateLimitKey); // Clear rate limit on error
    return interaction.editReply({
      content: "",
      embeds: [ModmailEmbeds.error(client, "Validation Error", "Failed to validate modmail setup")],
    });
  }

  if (!validation?.success) {
    await redisClient.del(rateLimitKey); // Clear rate limit on validation failure
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Validation Failed",
          validation?.error || "Unknown validation error"
        ),
      ],
    });
  }

  const { member: targetMember, config: modmailConfig, channel: forumChannel } = validation.data!;

  // Check if user already has an open modmail thread (following gotMail pattern)
  const { data: existingModmail, error: existingError } = await tryCatch(
    db.findOne(Modmail, { userId: user.id, isClosed: false })
  );

  if (existingError) {
    log.error("Failed to check existing modmail:", existingError);
    await redisClient.del(rateLimitKey); // Clear rate limit on error
    return interaction.editReply({
      content: "",
      embeds: [ModmailEmbeds.error(client, "Database Error", "Failed to check existing modmail")],
    });
  }

  if (existingModmail) {
    await redisClient.del(rateLimitKey); // Clear rate limit
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Thread Already Exists",
          "A modmail thread is already open for this user"
        ),
      ],
    });
  }

  // Prepare category information - use default category for admin-opened tickets
  const getter = new ThingGetter(client);
  let categoryInfo = {};

  // For admin/staff opened tickets, use the default category to ensure consistency
  try {
    const { CategoryManager } = await import("../../utils/modmail/CategoryManager");
    const categoryManager = new CategoryManager();

    // Get the default category (even if disabled) since this is an admin command
    const defaultCategory = await categoryManager.getDefaultCategory(guild.id);

    if (defaultCategory) {
      // Get ticket number for the default category
      const ticketNumber = await categoryManager.getNextTicketNumber(guild.id);

      categoryInfo = {
        categoryId: defaultCategory.id,
        categoryName: defaultCategory.name,
        priority: defaultCategory.priority,
        ticketNumber,
        formResponses: {}, // No form responses for staff-opened tickets
        formMetadata: {},
      };

      log.debug(`Using default category ${defaultCategory.name} for admin-opened modmail`);
    } else {
      log.debug("No default category found, using legacy modmail format");
    }
  } catch (error) {
    log.debug("Categories not available or failed to load, using legacy format:", error);
  }

  // Create the modmail thread using the main createModmailThread function
  const { data: result, error: createError } = await tryCatch(
    createModmailThread(client, {
      guild,
      targetUser: user,
      targetMember,
      forumChannel,
      modmailConfig,
      reason,
      openedBy: {
        type: "Staff",
        username: interaction.user.username,
        userId: interaction.user.id,
      },
      initialMessage: reason,
      ...categoryInfo,
    })
  );

  if (createError) {
    log.error("Failed to create modmail thread:", createError);
    await redisClient.del(rateLimitKey); // Clear rate limit on error
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Thread Creation Failed",
          "An error occurred while creating the modmail thread"
        ),
      ],
    });
  }

  if (!result?.success) {
    log.error(`Failed to create modmail thread: ${result?.error}`);

    // Clear rate limit if it's not an "already open" error
    if (!result?.error?.includes("already open")) {
      await redisClient.del(rateLimitKey);
    }

    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Thread Creation Failed",
          result?.error || "Failed to create modmail thread"
        ),
      ],
    });
  }

  // Handle DM failure (following gotMail pattern)
  if (!result.dmSuccess) {
    await redisClient.del(rateLimitKey); // Clear rate limit since thread was created

    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.warning(
          client,
          "Thread Created - DM Failed",
          `Modmail thread created for ${user.tag}, but I was unable to send them a DM. They may have DMs disabled.\n\nThe thread is still active and they can communicate through the server.`
        ),
      ],
      components: ButtonWrapper([
        new ButtonBuilder()
          .setLabel("Goto Thread")
          .setStyle(ButtonStyle.Link)
          .setEmoji("🔗")
          .setURL(result.thread!.url),
      ]),
    });
  }

  // Success - clear rate limit and set command cooldown
  await redisClient.del(rateLimitKey);
  setCommandCooldown(globalCooldownKey(interaction.commandName), 60);

  await interaction.editReply({
    content: "",
    embeds: [
      ModmailEmbeds.success(
        client,
        "Thread Opened",
        `Modmail thread opened for ${user.tag} (${user.id})\n\nThe DM has been sent to the user successfully`,
        [{ name: "Reason", value: reason, inline: false }]
      ),
    ],
    components: ButtonWrapper([
      new ButtonBuilder()
        .setLabel("Goto Thread")
        .setStyle(ButtonStyle.Link)
        .setEmoji("🔗")
        .setURL(result.thread!.url),
    ]),
  });
}
