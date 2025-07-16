import {
  Client,
  ModalSubmitInteraction,
  ThreadChannel,
  ForumChannel,
  ChannelType,
} from "discord.js";
import log from "../../utils/log";
import Database from "../../utils/data/database";
import Modmail, { ModmailType } from "../../models/Modmail";
import ModmailConfig from "../../models/ModmailConfig";
import ModmailBanModel, { ModmailBanType } from "../../models/ModmailBans";
import { ThingGetter, getDiscordDate, TimeType } from "../../utils/TinyUtils";
import { handleTag } from "../messageCreate/gotMail";
import { sendModmailCloseMessage, getModmailUserDisplayName } from "../../utils/ModmailUtils";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs from "../../utils/FetchEnvs";
import ms from "ms";
import ModmailCache from "../../utils/ModmailCache";
import ModmailMessageService from "../../services/ModmailMessageService";
import { closeModmailThreadSafe } from "../../utils/modmail/ModmailThreads";

const env = FetchEnvs();

// Extended types that include MongoDB document fields
type ModmailDoc = ModmailType & { _id: string; createdAt?: Date; updatedAt?: Date };

export default async (interaction: ModalSubmitInteraction, client: Client<true>) => {
  if (!interaction.isModalSubmit()) return false;

  // Handle user close with message modal (doesn't require staff role)
  if (interaction.customId.startsWith("modmail_close_with_message_modal")) {
    const [action, modmailId] = interaction.customId.split(":");
    return await handleCloseWithMessageModal(interaction, client, modmailId);
  }

  // Handle modmail modals (require staff role)
  if (interaction.customId.startsWith("modmail_")) {
    // Require staff role permission
    const hasStaffRole =
      interaction.member?.roles &&
      typeof interaction.member.roles !== "string" &&
      "cache" in interaction.member.roles
        ? interaction.member.roles.cache.has(env.STAFF_ROLE)
        : false;

    if (!hasStaffRole) {
      await interaction.reply({
        content: "❌ You need to be a staff member to use these modmail actions.",
        ephemeral: true,
      });
      return true;
    }

    const [action, ...args] = interaction.customId.split(":");

    switch (action) {
      case "modmail_close_modal":
        return await handleCloseModal(interaction, client, args[0]);

      case "modmail_ban_modal":
        return await handleBanModal(interaction, client, args[0], args[1]);

      default:
        return false;
    }
  }

  return false;
};

/**
 * Handle close modmail modal submission
 */
async function handleCloseModal(
  interaction: ModalSubmitInteraction,
  client: Client<true>,
  modmailId: string
): Promise<boolean> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const reason = interaction.fields.getTextInputValue("close_reason");
    const db = new Database();
    const getter = new ThingGetter(client); // Find the modmail
    const modmail = (await db.findOne(Modmail, { _id: modmailId })) as ModmailDoc;
    if (!modmail) {
      await interaction.editReply({
        content: "❌ Modmail thread not found.",
      });
      return true;
    }

    const closedBy = "Staff";
    const closedByName = await getModmailUserDisplayName(
      getter,
      interaction.user,
      interaction.guild
    );

    // Send closure message using consistent styling
    await sendModmailCloseMessage(client, modmail, closedBy, closedByName, reason);

    // Get the forum thread
    const forumThread = (await getter.getChannel(modmail.forumThreadId)) as ThreadChannel;
    // Update tags to closed
    const config = await ModmailCache.getModmailConfig(modmail.guildId, db);
    if (config && forumThread) {
      const forumChannel = (await getter.getChannel(config.forumChannelId)) as ForumChannel;
      if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
        await handleTag(null, config, db, forumThread, forumChannel);
      }
    }

    // Lock and archive thread
    if (forumThread && "setLocked" in forumThread) {
      try {
        await forumThread.setLocked(true, `${closedBy} closed: ${reason}`);
        await forumThread.setArchived(true, `${closedBy} closed: ${reason}`);
      } catch (error) {
        log.warn(`Failed to lock/archive thread ${modmail.forumThreadId}:`, error);
      }
    }

    const closeData = await closeModmailThreadSafe(modmail.forumThreadId, reason, {
      type: closedBy,
      username: closedByName,
      userId: interaction.user.id,
    });

    if (!closeData.success) {
      // Rethrow to hit the catch block
      throw new Error(closeData.error || "Failed to close modmail thread");
    }

    await interaction.editReply({
      content: `✅ Modmail thread closed successfully!\n**Reason:** ${reason}`,
    });

    log.info(
      `Modmail ${modmail._id} closed by staff member ${interaction.user.id} with reason: ${reason}`
    );
    return true;
  } catch (error) {
    log.error("Error handling close modal:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while closing the modmail thread.",
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content: "❌ An error occurred while closing the modmail thread.",
      });
    }
    return true;
  }
}

/**
 * Handle ban user modal submission
 */
async function handleBanModal(
  interaction: ModalSubmitInteraction,
  client: Client<true>,
  modmailId: string,
  userId: string
): Promise<boolean> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const reason = interaction.fields.getTextInputValue("ban_reason");
    const durationString = interaction.fields.getTextInputValue("ban_duration").toLowerCase();

    const db = new Database();
    const getter = new ThingGetter(client); // Find the modmail and user
    const modmail = (await db.findOne(Modmail, { _id: modmailId })) as ModmailDoc;
    if (!modmail) {
      await interaction.editReply({
        content: "❌ Modmail thread not found.",
      });
      return true;
    }

    const user = await getter.getUser(userId);
    if (!user) {
      await interaction.editReply({
        content: "❌ User not found.",
      });
      return true;
    }

    // Parse duration
    let duration: number | undefined;
    let isPermanent = false;
    let expiresAt: Date | undefined;
    let durationFormatted = "";

    if (durationString === "permanent" || durationString === "perm") {
      isPermanent = true;
      durationFormatted = "Permanent";
    } else {
      try {
        duration = ms(durationString);
        if (!duration || duration <= 0) {
          await interaction.editReply({
            content: "❌ Invalid duration format. Use formats like: 1d, 1w, 1m, or 'permanent'",
          });
          return true;
        }
        expiresAt = new Date(Date.now() + duration);
        durationFormatted = ms(duration, { long: true });
      } catch (error) {
        await interaction.editReply({
          content: "❌ Invalid duration format. Use formats like: 1d, 1w, 1m, or 'permanent'",
        });
        return true;
      }
    } // Check for existing ban
    const existing = await db.findOne(ModmailBanModel, { userId: user.id });

    const modmailBan: Partial<ModmailBanType> = {
      userId: user.id,
      guildId: interaction.guildId!,
      bannedBy: interaction.user.id,
      reason,
      duration: isPermanent ? undefined : duration,
      permanent: isPermanent,
      expiresAt: isPermanent ? undefined : expiresAt,
      bannedAt: new Date(),
    };

    if (existing) {
      // Prepare ban history array
      const banHistory = existing.previousBans || [];
      const existingBanForHistory = { ...existing };
      delete existingBanForHistory.previousBans;
      banHistory.push(existingBanForHistory);
      (modmailBan as any).previousBans = banHistory;

      await db.findOneAndUpdate(ModmailBanModel, { userId: user.id }, modmailBan);
    } else {
      await db.findOneAndUpdate(ModmailBanModel, modmailBan, { upsert: true, new: true });
    }

    // Try to DM the user
    try {
      const dmChannel = await user.createDM();
      await dmChannel.send({
        embeds: [
          BasicEmbed(
            client,
            "Modmail Ban",
            `You have been banned from using modmail in ${interaction.guild?.name}.\n\n` +
              `**Reason:** ${reason}\n` +
              `**Duration:** ${durationFormatted}\n` +
              `${
                isPermanent ? "" : `**Expires:** ${getDiscordDate(expiresAt!, TimeType.FULL_LONG)}`
              }`,
            undefined,
            "Red"
          ),
        ],
      });
    } catch (error) {
      log.warn(`Failed to send ban DM to user ${user.id}:`, error);
    }

    // Close the current modmail thread
    const closedBy = "Staff";
    const closedByName = await getModmailUserDisplayName(
      getter,
      interaction.user,
      interaction.guild
    );
    const closeReason = `User banned from modmail: ${reason}`;

    await sendModmailCloseMessage(client, modmail, closedBy, closedByName, closeReason);

    // Handle thread archiving
    const forumThread = await getter.getChannel(modmail.forumThreadId);
    const config = await ModmailCache.getModmailConfig(modmail.guildId, db);
    if (config && forumThread && "setLocked" in forumThread) {
      const forumChannel = await getter.getChannel(config.forumChannelId);
      if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
        await handleTag(null, config, db, forumThread, forumChannel as ForumChannel);
      }

      try {
        await forumThread.setLocked(true, closeReason);
        await forumThread.setArchived(true, closeReason);
      } catch (error) {
        log.warn(`Failed to lock/archive thread ${modmail.forumThreadId}:`, error);
      }
    }

    const closeData = await closeModmailThreadSafe(modmail.forumThreadId, reason, {
      type: closedBy,
      username: closedByName,
      userId: interaction.user.id,
    });

    if (!closeData.success) {
      // Rethrow to hit the catch block
      throw new Error(closeData.error || "Failed to close modmail thread");
    }

    await interaction.editReply({
      content:
        `✅ User ${user.username} has been banned from modmail.\n` +
        `**Reason:** ${reason}\n` +
        `**Duration:** ${durationFormatted}\n` +
        `**Thread closed and user notified.**`,
    });

    log.info(
      `User ${user.id} banned from modmail by ${interaction.user.id}. Reason: ${reason}, Duration: ${durationFormatted}`
    );
    return true;
  } catch (error) {
    log.error("Error handling ban modal:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing the ban.",
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content: "❌ An error occurred while processing the ban.",
      });
    }
    return true;
  }
}

/**
 * Handle close with message modal submission from user
 */
async function handleCloseWithMessageModal(
  interaction: ModalSubmitInteraction,
  client: Client<true>,
  modmailId: string
): Promise<boolean> {
  try {
    await interaction.deferReply({ ephemeral: true });

    const finalMessage = interaction.fields.getTextInputValue("final_message");
    const db = new Database();
    const getter = new ThingGetter(client);

    // Find the modmail
    const modmail = (await db.findOne(Modmail, { _id: modmailId })) as ModmailDoc;
    if (!modmail) {
      await interaction.editReply({
        content: "❌ Modmail thread not found.",
      });
      return true;
    }

    // Verify this is the thread owner
    if (modmail.userId !== interaction.user.id) {
      await interaction.editReply({
        content: "❌ You can only close your own modmail thread.",
      });
      return true;
    }

    // Send the final message to the thread first using webhook
    const config = await ModmailCache.getModmailConfig(modmail.guildId, db);
    if (config && config.webhookId && config.webhookToken) {
      try {
        const webhook = await client.fetchWebhook(config.webhookId, config.webhookToken);
        await webhook.send({
          content: ModmailMessageService.truncateMessage(finalMessage),
          threadId: modmail.forumThreadId,
          username: modmail.userDisplayName || interaction.user.displayName,
          avatarURL: modmail.userAvatar || interaction.user.displayAvatarURL(),
        });
      } catch (error) {
        log.error("Failed to send final message via webhook:", error);
        // Fallback to normal message
        const forumThread = (await getter.getChannel(modmail.forumThreadId)) as ThreadChannel;
        if (forumThread) {
          const userDisplayName = await getModmailUserDisplayName(
            getter,
            interaction.user,
            interaction.guild
          );
          await forumThread.send(`${userDisplayName} says: ${finalMessage}`);
        }
      }
    }

    // Now close the thread using the same logic as regular close
    const closedBy = "User";
    const closedByName = await getModmailUserDisplayName(
      getter,
      interaction.user,
      interaction.guild
    );
    const reason = "Closed by user with final message"; // Send closure message
    await sendModmailCloseMessage(client, modmail, closedBy, closedByName, reason);

    // Get the forum thread
    const forumThread = (await getter.getChannel(modmail.forumThreadId)) as ThreadChannel;

    // Update tags to closed
    if (config && forumThread) {
      const forumChannel = (await getter.getChannel(config.forumChannelId)) as ForumChannel;
      if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
        const { handleTag } = await import("../messageCreate/gotMail");
        await handleTag(null, config, db, forumThread, forumChannel);
      }
    }

    // Lock and archive thread
    if (forumThread && "setLocked" in forumThread) {
      try {
        await forumThread.setLocked(true, `${closedBy} closed: ${reason}`);
        await forumThread.setArchived(true, `${closedBy} closed: ${reason}`);
      } catch (error) {
        log.warn(`Failed to lock/archive thread ${modmail.forumThreadId}:`, error);
      }
    }

    const closeData = await closeModmailThreadSafe(modmail.forumThreadId, reason, {
      type: closedBy,
      username: closedByName,
      userId: interaction.user.id,
    });

    if (!closeData.success) {
      // Rethrow to hit the catch block
      throw new Error(closeData.error || "Failed to close modmail thread");
    }
    // Clean cache for both simple userId patterns and compound query patterns
    await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`);
    await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:*userId:*`);

    await interaction.editReply({
      content: "✅ Your final message has been sent and the modmail thread has been closed.",
    });

    return true;
  } catch (error) {
    log.error("Error handling close with message modal:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while closing the thread.",
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content: "❌ An error occurred while closing the thread.",
      });
    }
    return true;
  }
}
