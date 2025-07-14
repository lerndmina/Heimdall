import {
  ButtonInteraction,
  ChannelType,
  Client,
  InteractionType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import Database from "../../utils/data/database";
import Modmail from "../../models/Modmail";
import ModmailConfig from "../../models/ModmailConfig";
import { ThingGetter } from "../../utils/TinyUtils";
import { handleTag } from "../messageCreate/gotMail";
import FetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";
import { sendModmailCloseMessage, getModmailUserDisplayName } from "../../utils/ModmailUtils";
import ModmailCache from "../../utils/ModmailCache";
import BasicEmbed from "../../utils/BasicEmbed";

const env = FetchEnvs();

export default async (interaction: ButtonInteraction, client: Client<true>) => {
  if (interaction.type !== InteractionType.MessageComponent) return false;
  if (!interaction.isButton()) return false;

  // Handle both close thread buttons and confirmation buttons
  if (
    !interaction.customId.startsWith("modmail_close_thread") &&
    !interaction.customId.startsWith("modmail_confirm_close") &&
    !interaction.customId.startsWith("modmail_cancel_close")
  ) {
    return false;
  }

  const db = new Database();
  const getter = new ThingGetter(client);

  try {
    // Handle cancel close confirmation
    if (interaction.customId === "modmail_cancel_close") {
      // Clear any potential close-with-message flag
      const closeWithMessageKey = `${env.MODMAIL_TABLE}:close_with_message:${interaction.user.id}`;
      await (await import("../../Bot")).redisClient.del(closeWithMessageKey);

      await interaction.update({
        content: "❌ Close cancelled.",
        embeds: [],
        components: [],
      });
      return true;
    } // Handle confirmed close
    if (interaction.customId === "modmail_confirm_close_yes") {
      return await handleConfirmedClose(interaction, client, db, getter);
    }

    // Handle close with message
    if (interaction.customId === "modmail_confirm_close_with_message") {
      return await handleCloseWithMessage(interaction, client, db, getter);
    }

    // Handle initial close button click
    if (interaction.customId.startsWith("modmail_close_thread")) {
      return await handleInitialClose(interaction, client, db, getter);
    }

    return false;
  } catch (error) {
    log.error("Error in modmail close button handler:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred while processing the button interaction.",
        ephemeral: true,
      });
    } else {
      await interaction.editReply({
        content: "❌ An error occurred while processing the button interaction.",
      });
    }

    return true;
  }
};

async function handleInitialClose(
  interaction: ButtonInteraction,
  client: Client<true>,
  db: Database,
  getter: ThingGetter
) {
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

  // Check if user is allowed to close based on context
  const isOwner = modmail.userId === interaction.user.id;
  const isDMChannel = interaction.channel?.type === 1;
  const isThreadChannel = interaction.channel?.isThread();

  if (isDMChannel) {
    // In DMs: Only the thread owner can close, show confirmation
    if (!isOwner) {
      return interaction.editReply({
        content: "❌ You can only close your own modmail thread.",
      });
    } // Show confirmation for DM close
    const confirmButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("modmail_confirm_close_yes")
        .setLabel("Yes, Close Thread")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId("modmail_confirm_close_with_message")
        .setLabel("Yes, Close with Message")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("💬"),
      new ButtonBuilder()
        .setCustomId("modmail_cancel_close")
        .setLabel("No, Keep Open")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌")
    );

    const confirmEmbed = BasicEmbed(
      client,
      "🔒 Confirm Close Thread",
      "Are you sure you want to close this modmail thread?",
      undefined,
      "Yellow"
    );

    await interaction.editReply({
      embeds: [confirmEmbed],
      components: [confirmButtons],
    });

    return true;
  } else if (isThreadChannel) {
    // In threads: Only staff can close, no confirmation needed
    const interactionMember = await getter.getMember(interaction.guild, interaction.user.id);
    const isStaff = interactionMember?.permissions.has("ManageMessages");
    if (!isStaff) {
      return interaction.editReply({
        content: "❌ You need to be a staff member to close modmail threads in the server.",
      });
    }

    // Proceed directly with close for staff
    return await handleConfirmedClose(interaction, client, db, getter, true);
  } else {
    // Unknown channel type
    return interaction.editReply({
      content: "❌ This button can only be used in DMs or modmail threads.",
    });
  }
}

async function handleConfirmedClose(
  interaction: ButtonInteraction,
  client: Client<true>,
  db: Database,
  getter: ThingGetter,
  isStaffDirectClose = false
) {
  if (!isStaffDirectClose) {
    await interaction.deferUpdate();
  }

  // Find modmail again
  let modmail;
  if (interaction.channel?.type === 1) {
    modmail = await db.findOne(Modmail, { userId: interaction.user.id }, true);
  } else if (interaction.channel?.isThread()) {
    modmail = await db.findOne(Modmail, { forumThreadId: interaction.channel.id }, true);
  }

  if (!modmail) {
    const content = "❌ Could not find an associated modmail thread.";
    if (isStaffDirectClose) {
      return interaction.editReply({ content });
    } else {
      return interaction.editReply({ content, embeds: [], components: [] });
    }
  }

  const isDMChannel = interaction.channel?.type === 1;
  const closedBy = isDMChannel ? "User" : "Staff";
  const closedByName = await getModmailUserDisplayName(getter, interaction.user, interaction.guild);
  const reason = isDMChannel ? "Closed by user via button" : "Closed via inactivity button";

  // Get the forum thread
  const forumThread = await getter.getChannel(modmail.forumThreadId);
  if (!forumThread || !("setLocked" in forumThread)) {
    const content = "❌ Could not access the modmail thread.";
    if (isStaffDirectClose) {
      return interaction.editReply({ content });
    } else {
      return interaction.editReply({ content, embeds: [], components: [] });
    }
  }

  // Send closure message using consistent styling
  await sendModmailCloseMessage(client, modmail, closedBy, closedByName, reason);

  // Update tags to closed
  const config = await ModmailCache.getModmailConfig(modmail.guildId, db);
  if (config) {
    const forumChannel = await getter.getChannel(config.forumChannelId);
    if (forumChannel.type === ChannelType.GuildForum) {
      await handleTag(null, config, db, forumThread, forumChannel);
    }
  }

  // Lock and archive thread
  try {
    await forumThread.setLocked(true, `${closedBy} closed via button: ${reason}`);
    await forumThread.setArchived(true, `${closedBy} closed via button: ${reason}`);
  } catch (error) {
    log.warn(`Failed to lock/archive thread ${modmail.forumThreadId}:`, error);
  }

  // Remove from database
  await db.deleteOne(Modmail, { _id: modmail._id });
  const env = FetchEnvs();
  await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`); // Disable buttons in the original message if it was a DM close with confirmation
  if (isDMChannel && !isStaffDirectClose) {
    await interaction.editReply({
      content: `✅ Modmail thread closed successfully! (Closed by ${closedBy.toLowerCase()})`,
      embeds: [],
      components: [],
    });
  } else {
    if (isStaffDirectClose) {
      await interaction.editReply({
        content: `✅ Modmail thread closed successfully! (Closed by ${closedBy.toLowerCase()})`,
      });
    }
  }

  return true;
}

async function handleCloseWithMessage(
  interaction: ButtonInteraction,
  client: Client<true>,
  db: Database,
  getter: ThingGetter
) {
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
  // Create and show modal for final message
  const modal = new ModalBuilder()
    .setCustomId(`modmail_close_with_message_modal:${modmail._id}`)
    .setTitle("Close Thread with Final Message");

  const messageInput = new TextInputBuilder()
    .setCustomId("final_message")
    .setLabel("Your final message")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Type your final message here...")
    .setMaxLength(2000)
    .setRequired(true);

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
  return true;
}
