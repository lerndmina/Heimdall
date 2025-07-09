import type { SlashCommandProps, CommandOptions } from "commandkit";
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
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import ButtonWrapper from "../../utils/ButtonWrapper";
import BasicEmbed from "../../utils/BasicEmbed";
import { ThingGetter } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import ModmailCache from "../../utils/ModmailCache";
import ModmailConfig from "../../models/ModmailConfig";
import Modmail from "../../models/Modmail";
import FetchEnvs from "../../utils/FetchEnvs";
import { createModmailThread } from "../../utils/ModmailUtils";
import { tryCatch } from "../../utils/trycatch";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import { validateModmailSetup } from "../../utils/modmail/ModmailValidation";
import {
  createModmailThreadSafe,
  cleanupModmailThread,
  checkExistingModmail,
} from "../../utils/modmail/ModmailThreads";
import log from "../../utils/log";

export const openModmailOptions: CommandOptions = {
  devOnly: false,
  deleted: true,
  userPermissions: ["ManageMessages", "KickMembers", "BanMembers"], // This is a mod command
};

/**
 * Open a modmail thread for a user (staff command)
 * - Creates a modmail thread in the forum channel
 * - Sends a DM to the user
 * - Enhanced error handling with tryCatch utility
 */
export default async function ({ interaction, client, handler }: SlashCommandProps) {
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

  // Validate complete modmail setup
  const db = new Database();
  const { data: validation, error: validationError } = await tryCatch(
    validateModmailSetup(user, { guild, client, db })
  );

  if (validationError) {
    log.error("Failed during modmail validation:", validationError);
    return interaction.editReply({
      content: "",
      embeds: [ModmailEmbeds.error(client, "Validation Error", "Failed to validate modmail setup")],
    });
  }

  if (!validation?.success) {
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

  const { member: targetMember, config: modmailConfig, channel } = validation.data!;

  // Check if user already has an open modmail thread
  const existingCheck = await checkExistingModmail(user.id);
  if (existingCheck.exists) {
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

  // Create the modmail thread using the safe wrapper
  const result = await createModmailThreadSafe(client, {
    guild,
    targetUser: user,
    targetMember,
    forumChannel: channel,
    modmailConfig,
    reason,
    openedBy: {
      type: "Staff",
      username: interaction.user.username,
      userId: interaction.user.id,
    },
  });

  if (!result.success) {
    return interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.error(
          client,
          "Thread Creation Failed",
          result.error || "Failed to create modmail thread"
        ),
      ],
    });
  }

  // Handle DM failure
  if (!result.dmSuccess) {
    await interaction.editReply({
      content: "",
      embeds: [
        ModmailEmbeds.warning(
          client,
          "DM Failed",
          `I was unable to send a DM to the user. This modmail thread will be closed. Please contact the user manually.`
        ),
      ],
    });

    // Clean up the created thread and database entry using the utility
    await cleanupModmailThread({
      thread: result.thread,
      modmail: result.modmail,
      reason: "DM failure cleanup",
    });

    setCommandCooldown(globalCooldownKey(interaction.commandName), 15);
    return;
  }

  // Success
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
