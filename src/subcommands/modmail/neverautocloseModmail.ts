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
    return log.error("Request made to slash command without required values - neverautoclose.ts");

  // Check if user has Manage Server permission
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      embeds: [ModmailEmbeds.noPermission(client)],
      ephemeral: true,
    });
  }

  // Find the modmail thread
  let mail = await Modmail.findOne({ forumThreadId: interaction.channel.id });
  if (!mail && interaction.channel.type === ChannelType.DM) {
    mail = await Modmail.findOne({ userId: interaction.user.id });
  }

  if (!mail) {
    return interaction.reply({
      embeds: [ModmailEmbeds.notModmailThread(client)],
      ephemeral: true,
    });
  }

  // Check if auto-close is already disabled
  if (mail.autoCloseDisabled) {
    return interaction.reply({
      embeds: [ModmailEmbeds.autoCloseAlreadyDisabled(client)],
      ephemeral: true,
    });
  }

  await initialReply(interaction, true);

  try {
    const db = new Database(); // PERMANENT AUTO-CLOSE DISABLE: This permanently disables ALL inactivity processing
    // This is different from markedResolved which is temporary and only blocks warnings
    await db.findOneAndUpdate(
      Modmail,
      { _id: mail._id },
      {
        autoCloseDisabled: true,
        // Also clear any existing scheduling since we're permanently disabling auto-close
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
      const embed = ModmailEmbeds.autoCloseDisabled(client, username);

      const data = await sendMessageToBothChannels(client, mail, embed, undefined, {});
      if (!data.dmSuccess) {
        log.warn(`Failed to send DM to user ${mail.userId} for modmail ${mail._id}`);
      }
      if (!data.threadSuccess) {
        log.warn(`Failed to send message to modmail thread ${mail.forumThreadId}`);
      }
    }

    await interaction.editReply({
      embeds: [ModmailEmbeds.autoCloseDisabledSuccess(client)],
    });

    log.info(`Auto-close disabled for modmail ${mail._id} by user ${interaction.user.id}`);
  } catch (error) {
    log.error("Error disabling auto-close for modmail:", error);

    await interaction.editReply({
      embeds: [
        ModmailEmbeds.commandError(
          client,
          "An error occurred while disabling auto-close for this thread."
        ),
      ],
    });
  }
}
