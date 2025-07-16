import {
  ButtonInteraction,
  ChannelType,
  Client,
  InteractionType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import Database from "../../utils/data/database";
import Modmail, { ModmailType } from "../../models/Modmail";
import ModmailConfig from "../../models/ModmailConfig";
import { ThingGetter } from "../../utils/TinyUtils";
import { handleTag } from "../messageCreate/gotMail";
import FetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";
import {
  sendModmailCloseMessage,
  sendMessageToBothChannels,
  markModmailAsResolved,
  getModmailUserDisplayName,
} from "../../utils/ModmailUtils";
import BasicEmbed from "../../utils/BasicEmbed";

const env = FetchEnvs();

// Extended types that include MongoDB document fields
type ModmailDoc = ModmailType & { _id: string; createdAt?: Date; updatedAt?: Date };

export default async (interaction: ButtonInteraction, client: Client<true>) => {
  if (interaction.type !== InteractionType.MessageComponent) return false;
  if (!interaction.isButton()) return false;
  const customId = interaction.customId;

  // Only handle specific staff action buttons
  const staffButtons = ["modmail_mark_resolved", "modmail_close_with_reason", "modmail_ban_user"];
  if (!staffButtons.includes(customId)) {
    return false; // Let other handlers handle non-staff buttons
  }

  const db = new Database();
  const getter = new ThingGetter(client);
  try {
    // Find modmail by user ID (if in DMs) or by thread ID (if in thread)
    let modmail: ModmailDoc | null = null;

    if (interaction.channel?.type === 1) {
      // DM channel - only find open modmail threads
      modmail = (await db.findOne(
        Modmail,
        { userId: interaction.user.id, isClosed: false },
        true
      )) as ModmailDoc;
    } else if (interaction.channel?.isThread()) {
      // Thread channel - only find open modmail threads
      modmail = (await db.findOne(
        Modmail,
        {
          forumThreadId: interaction.channel.id,
          isClosed: false,
        },
        true
      )) as ModmailDoc;
    }

    if (!modmail) {
      await interaction.reply({
        content: "❌ Could not find an associated modmail thread.",
        ephemeral: true,
      });
      return true;
    }

    // Check if user has staff role for all actions
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

    switch (customId) {
      case "modmail_mark_resolved":
        return await handleMarkResolved(interaction, client, modmail, db, getter);

      case "modmail_close_with_reason":
        return await handleCloseWithReason(interaction, modmail);

      case "modmail_ban_user":
        return await handleBanUser(interaction, modmail);

      default:
        return false;
    }
  } catch (error) {
    log.error("Error in modmail action button handler:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing your request.",
        ephemeral: true,
      });
    } else if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({
        content: "❌ An error occurred while processing your request.",
      });
    }

    return true;
  }
};

/**
 * Handle mark resolved button
 */
async function handleMarkResolved(
  interaction: ButtonInteraction,
  client: Client<true>,
  modmail: ModmailDoc,
  db: Database,
  getter: ThingGetter
): Promise<boolean> {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Get the proper display name for the resolving user
    const resolvedByUsername = await getModmailUserDisplayName(
      getter,
      interaction.user,
      interaction.guild
    );

    // Use the centralized function to mark as resolved
    const result = await markModmailAsResolved(
      client,
      modmail,
      resolvedByUsername,
      interaction.user.id
    );

    if (!result.success) {
      if (result.alreadyResolved) {
        await interaction.editReply({
          content: "ℹ️ This modmail thread has already been marked as resolved.",
        });
        return true;
      }

      await interaction.editReply({
        content: "❌ An error occurred while marking this thread as resolved.",
      });
      return true;
    }

    await interaction.editReply({
      content:
        "✅ Thread marked as resolved. The user has been notified and can choose to close the thread or request more help.",
    });

    return true;
  } catch (error) {
    log.error("Error marking modmail as resolved:", error);

    await interaction.editReply({
      content: "❌ An error occurred while marking this thread as resolved.",
    });
    return true;
  }
}

/**
 * Handle close with reason button
 */
async function handleCloseWithReason(
  interaction: ButtonInteraction,
  modmail: ModmailDoc
): Promise<boolean> {
  try {
    const modal = new ModalBuilder()
      .setCustomId(`modmail_close_modal:${modmail._id}`)
      .setTitle("Close Modmail Thread");

    const reasonInput = new TextInputBuilder()
      .setCustomId("close_reason")
      .setLabel("Reason for closing")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Enter the reason for closing this modmail thread...")
      .setMaxLength(1000)
      .setRequired(true);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
    return true;
  } catch (error) {
    log.error("Error showing close modal:", error);
    await interaction.reply({
      content: "❌ An error occurred while opening the close modal.",
      ephemeral: true,
    });
    return true;
  }
}

/**
 * Handle ban user button
 */
async function handleBanUser(
  interaction: ButtonInteraction,
  modmail: ModmailDoc
): Promise<boolean> {
  try {
    const modal = new ModalBuilder()
      .setCustomId(`modmail_ban_modal:${modmail._id}:${modmail.userId}`)
      .setTitle("Ban User from Modmail");

    const reasonInput = new TextInputBuilder()
      .setCustomId("ban_reason")
      .setLabel("Reason for ban")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Enter the reason for banning this user from modmail...")
      .setMaxLength(1000)
      .setRequired(true);

    const durationInput = new TextInputBuilder()
      .setCustomId("ban_duration")
      .setLabel("Duration (e.g., 1d, 1w, 1m, permanent)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("1d, 1w, 1m, permanent")
      .setMaxLength(20)
      .setRequired(true);

    const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
    const durationRow = new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput);

    modal.addComponents(reasonRow, durationRow);

    await interaction.showModal(modal);
    return true;
  } catch (error) {
    log.error("Error showing ban modal:", error);
    await interaction.reply({
      content: "❌ An error occurred while opening the ban modal.",
      ephemeral: true,
    });
    return true;
  }
}
