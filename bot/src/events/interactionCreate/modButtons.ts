import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  ModalBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import log from "../../utils/log";
import { redisClient } from "../../Bot";
import { moderationEmbeds } from "../../services/moderationEmbeds";
import { tryCatch } from "../../utils/trycatch";

export default async (interaction: ButtonInteraction, client: Client<true>) => {
  if (!interaction.isButton()) return false;

  // Handle moderation buttons
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
      case "mod_accept": {
        // Show confirmation buttons
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`mod_accept_confirm:${args.join(":")}`)
            .setLabel("Yes, Accept Report")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("mod_cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          content:
            "Are you sure you want to accept this report? Reminder; this will delete the message.",
          components: [confirmRow],
          ephemeral: true,
        });
        return true;
      }

      case "mod_accept_confirm": {
        const [messageId, channelId, userId] = args;

        try {
          // Get the original message with the report embed
          const originalMessage = await interaction.channel?.messages
            .fetch(interaction.message.reference?.messageId || interaction.message.id)
            .catch((error) => {
              log.warn(`Could not fetch original report message: ${error.message}`);
              return null;
            });

          // If we found the original message and it has embeds
          if (originalMessage && originalMessage.embeds[0]) {
            // Keep the original embed but change title, color, and add footer
            const originalEmbed = originalMessage.embeds[0];
            const acceptedEmbed = new EmbedBuilder()
              .setTitle("✅ Report accepted")
              .setColor("#43B581") // Discord green color
              .setDescription(originalEmbed.description)
              .setTimestamp(originalEmbed.timestamp ? new Date(originalEmbed.timestamp) : null);

            // Copy all existing fields
            originalEmbed.fields.forEach((field) => {
              acceptedEmbed.addFields({
                name: field.name,
                value: field.value,
                inline: field.inline,
              });
            });

            // Copy any image, thumbnail, etc.
            if (originalEmbed.image) acceptedEmbed.setImage(originalEmbed.image.url);
            if (originalEmbed.thumbnail) acceptedEmbed.setThumbnail(originalEmbed.thumbnail.url);
            if (originalEmbed.author) {
              acceptedEmbed.setAuthor({
                name: originalEmbed.author.name || "",
                iconURL: originalEmbed.author.iconURL,
                url: originalEmbed.author.url,
              });
            }

            // Add who accepted the report and when
            acceptedEmbed.setFooter({
              text: `${interaction.user.tag} accepted this report • ${new Date().toLocaleString()}`,
              iconURL: interaction.user.displayAvatarURL(),
            });

            // Update the message with empty components (buttons are removed)
            await originalMessage.edit({
              embeds: [acceptedEmbed],
              components: [],
            });
          }

          await interaction.update({
            content: "Report marked as accepted. Taking action against the message.",
            components: [],
          });

          try {
            const channel = (await client.channels.fetch(channelId)) as TextChannel;
            const message = await channel.messages.fetch(messageId).catch(() => null);

            if (message) {
              await message.delete();
              log.info(
                `Mod ${interaction.user.tag} accepted report and deleted message ${messageId} from channel ${channelId}`
              );
            } else {
              log.warn(
                `Could not delete message ${messageId} from channel ${channelId} - message may have been deleted already`
              );
            }
          } catch (error) {
            log.error("Error handling accepted report:", error);
          }
        } catch (error) {
          log.error("Error in mod_accept_confirm:", error);
          await interaction.update({
            content:
              "An error occurred while processing this report. The message may have been deleted already.",
            components: [],
          });
        }
        return true;
      }

      case "mod_ignore": {
        // Show confirmation buttons
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`mod_ignore_confirm:${args.join(":")}`)
            .setLabel("Yes, Ignore Report")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("mod_cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({
          content: "Are you sure you want to ignore this report?",
          components: [confirmRow],
          ephemeral: true,
        });
        return true;
      }

      case "mod_ignore_confirm": {
        try {
          // Get the original message with the report embed
          const originalMessage = await interaction.channel?.messages
            .fetch(interaction.message.reference?.messageId || interaction.message.id)
            .catch((error) => {
              log.warn(`Could not fetch original report message: ${error.message}`);
              return null;
            });

          // If we found the original message and it has embeds
          if (originalMessage && originalMessage.embeds[0]) {
            // Keep the original embed but change title, color, and add footer
            const originalEmbed = originalMessage.embeds[0];
            const ignoredEmbed = new EmbedBuilder()
              .setTitle("❌ Report ignored")
              .setColor("#F04747") // Discord red color
              .setDescription(originalEmbed.description)
              .setTimestamp(originalEmbed.timestamp ? new Date(originalEmbed.timestamp) : null);

            // Copy all existing fields
            originalEmbed.fields.forEach((field) => {
              ignoredEmbed.addFields({
                name: field.name,
                value: field.value,
                inline: field.inline,
              });
            });

            // Copy any image, thumbnail, etc.
            if (originalEmbed.image) ignoredEmbed.setImage(originalEmbed.image.url);
            if (originalEmbed.thumbnail) ignoredEmbed.setThumbnail(originalEmbed.thumbnail.url);
            if (originalEmbed.author) {
              ignoredEmbed.setAuthor({
                name: originalEmbed.author.name || "",
                iconURL: originalEmbed.author.iconURL,
                url: originalEmbed.author.url,
              });
            }

            // Add who ignored the report and when
            ignoredEmbed.setFooter({
              text: `${interaction.user.tag} ignored this report • ${new Date().toLocaleString()}`,
              iconURL: interaction.user.displayAvatarURL(),
            });

            // Update the message with empty components (buttons are removed)
            await originalMessage.edit({
              embeds: [ignoredEmbed],
              components: [],
            });
          }

          await interaction.update({
            content: "Report marked as ignored. No action taken.",
            components: [],
          });
        } catch (error) {
          log.error("Error in mod_ignore_confirm:", error);
          await interaction.update({
            content:
              "An error occurred while processing this report. The message may have been deleted already.",
            components: [],
          });
        }
        return true;
      }

      case "mod_delete": {
        const [messageId, channelId] = args;

        // Show confirmation buttons
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`mod_delete_confirm:${args.join(":")}`)
            .setLabel("Yes, Delete Message")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("mod_cancel").setLabel("No").setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
          content: "Are you sure you want to delete this message?",
          components: [confirmRow],
          ephemeral: true,
        });
        return true;
      }

      case "mod_delete_confirm": {
        const [messageId, channelId] = args;
        try {
          const channel = (await client.channels.fetch(channelId)) as TextChannel;
          const message = await channel.messages.fetch(messageId).catch(() => null);

          if (message) {
            await message.delete();

            await interaction.update({
              content: "Message deleted successfully.",
              components: [],
            });

            // Update the embed to show action taken
            try {
              const originalMessage = await interaction.channel?.messages
                .fetch(interaction.message.reference?.messageId || "")
                .catch(() => null);

              if (originalMessage && originalMessage.embeds[0]) {
                const originalEmbed = originalMessage.embeds[0];
                const updatedEmbed = moderationEmbeds.addActionTaken(
                  EmbedBuilder.from(originalEmbed),
                  `Message deleted by ${interaction.user}`
                );

                await originalMessage.edit({
                  embeds: [updatedEmbed],
                });
              }
            } catch (embedError) {
              log.warn("Could not update embed after message deletion:", embedError);
            }
          } else {
            await interaction.update({
              content: "Could not delete the message. It may have been deleted already.",
              components: [],
            });
          }
        } catch (error) {
          log.error("Error in mod_delete_confirm:", error);
          await interaction.update({
            content:
              "Could not delete the message. It may have been deleted already or I don't have permission.",
            components: [],
          });
        }
        return true;
      }

      case "mod_warn": {
        const userId = args[0];

        // Show confirmation buttons with 3 options
        const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`mod_warn_confirm:${args.join(":")}`)
            .setLabel("Yes, Send Default Warning")
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`mod_warn_custom:${args.join(":")}`)
            .setLabel("Yes, Custom Message")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("mod_cancel")
            .setLabel("No, Cancel")
            .setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({
          content: "Are you sure you want to warn this user?",
          components: [confirmRow],
          ephemeral: true,
        });
        return true;
      }

      case "mod_warn_custom": {
        const userId = args[0];

        // We'll include the original interaction ID in the modal's customId
        // so we can reference it when handling the modal submission
        const originalInteractionId = interaction.id;

        // Create and show a modal for custom warning message
        const modal = new ModalBuilder()
          .setCustomId(`mod_warn_modal:${userId}:${originalInteractionId}`)
          .setTitle("Send Custom Warning Message");

        const warningInput = new TextInputBuilder()
          .setCustomId("warningMessage")
          .setLabel("Warning Message")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Enter the custom warning message to send to the user")
          .setMaxLength(1000)
          .setRequired(true);

        const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(warningInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
        return true;
      }

      case "mod_warn_confirm": {
        const userId = args[0];
        try {
          const user = await client.users.fetch(userId);

          // Use embed service to create warning embed
          const warningEmbed = moderationEmbeds.createWarningEmbed(
            interaction.guild,
            interaction.user
          );

          // Send the embed warning
          await user.send({ embeds: [warningEmbed] });

          await interaction.update({
            content: "Warning sent to user.",
            components: [],
          });

          // Update the embed to show action taken
          const originalMessage = await interaction.channel?.messages.fetch(
            interaction.message.reference?.messageId || ""
          );

          if (originalMessage && originalMessage.embeds[0]) {
            const originalEmbed = originalMessage.embeds[0];
            const updatedEmbed = moderationEmbeds.addActionTaken(
              EmbedBuilder.from(originalEmbed),
              `User warned by ${interaction.user}`
            );

            await originalMessage.edit({
              embeds: [updatedEmbed],
            });
          }
        } catch {
          await interaction.update({
            content:
              "Could not send warning to user. They may have DMs disabled. Please warn the user with Sapphire or another moderation bot.",
            components: [],
          });
        }
        return true;
      }

      case "mod_send_custom_warn": {
        const userId = args[0];
        const storageKey = args[1];

        try {
          // Retrieve warning message from Redis
          const warningMessage = await redisClient.get(storageKey);

          if (!warningMessage) {
            await interaction.update({
              content: "Warning message expired or not found. Please try again.",
              components: [],
            });
            return true;
          }

          // Delete the key from Redis as we no longer need it
          await redisClient.del(storageKey);

          // Use embed service to create custom warning embed
          const warningEmbed = moderationEmbeds.createWarningEmbed(
            interaction.guild,
            interaction.user,
            warningMessage
          );

          // Send the custom warning as an embed
          const user = await client.users.fetch(userId);
          const { data: _, error: dmUserError } = await tryCatch(
            user.send({ embeds: [warningEmbed] })
          );

          await interaction.update({
            content: dmUserError
              ? "Could not send warning to user. They may have DMs disabled. Please warn the user with Sapphire or another moderation bot."
              : "Custom warning sent to user.",
            components: [],
          });

          // Update the embed to show action taken
          const originalMessage = await interaction.channel?.messages.fetch(
            interaction.message.reference?.messageId || ""
          );

          if (originalMessage && originalMessage.embeds[0]) {
            const originalEmbed = originalMessage.embeds[0];
            const updatedEmbed = moderationEmbeds.addActionTaken(
              EmbedBuilder.from(originalEmbed),
              `User warned by ${interaction.user} with custom message`
            );

            await originalMessage.edit({
              embeds: [updatedEmbed],
            });
          }
        } catch (error) {
          log.error("Error sending custom warning:", error);
          await interaction.update({
            content: "Could not send warning to user. They may have DMs disabled.",
            components: [],
          });
        }
        return true;
      }

      case "mod_scw": {
        // Send Custom Warning (shortened)
        const shortKey = args[0];

        try {
          // Retrieve warning data from Redis
          const storageDataJson = await redisClient.get(`mod:${shortKey}`);

          if (!storageDataJson) {
            await interaction.update({
              content: "Warning message expired or not found. Please try again.",
              components: [],
            });
            return true;
          }

          // Parse the JSON data
          const storageData = JSON.parse(storageDataJson);

          if (storageData.type !== "warning") {
            await interaction.update({
              content: "Invalid warning data. Please try again.",
              components: [],
            });
            return true;
          }

          const userId = storageData.userId;
          const warningMessage = storageData.message;

          // Delete the key from Redis as we no longer need it
          await redisClient.del(`mod:${shortKey}`);

          // Use embed service to create custom warning embed
          const warningEmbed = moderationEmbeds.createWarningEmbed(
            interaction.guild,
            interaction.user,
            warningMessage
          );

          // Send the custom warning as an embed
          const user = await client.users.fetch(userId);
          const { data: _, error: dmUserError } = await tryCatch(
            user.send({ embeds: [warningEmbed] })
          );

          await interaction.update({
            content: dmUserError
              ? "Could not send warning to user. They may have DMs disabled. Please warn the user with Sapphire or another moderation bot."
              : "Custom warning sent to user.",
            components: [],
          });

          // Update the embed to show action taken
          const originalMessage = await interaction.channel?.messages.fetch(
            interaction.message.reference?.messageId || ""
          );

          if (originalMessage && originalMessage.embeds[0]) {
            const originalEmbed = originalMessage.embeds[0];
            const updatedEmbed = moderationEmbeds.addActionTaken(
              EmbedBuilder.from(originalEmbed),
              `User warned by ${interaction.user} with custom message`
            );

            await originalMessage.edit({
              embeds: [updatedEmbed],
            });
          }
        } catch (error) {
          log.error("Error sending custom warning:", error);
          await interaction.update({
            content: "Could not send warning to user. They may have DMs disabled.",
            components: [],
          });
        }
        return true;
      }

      case "mod_timeout": {
        const userId = args[0];

        // Create and show a modal for timeout settings
        const modal = new ModalBuilder()
          .setCustomId(`mod_timeout_modal:${args.join(":")}`)
          .setTitle("Timeout User");

        const durationInput = new TextInputBuilder()
          .setCustomId("duration")
          .setLabel("Duration (in minutes)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Enter timeout duration (e.g. 10)")
          .setRequired(true);

        const reasonInput = new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Reason")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Enter the reason for timeout")
          .setMaxLength(1000)
          .setRequired(true);

        const durationRow = new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput);
        const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);

        modal.addComponents(durationRow, reasonRow);

        await interaction.showModal(modal);
        return true;
      }

      case "mod_timeout_confirm": {
        const userId = args[0];
        const durationMinutes = parseInt(args[1]);
        const storageKey = args[2];

        try {
          // Retrieve reason from Redis
          const reason = await redisClient.get(storageKey);

          if (!reason) {
            await interaction.update({
              content: "Timeout reason expired or not found. Please try again.",
              components: [],
            });
            return true;
          }

          // Delete the key from Redis as we no longer need it
          await redisClient.del(storageKey);

          // Get the guild member
          const member = await interaction.guild?.members.fetch(userId);

          if (!member) {
            await interaction.update({
              content: "Could not find the user in this server.",
              components: [],
            });
            return true;
          }

          // Convert minutes to milliseconds
          const timeoutDuration = durationMinutes * 60 * 1000;

          // Timeout the user
          await member.timeout(timeoutDuration, reason);

          await interaction.update({
            content: `User <@${userId}> has been timed out for ${durationMinutes} minutes.`,
            components: [],
          });

          // Update the embed to show action taken
          const originalMessage = await interaction.channel?.messages.fetch(
            interaction.message.reference?.messageId || ""
          );

          if (originalMessage && originalMessage.embeds[0]) {
            const originalEmbed = originalMessage.embeds[0];
            const updatedEmbed = moderationEmbeds.addActionTaken(
              EmbedBuilder.from(originalEmbed),
              `User timed out for ${durationMinutes} minutes by ${interaction.user}.\nReason: ${reason}`
            );

            await originalMessage.edit({
              embeds: [updatedEmbed],
            });
          }

          // Try to send a DM to the user with an embed
          const timeoutEmbed = moderationEmbeds.createTimeoutEmbed(
            interaction.guild,
            interaction.user,
            durationMinutes,
            reason
          );

          const { data: _, error: dmUserError } = await tryCatch(
            member.send({ embeds: [timeoutEmbed] })
          );
          if (dmUserError) {
            log.error("Could not send DM to timed out user", dmUserError);
            await interaction.update({
              content:
                "Could not send DM to the user. They may have DMs disabled. The timeout was still applied so you may want to contact them yourself.",
              components: [],
            });
          }
        } catch (error) {
          log.error("Error applying timeout:", error);
          await interaction.update({
            content: "Failed to timeout the user. I may not have the required permissions.",
            components: [],
          });
        }
        return true;
      }

      case "mod_sto": {
        // Send Timeout (shortened)
        const shortKey = args[0];

        try {
          // Retrieve timeout data from Redis
          const storageDataJson = await redisClient.get(`mod:${shortKey}`);

          if (!storageDataJson) {
            await interaction.update({
              content: "Timeout data expired or not found. Please try again.",
              components: [],
            });
            return true;
          }

          // Parse the JSON data
          const storageData = JSON.parse(storageDataJson);

          if (storageData.type !== "timeout") {
            await interaction.update({
              content: "Invalid timeout data. Please try again.",
              components: [],
            });
            return true;
          }

          const userId = storageData.userId;
          const reason = storageData.reason;
          const durationMinutes = storageData.durationMinutes;

          // Delete the key from Redis as we no longer need it
          await redisClient.del(`mod:${shortKey}`);

          // Get the guild member
          const member = await interaction.guild?.members.fetch(userId);

          if (!member) {
            await interaction.update({
              content: "Could not find the user in this server.",
              components: [],
            });
            return true;
          }

          // Convert minutes to milliseconds
          const timeoutDuration = durationMinutes * 60 * 1000;

          // Timeout the user
          await member.timeout(timeoutDuration, reason);

          await interaction.update({
            content: `User <@${userId}> has been timed out for ${durationMinutes} minutes.`,
            components: [],
          });

          // Update the embed to show action taken
          const originalMessage = await interaction.channel?.messages.fetch(
            interaction.message.reference?.messageId || ""
          );

          if (originalMessage && originalMessage.embeds[0]) {
            const originalEmbed = originalMessage.embeds[0];
            const updatedEmbed = moderationEmbeds.addActionTaken(
              EmbedBuilder.from(originalEmbed),
              `User timed out for ${durationMinutes} minutes by ${interaction.user}.\nReason: ${reason}`
            );

            await originalMessage.edit({
              embeds: [updatedEmbed],
            });
          }

          // Try to send a DM to the user with an embed
          try {
            const timeoutEmbed = moderationEmbeds.createTimeoutEmbed(
              interaction.guild,
              interaction.user,
              durationMinutes,
              reason
            );

            await member.send({ embeds: [timeoutEmbed] });
          } catch (dmError) {
            log.error("Could not send DM to timed out user", dmError);
          }
        } catch (error) {
          log.error("Error applying timeout:", error);
          await interaction.update({
            content: "Failed to timeout the user. I may not have the required permissions.",
            components: [],
          });
        }
        return true;
      }

      case "mod_cancel": {
        await interaction.update({
          content: "Action cancelled.",
          components: [],
        });
        return true;
      }

      case "mod_details": {
        const [messageId, channelId] = args;

        try {
          const channel = (await client.channels.fetch(channelId)) as TextChannel;
          const message = await channel.messages.fetch(messageId);

          // Use embed service to create message details embed
          const detailEmbed = moderationEmbeds.createMessageDetailsEmbed(message);

          await interaction.reply({
            embeds: [detailEmbed],
            ephemeral: true,
          });
        } catch (error) {
          await interaction.reply({
            content: "Could not fetch message details. It may have been deleted.",
            ephemeral: true,
          });
        }
        return true;
      }
    }

    // If we get here, we handled a mod_ button but didn't have a specific case for it
    return true;
  }

  // Not a mod_ button, let other handlers process it
  return false;
};
