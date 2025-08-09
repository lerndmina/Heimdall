import {
  Message,
  User,
  Client,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  BaseInteraction,
  MessageComponentInteraction,
  CollectorFilter,
} from "discord.js";
import { redisClient, waitingEmoji } from "../../Bot";
import { tryCatch } from "../trycatch";
import { ModmailEmbeds } from "./ModmailEmbeds";
import ButtonWrapper from "../ButtonWrapper";
import log from "../log";
import ms from "ms";
import Database from "../data/database";
import ModmailConfig from "../../models/ModmailConfig";
import { sleep } from "../TinyUtils";
import {
  processAttachmentsForModmail,
  createFileUploadSummary,
  createUserFileUploadFeedback,
} from "../AttachmentSizeManager";

/**
 * Hook-based modmail creation function
 * Replaces the original hardcoded logic with a dynamic hook system
 * Maintains the same interface for backward compatibility
 */
async function newModmailHookBased(
  customIds: string[],
  message: Message,
  messageContent: string,
  user: User,
  client: Client<true>
) {
  // Rate limiting to prevent rapid modmail creation attempts
  const rateLimitKey = `modmail_creation_rate_limit:${user.id}`;
  const isRateLimited = await redisClient.get(rateLimitKey);

  if (isRateLimited) {
    const { error: reactionError } = await tryCatch(message.react("⏰"));
    if (reactionError) {
      log.warn("Failed to add rate limit reaction:", reactionError);
    }

    const { data: rateLimitMsg, error: rateLimitError } = await tryCatch(
      message.reply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Rate Limited",
            "Please wait before creating another modmail thread."
          ),
        ],
      })
    );

    if (rateLimitError) {
      log.error("Failed to send rate limit message:", rateLimitError);
    }

    return;
  }

  // Set rate limit (5 minutes)
  await redisClient.setEx(rateLimitKey, 300, "true");

  // Force flag handling for staff
  const force = messageContent.includes("--force");
  if (force && messageContent.replace("--force", "").trim().length < 50) {
    const { error: replyError } = await tryCatch(
      message.reply(
        "You used the force flag. This means you're staff and know that short messages might not provide enough context for users to help you. A minimal 50 character guideline ensures quality communication. Your modmail will still be created."
      )
    );

    if (replyError) {
      log.warn("Failed to send force flag confirmation:", replyError);
    }
  }

  const buttons = [
    new ButtonBuilder()
      .setCustomId(customIds[0])
      .setLabel("Create Modmail")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customIds[1]).setLabel("Cancel").setStyle(ButtonStyle.Danger),
  ];

  const reply = await message.reply({
    content: "",
    embeds: [ModmailEmbeds.createPrompt(client)],
    components: ButtonWrapper(buttons),
  });

  const buttonFilter: CollectorFilter<[MessageComponentInteraction]> = (
    interaction: BaseInteraction
  ) => {
    if (interaction instanceof ButtonInteraction) {
      return customIds.includes(interaction.customId);
    }
    return false;
  };

  const collector = reply.createMessageComponentCollector({
    filter: buttonFilter,
    time: ms("5min"),
  });

  collector.on("collect", async (i) => {
    const originalMsg = await i.update({ content: waitingEmoji, components: [], embeds: [] });

    if (i.customId === customIds[1]) {
      // Cancel button clicked
      await originalMsg.delete();
      return;
    }

    // Create button clicked - Use hook-based system
    try {
      const { HookBasedModmailCreator } = await import(
        "../../utils/modmail/HookBasedModmailCreator"
      );
      const creator = new HookBasedModmailCreator(client);

      log.debug(`Using hook-based modmail creation for user ${i.user.id}`);

      const result = await creator.createModmail(i.user, message, messageContent);

      if (!result.success) {
        log.error(`Hook-based modmail creation failed: ${result.error}`);

        // Clear rate limit on failure to allow retry
        await redisClient.del(rateLimitKey);

        await originalMsg.edit({
          content: "",
          embeds: [
            ModmailEmbeds.error(
              client,
              "Modmail Creation Failed",
              result.userMessage || "Failed to create modmail thread. Please try again."
            ),
          ],
          components: [],
        });

        // Add error reaction to original message
        const { error: reactionError } = await tryCatch(message.react("❌"));
        if (reactionError) {
          log.warn("Failed to add error reaction:", reactionError);
        }

        return;
      }

      // Success handling
      log.info(
        `Hook-based modmail created successfully for user ${i.user.id} in guild ${result.guild?.id}`
      );

      // Clear rate limit on success
      await redisClient.del(rateLimitKey);

      // Add success reaction to original message
      const { error: reactionError } = await tryCatch(message.react("📨"));
      if (reactionError) {
        log.warn("Failed to add success reaction:", reactionError);
      }

      // Handle attachment forwarding if present
      if (message.attachments.size > 0 && result.thread && result.guild?.id) {
        await handleAttachmentForwarding(message, result.thread, result.guild.id, client, i.user);
      }

      // Update the reply based on DM success
      if (!result.dmSuccess) {
        await originalMsg.edit({
          content: "",
          embeds: [
            ModmailEmbeds.warning(
              client,
              "DM Failed",
              `Successfully opened a modmail in **${result.guild?.name}**!\n\nHowever, I was unable to send you a DM. Please check your privacy settings and ensure you can receive DMs from server members.\n\nYou can communicate with staff by going to the thread in the server.`
            ),
          ],
          components: [],
        });
      } else {
        await originalMsg.edit({
          content: "✅ Done! Modmail thread created successfully.",
          embeds: [],
          components: [],
        });
      }
    } catch (error) {
      log.error("Unexpected error in hook-based modmail creation:", error);

      // Clear rate limit on error
      await redisClient.del(rateLimitKey);

      await originalMsg.edit({
        content: "",
        embeds: [
          ModmailEmbeds.error(
            client,
            "System Error",
            "An unexpected error occurred while creating your modmail. Please try again."
          ),
        ],
        components: [],
      });

      // Add error reaction
      const { error: reactionError } = await tryCatch(message.react("❌"));
      if (reactionError) {
        log.warn("Failed to add error reaction:", reactionError);
      }
    }
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      // Clear rate limit on timeout
      await redisClient.del(rateLimitKey);

      const failedReply = await reply.edit({
        content: "",
        embeds: [ModmailEmbeds.timeout(client)],
        components: [],
      });

      await sleep(ms("15s"));
      if (failedReply) {
        tryCatch(failedReply.delete());
      }
    }
  });
}

/**
 * Handle attachment forwarding for created modmail threads
 */
async function handleAttachmentForwarding(
  originalMessage: Message,
  thread: any,
  guildId: string,
  client: Client<true>,
  user: User
) {
  try {
    // Get modmail config to access webhook
    const db = new Database();
    const config = await db.findOne(ModmailConfig, { guildId });

    if (!config?.webhookId || !config?.webhookToken) {
      log.warn("No webhook found for attachment forwarding");
      return;
    }

    const { data: webhook, error: webhookError } = await tryCatch(
      client.fetchWebhook(config.webhookId, config.webhookToken)
    );

    if (webhookError) {
      log.error("Failed to fetch webhook for attachments:", webhookError);
      return;
    }

    if (webhook) {
      const attachmentResult = await processAttachmentsForModmail(
        originalMessage.attachments,
        originalMessage
      );

      // Send attachments via webhook if processing was successful
      if (attachmentResult.discordAttachments.length > 0) {
        const { error: webhookSendError } = await tryCatch(
          webhook.send({
            content: "The original message had attachments, see below:",
            files: attachmentResult.discordAttachments,
            threadId: thread.id,
            username: user.displayName,
            avatarURL: user.displayAvatarURL(),
          })
        );

        if (webhookSendError) {
          log.error("Failed to send attachment webhook message:", webhookSendError);
        }
      }

      // Send file upload summary if needed
      const fileUploadSummary = createFileUploadSummary(attachmentResult);
      if (fileUploadSummary) {
        const { error: summarySendError } = await tryCatch(
          webhook.send({
            content: `📁 **File Upload Summary:**\n${fileUploadSummary}`,
            threadId: thread.id,
            username: user.displayName,
            avatarURL: user.displayAvatarURL(),
          })
        );

        if (summarySendError) {
          log.error("Failed to send file upload summary:", summarySendError);
        }
      }

      // Send user feedback about file processing
      const userFeedback = createUserFileUploadFeedback(attachmentResult);
      if (userFeedback) {
        const { error: feedbackError } = await tryCatch(user.send({ content: userFeedback }));

        if (feedbackError) {
          log.warn("Failed to send file feedback to user:", feedbackError);
        }
      }
    }
  } catch (error) {
    log.error("Error handling attachment forwarding:", error);
  }
}
