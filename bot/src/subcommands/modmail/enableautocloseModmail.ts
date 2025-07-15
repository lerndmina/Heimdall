import { ChannelType, PermissionFlagsBits } from "discord.js";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import Modmail from "../../models/Modmail";
import { ThingGetter } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import { SlashCommandProps } from "commandkit";
import log from "../../utils/log";
import { initialReply } from "../../utils/initialReply";
import { sendMessageToBothChannels, getModmailUserDisplayName } from "../../utils/ModmailUtils";

export default async function ({ interaction, client }: SlashCommandProps) {
  if (!interaction.channel)
    return log.error("Request made to slash command without required values - enableautoclose.ts");

  // Check if user has Manage Server permission
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      embeds: [ModmailEmbeds.noPermission(client)],
      ephemeral: true,
    });
  }

  // Find the modmail thread
  let mail = await Modmail.findOne({ forumThreadId: interaction.channel.id, isClosed: false });
  if (!mail && interaction.channel.type === ChannelType.DM) {
    mail = await Modmail.findOne({ userId: interaction.user.id, isClosed: false });
  }

  if (!mail) {
    return interaction.reply({
      embeds: [ModmailEmbeds.notModmailThread(client)],
      ephemeral: true,
    });
  }

  // Check if auto-close is already enabled
  if (!mail.autoCloseDisabled) {
    return interaction.reply({
      embeds: [ModmailEmbeds.autoCloseAlreadyEnabled(client)],
      ephemeral: true,
    });
  }

  await initialReply(interaction, true);

  try {
    const db = new Database();

    // PERMANENT AUTO-CLOSE RE-ENABLE: This re-enables inactivity processing
    // This will restore normal inactivity warnings and auto-close behavior
    await db.findOneAndUpdate(
      Modmail,
      { _id: mail._id },
      {
        autoCloseDisabled: false,
        // Reset activity tracking to start fresh
        lastUserActivityAt: new Date(),
        inactivityNotificationSent: null,
        autoCloseScheduledAt: null,
      },
      { upsert: false, new: true }
    );

    // Send confirmation message to the thread
    const getter = new ThingGetter(client);
    const forumThread = await getter.getChannel(mail.forumThreadId);

    if (forumThread && "send" in forumThread) {
      const username = await getModmailUserDisplayName(getter, interaction.user, interaction.guild);
      const embed = ModmailEmbeds.autoCloseEnabled(client, username);

      const data = await sendMessageToBothChannels(client, mail, embed, undefined, {});
      if (!data.dmSuccess) {
        log.warn(`Failed to send DM to user ${mail.userId} for modmail ${mail._id}`);
      }
      if (!data.threadSuccess) {
        log.warn(`Failed to send message to modmail thread ${mail.forumThreadId}`);
      }
    }

    await interaction.editReply({
      embeds: [ModmailEmbeds.autoCloseEnabledSuccess(client)],
    });

    log.info(`Auto-close re-enabled for modmail ${mail._id} by user ${interaction.user.id}`);
  } catch (error) {
    log.error("Error re-enabling auto-close for modmail:", error);

    await interaction.editReply({
      embeds: [
        ModmailEmbeds.commandError(
          client,
          "An error occurred while re-enabling auto-close for this thread."
        ),
      ],
    });
  }
}
