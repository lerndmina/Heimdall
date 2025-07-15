import {
  Client,
  ModalSubmitInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import log from "../../utils/log";
import { redisClient } from "../../Bot";
import { v4 as uuidv4 } from "uuid";

export default async (interaction: ModalSubmitInteraction, client: Client<true>) => {
  if (!interaction.isModalSubmit()) return false;

  // Handle moderation modals
  if (interaction.customId.startsWith("mod_")) {
    // Require manage messages permission
    if (!interaction.memberPermissions?.has("ManageMessages")) {
      await interaction.reply({
        content: "You need the Manage Messages permission to use these moderation actions.",
        ephemeral: true,
      });
      return true;
    }

    const [action, ...args] = interaction.customId.split(":");

    switch (action) {
      case "mod_warn_modal": {
        const [userId, originalInteractionId] = args;
        const warningMessage = interaction.fields.getTextInputValue("warningMessage");

        try {
          // Generate a short unique ID for this warning
          const shortKey = uuidv4().substring(0, 8);

          // Store the warning data in Redis
          await redisClient.set(
            `mod:${shortKey}`,
            JSON.stringify({
              type: "warning",
              userId,
              message: warningMessage,
            }),
            { EX: 300 } // Expire in 5 minutes
          );

          // Create confirmation buttons
          const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`mod_scw:${shortKey}`)
              .setLabel("Yes, Send Warning")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId("mod_cancel")
              .setLabel("No, Cancel")
              .setStyle(ButtonStyle.Secondary)
          );

          // We can't use update() directly on a ModalSubmitInteraction
          // Instead, we'll defer the update first, then edit the original message
          await interaction.deferReply({ ephemeral: true });

          // Find the original message that prompted this modal
          try {
            const channel = interaction.channel;
            if (channel) {
              // Delete the original interaction's response using the webhook
              const originalMessage = await channel.messages
                .fetch({ limit: 10 })
                .then((messages) =>
                  messages.find(
                    (m) =>
                      m.interaction?.id === originalInteractionId && m.author.id === client.user.id
                  )
                );

              if (originalMessage) {
                await originalMessage.edit({
                  content: `Are you sure you want to warn this user with the following message?\n\n> ${warningMessage.substring(
                    0,
                    100
                  )}${warningMessage.length > 100 ? "..." : ""}`,
                  components: [confirmRow],
                });

                // Now that we've edited the original message, delete our deferred reply
                await interaction.deleteReply();
              } else {
                // If we can't find the original message, follow up with a new one
                await interaction.followUp({
                  content: `Are you sure you want to warn this user with the following message?\n\n> ${warningMessage.substring(
                    0,
                    100
                  )}${warningMessage.length > 100 ? "..." : ""}`,
                  components: [confirmRow],
                  ephemeral: true,
                });
              }
            } else {
              // If channel is null, just reply with a new message
              await interaction.followUp({
                content: `Are you sure you want to warn this user with the following message?\n\n> ${warningMessage.substring(
                  0,
                  100
                )}${warningMessage.length > 100 ? "..." : ""}`,
                components: [confirmRow],
                ephemeral: true,
              });
            }
          } catch (error) {
            log.error("Error finding original message for modal submit:", error);

            // Fallback to a new reply if we can't find or edit the original message
            await interaction.followUp({
              content: `Are you sure you want to warn this user with the following message?\n\n> ${warningMessage.substring(
                0,
                100
              )}${warningMessage.length > 100 ? "..." : ""}`,
              components: [confirmRow],
              ephemeral: true,
            });
          }
        } catch (error) {
          log.error("Error handling warning modal:", error);

          // In case we haven't deferred yet
          if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({
              content: "There was an error processing your warning. Please try again.",
              ephemeral: true,
            });
          } else {
            await interaction.followUp({
              content: "There was an error processing your warning. Please try again.",
              ephemeral: true,
            });
          }
        }
        return true;
      }

      case "mod_timeout_modal": {
        const userId = args[0];
        const duration = interaction.fields.getTextInputValue("duration");
        const reason = interaction.fields.getTextInputValue("reason");

        try {
          // Validate duration is a number
          const durationMinutes = parseInt(duration);
          if (isNaN(durationMinutes) || durationMinutes <= 0) {
            await interaction.reply({
              content: "Duration must be a positive number of minutes.",
              ephemeral: true,
            });
            return true;
          }

          // Generate a short unique ID for this timeout
          const shortKey = uuidv4().substring(0, 8);

          // Store the timeout data in Redis
          await redisClient.set(
            `mod:${shortKey}`,
            JSON.stringify({
              type: "timeout",
              userId,
              durationMinutes,
              reason,
            }),
            { EX: 300 } // Expire in 5 minutes
          );

          // Create confirmation buttons
          const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`mod_sto:${shortKey}`)
              .setLabel("Yes, Timeout User")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId("mod_cancel")
              .setLabel("No, Cancel")
              .setStyle(ButtonStyle.Secondary)
          );

          await interaction.reply({
            content: `Are you sure you want to timeout this user for ${durationMinutes} minute(s) with reason: "${reason}"?`,
            components: [confirmRow],
            ephemeral: true,
          });
        } catch (error) {
          log.error("Error handling timeout modal:", error);
          await interaction.reply({
            content: "There was an error processing your timeout request. Please try again.",
            ephemeral: true,
          });
        }
        return true;
      }
    }

    // If we get here, we handled a mod_ modal but didn't have a specific case for it
    return true;
  }

  // Not a mod_ modal, let other handlers process it
  return false;
};
