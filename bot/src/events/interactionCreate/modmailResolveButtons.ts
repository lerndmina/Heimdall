import {
  ButtonInteraction,
  ChannelType,
  Client,
  InteractionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ThreadChannel,
} from "discord.js";
import Database from "../../utils/data/database";
import Modmail from "../../models/Modmail";
import ModmailConfig from "../../models/ModmailConfig";
import { ThingGetter } from "../../utils/TinyUtils";
import { handleTag } from "../messageCreate/gotMail";
import FetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";
import ModmailCache from "../../utils/ModmailCache";
import {
  sendModmailCloseMessage,
  sendMessageToBothChannels,
  createDisabledResolveButtons,
  getModmailUserDisplayName,
} from "../../utils/ModmailUtils";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";

const env = FetchEnvs();

export default async (interaction: ButtonInteraction, client: Client<true>) => {
  if (interaction.type !== InteractionType.MessageComponent) return false;
  if (!interaction.isButton()) return false;

  const customId = interaction.customId;
  if (
    !customId.startsWith("modmail_resolve_") &&
    !customId.startsWith("modmail_claim") &&
    !customId.startsWith("modmail_confirm_resolve_close") &&
    !customId.startsWith("modmail_cancel_resolve_close")
  )
    return false;

  const db = new Database();
  const getter = new ThingGetter(client);

  try {
    // Handle cancel resolve close confirmation
    if (customId === "modmail_cancel_resolve_close") {
      await interaction.update({
        content: "❌ Close cancelled.",
        embeds: [],
        components: [],
      });
      return true;
    }

    // Handle confirmed resolve close
    if (customId === "modmail_confirm_resolve_close_yes") {
      return await handleConfirmedResolveClose(interaction, client, db, getter);
    }

    await interaction.deferReply({ ephemeral: true });

    // Find modmail by user ID (if in DMs) or by thread ID (if in thread)
    let modmail;

    if (interaction.channel?.type === 1) {
      // DM channel
      modmail = await db.findOne(Modmail, { userId: interaction.user.id }, true);
    } else if (interaction.channel?.isThread()) {
      modmail = await db.findOne(Modmail, { forumThreadId: interaction.channel.id }, true);
    }

    if (!modmail) {
      return interaction.editReply({
        content: "❌ Could not find an associated modmail thread.",
      });
    }

    if (customId === "modmail_claim") {
      // Handle claim button
      const hasStaffRole =
        interaction.member?.roles &&
        typeof interaction.member.roles !== "string" &&
        "cache" in interaction.member.roles
          ? interaction.member.roles.cache.has(env.STAFF_ROLE)
          : false;

      if (!hasStaffRole) {
        return interaction.editReply({
          content: "❌ You need to be a staff member to claim this ticket.",
        });
      }

      // Initial check if already claimed (prevents unnecessary database operations)
      if (modmail.claimedBy) {
        if (modmail.claimedBy === interaction.user.id) {
          return interaction.editReply({
            content: `ℹ️ You have already claimed this ticket.`,
          });
        } else {
          return interaction.editReply({
            content: `❌ This ticket has already been claimed by <@${modmail.claimedBy}>.`,
          });
        }
      }

      // Use atomic operation to prevent race conditions
      // Only update if the ticket is not already claimed
      const updateResult = await db.findOneAndUpdate(
        Modmail,
        {
          _id: modmail._id,
          $or: [{ claimedBy: { $exists: false } }, { claimedBy: null }],
        },
        {
          claimedBy: interaction.user.id,
          claimedAt: new Date(),
        },
        { upsert: false, new: true }
      );

      // If updateResult is null, the ticket was already claimed
      if (!updateResult) {
        // Fetch the updated document to see who claimed it
        const updatedModmail = await db.findOne(Modmail, { _id: modmail._id });

        if (updatedModmail?.claimedBy === interaction.user.id) {
          return interaction.editReply({
            content: `ℹ️ You have already claimed this ticket.`,
          });
        } else {
          return interaction.editReply({
            content: `❌ This ticket has already been claimed by <@${updatedModmail?.claimedBy}>.`,
          });
        }
      }

      // Send claim notification
      // Get the proper username/member name for the staff member
      const staffDisplayName = await getModmailUserDisplayName(
        getter,
        interaction.user,
        interaction.guild
      );

      const claimEmbed = ModmailEmbeds.ticketClaimed(client, staffDisplayName);

      await sendMessageToBothChannels(client, modmail, claimEmbed);

      // Update the thread name to include the claimed staff member
      if (interaction.channel?.isThread()) {
        const { updateModmailThreadName } = await import("../../utils/ModmailUtils");
        const userDisplayName = await getModmailUserDisplayName(
          getter,
          await getter.getUser(modmail.userId),
          interaction.guild
        );

        await updateModmailThreadName(
          interaction.channel as ThreadChannel,
          userDisplayName,
          interaction.user.username
        );
      }

      await interaction.editReply({
        content: `✅ Successfully claimed ticket for <@${modmail.userId}>. You can now assist them in the thread.`,
      });

      log.info(`Modmail ${modmail._id} claimed by staff member ${interaction.user.id}`);
      return true;
    }
    if (customId === "modmail_resolve_close") {
      // Handle close resolution
      // Check if user is the ticket owner
      const isOwner = modmail.userId === interaction.user.id;

      if (!isOwner) {
        return interaction.editReply({
          content: "❌ Only the ticket owner can close this thread.",
        });
      }

      // Show confirmation for resolve close
      const confirmButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("modmail_confirm_resolve_close_yes")
          .setLabel("Yes, Close Thread")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("✅"),
        new ButtonBuilder()
          .setCustomId("modmail_cancel_resolve_close")
          .setLabel("No, Keep Open")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("❌")
      );

      const confirmEmbed = ModmailEmbeds.confirmCloseResolved(client);

      await interaction.editReply({
        embeds: [confirmEmbed],
        components: [confirmButtons],
      });

      return true;
    }

    if (customId === "modmail_resolve_continue") {
      // Handle continue resolution
      // Check if user is the ticket owner
      const isOwner = modmail.userId === interaction.user.id;

      if (!isOwner) {
        return interaction.editReply({
          content: "❌ Only the ticket owner can use this button.",
        });
      } // Update modmail to unmark as resolved
      await db.findOneAndUpdate(
        Modmail,
        { _id: modmail._id },
        {
          markedResolved: false,
          resolvedAt: null,
          autoCloseScheduledAt: null,
          // Reset activity tracking
          lastUserActivityAt: new Date(),
          inactivityNotificationSent: null,
        },
        { upsert: false, new: true }
      );

      // Disable the buttons in the original message
      try {
        if (interaction.message && interaction.channel?.type === 1) {
          // Only edit if in DM channel
          await interaction.message.edit({
            embeds: interaction.message.embeds,
            components: [createDisabledResolveButtons()],
          });
        }
      } catch (error) {
        log.warn("Failed to disable resolve buttons:", error);
      }

      // Send continuation message
      // Get the proper username for the user requesting help
      const userDisplayName = await getModmailUserDisplayName(
        getter,
        interaction.user,
        interaction.guild
      );
      const continueEmbed = ModmailEmbeds.additionalHelpRequested(client, userDisplayName);

      await sendMessageToBothChannels(client, modmail, continueEmbed);

      await interaction.editReply({
        content: `✅ Your request for additional help has been noted. A staff member will continue to assist you.`,
      });

      log.info(`Modmail ${modmail._id} reopened by user ${interaction.user.id}`);
      return true;
    }

    return false;
  } catch (error) {
    log.error("Error in modmail resolve/claim button handler:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content: "❌ An error occurred while processing your request.",
      });
    }
    return true;
  }
};

async function handleConfirmedResolveClose(
  interaction: ButtonInteraction,
  client: Client<true>,
  db: Database,
  getter: ThingGetter
) {
  await interaction.deferUpdate();

  // Find modmail again
  let modmail;
  if (interaction.channel?.type === 1) {
    modmail = await db.findOne(Modmail, { userId: interaction.user.id });
  } else if (interaction.channel?.isThread()) {
    modmail = await db.findOne(Modmail, { forumThreadId: interaction.channel.id });
  }

  if (!modmail) {
    return interaction.editReply({
      content: "❌ Could not find an associated modmail thread.",
      embeds: [],
      components: [],
    });
  }

  const closedBy = "User";
  const closedByName = await getModmailUserDisplayName(getter, interaction.user, interaction.guild);
  const reason = "Resolved - Closed by user";

  // Disable the buttons in the original message
  try {
    if (interaction.message && interaction.channel?.type === 1) {
      // Only edit if in DM channel
      await interaction.message.edit({
        embeds: interaction.message.embeds,
        components: [createDisabledResolveButtons()],
      });
    }
  } catch (error) {
    log.warn("Failed to disable resolve buttons:", error);
  }

  // Send closure message using consistent styling
  await sendModmailCloseMessage(client, modmail, closedBy, closedByName, reason);

  // Update tags to closed
  const config = await ModmailCache.getModmailConfig(modmail.guildId, db);
  if (config) {
    const forumThread = await getter.getChannel(modmail.forumThreadId);
    if (forumThread && "setLocked" in forumThread) {
      const forumChannel = await getter.getChannel(config.forumChannelId);
      if (forumChannel && forumChannel.type === ChannelType.GuildForum) {
        await handleTag(null, config, db, forumThread, forumChannel);
      } else if (forumChannel) {
        log.warn(`Expected forum channel type GuildForum, got ${forumChannel.type}`);
      }

      // Lock and archive thread
      try {
        await forumThread.setLocked(true, `${closedBy} closed: ${reason}`);
        await forumThread.setArchived(true, `${closedBy} closed: ${reason}`);
      } catch (error) {
        log.warn(`Failed to lock/archive thread ${modmail.forumThreadId}:`, error);
      }
    }
  }

  // Remove from database
  const env = FetchEnvs();
  await db.deleteOne(Modmail, { _id: modmail._id });
  await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`);

  await interaction.editReply({
    content: `✅ Thread closed successfully! Thank you for using our support system.`,
    embeds: [],
    components: [],
  });

  return true;
}
