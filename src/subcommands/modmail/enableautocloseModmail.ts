import { ChannelType, PermissionFlagsBits } from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import Modmail from "../../models/Modmail";
import { ThingGetter } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import { SlashCommandProps } from "commandkit";
import log from "../../utils/log";
import { initialReply } from "../../utils/initialReply";
import { sendMessageToBothChannels } from "../../utils/ModmailUtils";

export default async function ({ interaction, client }: SlashCommandProps) {
  if (!interaction.channel)
    return log.error("Request made to slash command without required values - enableautoclose.ts");

  // Check if user has Manage Server permission
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Permission Denied",
          "You need the **Manage Server** permission to use this command.",
          undefined,
          "Red"
        ),
      ],
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
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "This command can only be used in a modmail thread.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
  }

  // Check if auto-close is already enabled
  if (!mail.autoCloseDisabled) {
    return interaction.reply({
      embeds: [
        BasicEmbed(
          client,
          "ℹ️ Already Enabled",
          "Auto-closing is already enabled for this modmail thread.",
          undefined,
          "Blue"
        ),
      ],
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
      const embed = BasicEmbed(
        client,
        "🔓 Auto-Close Re-Enabled",
        `Auto-closing has been **re-enabled** for this modmail thread by ${interaction.user.username}.\n\n` +
          `This thread will now receive inactivity warnings and may be automatically closed due to inactivity.`,
        undefined,
        "Green"
      );

      const data = await sendMessageToBothChannels(client, mail, embed, undefined, {});
      if (!data.dmSuccess) {
        log.warn(`Failed to send DM to user ${mail.userId} for modmail ${mail._id}`);
      }
      if (!data.threadSuccess) {
        log.warn(`Failed to send message to modmail thread ${mail.forumThreadId}`);
      }
    }

    await interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "✅ Success",
          `Auto-closing has been re-enabled for this modmail thread.\n\n` +
            `This thread will now receive inactivity warnings and may be automatically closed.`,
          undefined,
          "Green"
        ),
      ],
    });

    log.info(`Auto-close re-enabled for modmail ${mail._id} by user ${interaction.user.id}`);
  } catch (error) {
    log.error("Error re-enabling auto-close for modmail:", error);

    await interaction.editReply({
      embeds: [
        BasicEmbed(
          client,
          "❌ Error",
          "An error occurred while re-enabling auto-close for this thread.",
          undefined,
          "Red"
        ),
      ],
    });
  }
}
