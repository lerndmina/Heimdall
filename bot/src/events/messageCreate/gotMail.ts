import {
  MessageType,
  MessageFlags,
  ActivityType,
  Message,
  Client,
  User,
  ButtonInteraction,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  StringSelectMenuInteraction,
  ThreadAutoArchiveDuration,
  ThreadChannel,
  MessageComponentInteraction,
  InteractionResponse,
  CollectorFilter,
  BaseInteraction,
  Guild,
  ForumChannel,
  Snowflake,
  EmbedBuilder,
  GuildForumTagData,
} from "discord.js";
import { ButtonBuilder, ButtonStyle, SlashCommandBuilder } from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import Modmail, { ModmailType } from "../../models/Modmail";
import ModmailConfig, { ModmailConfigType, ModmailStatus } from "../../models/ModmailConfig";
import ButtonWrapper from "../../utils/ButtonWrapper";
import { redisClient, removeMentions, waitingEmoji } from "../../Bot";
import {
  createCloseThreadButton,
  createModmailActionButtons,
  sendModmailCloseMessage,
  createModmailThread,
} from "../../utils/ModmailUtils";
import {
  debugMsg,
  getDiscordDate,
  isVoiceMessage,
  postWebhookToThread,
  prepModmailMessage,
  sleep,
  ThingGetter,
  TimeType,
} from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import { Url } from "url";
import FetchEnvs from "../../utils/FetchEnvs";
import { debug } from "console";
import log from "../../utils/log";
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";
import ModmailCache from "../../utils/ModmailCache";
import { tryCatch } from "../../utils/trycatch";
import { createAttachmentBuildersFromUrls } from "../../utils/AttachmentProcessor";
import {
  processAttachmentsForModmail,
  createFileUploadSummary,
  createUserFileUploadFeedback,
} from "../../utils/AttachmentSizeManager";
import ModmailBanModel from "../../models/ModmailBans";
import ms from "ms";
import ModmailMessageService, {
  ModmailMessageFormatter,
} from "../../services/ModmailMessageService";
const env = FetchEnvs();

const MAX_TITLE_LENGTH = 50;

/**
 * Validates if a modmail thread still exists
 * @param mail The modmail record to validate
 * @param client Discord client instance
 * @returns Promise<boolean> true if thread exists, false otherwise
 */
async function validateModmailThread(mail: any, client: Client<true>): Promise<boolean> {
  const getter = new ThingGetter(client);
  const { data: thread, error } = await tryCatch(getter.getChannel(mail.forumThreadId));

  if (error && (error as any).code === 10003) {
    // Thread doesn't exist
    return false;
  }

  return !error && !!thread;
}

export default async function (message: Message, client: Client<true>) {
  if (message.author.bot) return;
  const user = message.author;

  const { data, error } = await tryCatch(
    (async () => {
      if (message.guildId) {
        if (message.channel instanceof ThreadChannel) {
          if (isVoiceMessage(message)) {
            await message.reply("I don't support voice messages in modmail threads.");
            return;
          }

          await handleReply(message, client, user);
        }
      } else {
        await handleDM(message, client, user);
      }

      return { data: "Success" };
    })()
  );

  if (error) {
    await message.reply({
      embeds: [
        BasicEmbed(
          client,
          "Modmail ERROR",
          `An unhandled error occured while trying to process your message. Please contact the bot developer. I've logged the error for them.\n\nI just prevented the entire bot from crashing. This should never have happened lmao.\nHere's the error: \`\`\`${error}\`\`\``,
          undefined,
          "Red"
        ),
      ],
    });
    log.error(error);
  }
}

async function handleDM(message: Message, client: Client<true>, user: User) {
  const finalContent = await prepModmailMessage(client, message, 2000);

  // Allow messages with attachments even if no content
  if (!finalContent && message.attachments.size === 0) return;

  // Use singleton database instance for better performance
  const db = new Database();
  const requestId = message.id;
  const mail = await db.findOne(Modmail, { userId: user.id, isClosed: false }, true);

  // Check if user is trying to close with a message
  const closeWithMessageKey = `${env.MODMAIL_TABLE}:close_with_message:${user.id}`;
  const isClosingWithMessage = await redisClient.get(closeWithMessageKey);
  if (isClosingWithMessage && mail) {
    // Clear the flag
    await redisClient.del(closeWithMessageKey);

    // Send the final message first
    await sendMessage(mail, message, finalContent || "", client);

    // Then close the thread using the same logic as the closeModmail command
    const getter = new ThingGetter(client);
    const closedBy = "User";
    const closedByName = user.username;
    const reason = "Closed by user with final message";
    const forumThread = (await getter.getChannel(mail.forumThreadId)) as ThreadChannel;

    // Send closure message
    await sendModmailCloseMessage(client, mail, closedBy, closedByName, reason);

    // Update tags and close thread
    const config = await db.findOne(ModmailConfig, { guildId: mail.guildId });
    if (config) {
      const forumChannel = (await getter.getChannel(config.forumChannelId)) as ForumChannel;
      await handleTag(null, config, db, forumThread, forumChannel);
    }

    try {
      await forumThread.setLocked(true, `${closedBy} closed: ${reason}`);
      await forumThread.setArchived(true, `${closedBy} closed: ${reason}`);
    } catch (error) {
      log.error("Failed to close thread:", error);
    }

    // Mark modmail as closed instead of deleting
    await db.findOneAndUpdate(
      Modmail,
      { forumThreadId: forumThread.id },
      {
        isClosed: true,
        closedAt: new Date(),
        closedBy: user.id,
        closedReason: reason,
      }
    );
    // Clean cache for both simple userId patterns and compound query patterns
    await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`);
    await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:*userId:*`);

    // Notify user
    await message.reply({
      embeds: [
        ModmailEmbeds.threadClosed(
          client,
          "Your final message has been sent and the modmail thread has been closed."
        ),
      ],
    });

    return;
  }

  const customIds = [`create-${requestId}`, `cancel-${requestId}`];
  if (!mail) {
    const banned = await db.findOne(ModmailBanModel, { userId: user.id });
    if (banned) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Modmail")
            .setDescription(
              `You are banned from using modmail ${
                banned.permanent
                  ? "permanently"
                  : `until ${getDiscordDate(banned.expiresAt, TimeType.FULL_LONG)}`
              }.`
            )
            .setColor("Red")
            .setFooter({
              text: "I'd normally say you can DM me for support. Sucks to be you I guess.",
            }),
        ],
      });
    }
    await newModmail(customIds, message, finalContent || "", user, client);
  } else {
    // Validate that the modmail thread still exists before processing
    const isValidThread = await validateModmailThread(mail, client);
    if (!isValidThread) {
      log.warn(`Invalid modmail thread detected for user ${user.id}, creating new modmail`);

      // Mark the invalid modmail record as closed instead of deleting
      const { error: cleanupError } = await tryCatch(
        db.findOneAndUpdate(
          Modmail,
          { userId: user.id, forumThreadId: mail.forumThreadId },
          {
            isClosed: true,
            closedAt: new Date(),
            closedBy: "system",
            closedReason: "Thread no longer exists",
          }
        )
      );

      if (cleanupError) {
        log.error("Failed to mark invalid modmail record as closed:", cleanupError);
      }

      // Clean cache for both simple userId patterns and compound query patterns
      await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`);
      await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:*userId:*`);

      // Create a new modmail instead of failing
      const messageContent = finalContent || "*Attachment only*";
      await newModmail(customIds, message, messageContent, user, client);
      return;
    }

    await sendMessage(mail, message, finalContent || "", client);
  }
}

/**
 * Enhanced modmail creation function with improved error handling and user feedback
 * - Uses tryCatch utility for consistent error handling
 * - Provides better user feedback for short messages
 * - Improved force flag handling with context for staff
 * - Enhanced attachment processing with user feedback
 * - Better database error handling for guild lookups
 */
async function newModmail(
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
          ModmailEmbeds.warning(
            client,
            "Please Wait",
            "You're creating modmail tickets too quickly. Please wait a moment before trying again."
          ),
        ],
      })
    );

    if (rateLimitError) {
      log.warn("Failed to send rate limit message:", rateLimitError);
    } else if (rateLimitMsg) {
      // Delete the rate limit message after 10 seconds
      setTimeout(async () => {
        const { error: deleteError } = await tryCatch(rateLimitMsg.delete());
        if (deleteError) {
          log.debug("Failed to delete rate limit message:", deleteError);
        }
      }, 10000);
    }
    return;
  }

  // Set rate limit for 5 seconds
  await redisClient.setEx(rateLimitKey, 5, "true");

  // Check if the message is longer than 50 characters
  const minCharacters = 50;
  let forced = false;

  if (messageContent.length < minCharacters && !messageContent.includes("--force")) {
    const deleteTime = 30 * 1000;
    const discordDeleteTime = new Date(Date.now() + deleteTime);

    const { error: reactionError } = await tryCatch(message.react("🚫"));
    if (reactionError) {
      log.warn("Failed to add reaction to short message:", reactionError);
    }

    // Enhanced short message warning with better formatting
    const { data: earlyReplyMsg, error: earlyReplyError } = await tryCatch(
      message.reply({
        embeds: [
          ModmailEmbeds.shortMessage(
            client,
            messageContent.length,
            minCharacters,
            discordDeleteTime
          ),
        ],
      })
    );

    if (earlyReplyError) {
      log.warn("Failed to send short message warning:", earlyReplyError);
    } else if (earlyReplyMsg) {
      setTimeout(async () => {
        const { error: deleteError } = await tryCatch(earlyReplyMsg.delete());
        if (deleteError) {
          log.debug(
            "Failed to delete early reply message (probably already deleted):",
            deleteError
          );
        }
      }, deleteTime);
    }
    return;
  } else if (messageContent.includes("--force")) {
    forced = true;
    // Clean up the force flag and add context for staff
    messageContent =
      messageContent.replace(/--force/gi, "").trim() +
      "\n\n*-# ⚠️ This ticket was force-created with a short message. Additional details may be needed.*";

    const { data: replyData, error: replyError } = await tryCatch(
      message.reply({
        embeds: [ModmailEmbeds.forceFlag(client)],
      })
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

  /**
   * @param {ButtonInteraction} i
   */
  collector.on("collect", async (i) => {
    const orignalMsg = await i.update({ content: waitingEmoji, components: [], embeds: [] });

    if (i.customId === customIds[1]) {
      // Cancel button clicked
      await orignalMsg.delete();
      return;
    }

    // Create button clicked
    // TODO: Look up which servers the user and bot are in that both have modmail enabled
    const sharedGuilds: Guild[] = [];
    const cachedGuilds = client.guilds.cache;
    for (const [, guild] of cachedGuilds) {
      const { data: member, error: memberError } = await tryCatch(guild.members.fetch(i.user));

      if (member) {
        sharedGuilds.push(guild);
      } else if (memberError) {
        log.debug(`User ${i.user.id} not found in guild ${guild.id}:`, memberError);
      }
    }
    const stringSelectMenuID = `guildList-${i.id}`;
    var guildList = new StringSelectMenuBuilder()
      .setCustomId(stringSelectMenuID)
      .setPlaceholder("Select a server")
      .setMinValues(1)
      .setMaxValues(1);
    var addedSomething = false;
    const db = new Database();
    for (var guild of sharedGuilds) {
      const { data: config, error: configError } = await tryCatch(
        db.findOne(ModmailConfig, { guildId: guild.id })
      );

      if (configError) {
        log.warn(`Failed to fetch modmail config for guild ${guild.id}:`, configError);
        continue;
      }

      if (config) {
        addedSomething = true;
        guildList.addOptions({
          label: guild.name,
          value: JSON.stringify({
            guild: config.guildId,
            channel: config.forumChannelId,
            staffRoleId: config.staffRoleId,
          }),
          description: config.guildDescription,
        });
      }
    }

    const cancelListEntryId = `cancel-${i.id}`;
    guildList.addOptions({
      label: "Cancel",
      value: cancelListEntryId,
      description: "Cancel the modmail thread creation.",
      emoji: "❌",
    });

    if (!addedSomething) {
      await orignalMsg.edit({
        content: "",
        components: [],
        embeds: [ModmailEmbeds.noServersAvailable(client)],
      });
      return;
    }
    const row = new ActionRowBuilder().addComponents(guildList);
    await orignalMsg.edit({
      embeds: [ModmailEmbeds.selectServer(client)],
      content: "",
      components: [row as any],
    });

    await serverSelectedOpenModmailThread(orignalMsg, stringSelectMenuID, message, messageContent);
    return;
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
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

  async function serverSelectedOpenModmailThread(
    reply: InteractionResponse,
    stringSelectMenuID: string,
    message: Message,
    messageContnent: string = messageContent
  ) {
    const selectMenuFilter = (i: MessageComponentInteraction) => i.customId === stringSelectMenuID;
    const collector = reply.createMessageComponentCollector({
      filter: selectMenuFilter,
      time: ms("5min"),
    });

    collector.on("collect", async (collectedInteraction) => {
      const i = collectedInteraction as StringSelectMenuInteraction;

      if (i.values[0].startsWith("cancel-")) {
        await i.update({
          content: "",
          embeds: [ModmailEmbeds.cancelled(client)],
          components: [],
        });
        return;
      }
      const value = JSON.parse(i.values[0]);
      const guildId = value.guild as Snowflake;
      const channelId = value.channel as Snowflake;
      const staffRoleId = value.staffRoleId as Snowflake;
      await reply.edit({ content: waitingEmoji, components: [], embeds: [] });

      const getter = new ThingGetter(client);
      const guild = await getter.getGuild(guildId);
      const member = await getter.getMember(guild, i.user.id);
      if (!member) {
        return reply.edit({
          content: "",
          embeds: [ModmailEmbeds.notMember(client, guild.name)],
          components: [],
        });
      }
      const forumChannel = (await getter.getChannel(channelId)) as unknown as ForumChannel;
      const noMentionsMessage = removeMentions(messageContent);

      // Prepare the initial message without attachment URLs since we'll forward actual files
      let initialMessage = noMentionsMessage;

      // Get the modmail config
      const db = new Database();
      const config = await db.findOne(ModmailConfig, { guildId: guildId });
      if (!config) {
        return reply.edit({
          content: "",
          embeds: [ModmailEmbeds.configNotFound(client)],
          components: [],
        });
      }

      // Use the centralized function to create the modmail thread
      const result = await createModmailThread(client, {
        guild,
        targetUser: i.user,
        targetMember: member,
        forumChannel,
        modmailConfig: config,
        reason:
          noMentionsMessage.length >= 50
            ? noMentionsMessage.substring(0, 50) + "..."
            : noMentionsMessage,
        openedBy: {
          type: "User",
          username: i.user.username,
          userId: i.user.id,
        },
        initialMessage,
      });
      if (!result?.success) {
        log.error(`Failed to create modmail thread: ${result?.error}`);

        // Add error reaction to indicate failure
        const { error: reactionError } = await tryCatch(message.react("❌"));
        if (reactionError) {
          log.warn("Failed to add error reaction for thread creation failure:", reactionError);
        }

        // Clear rate limit if thread creation failed, allowing user to try again
        // But only if it's not an "already exists" error
        if (!result?.error?.includes("already open")) {
          const rateLimitKey = `modmail_creation_rate_limit:${i.user.id}`;
          await redisClient.del(rateLimitKey);
        }

        return reply.edit({
          content: "",
          embeds: [
            ModmailEmbeds.threadCreationFailed(
              client,
              `An error occurred while trying to create a modmail thread. Please contact the bot developer. I've logged the error for them.\n\nHere's the error: \`\`\`${
                result?.error || "Unknown error"
              }\`\`\``
            ),
          ],
          components: [],
        });
      } // Send only attachments via webhook if there are any (don't repeat the text content)
      if (message.attachments.size > 0) {
        const { data: webhook, error: webhookError } = await tryCatch(
          client.fetchWebhook(config.webhookId!, config.webhookToken!)
        );

        if (webhookError) {
          log.error("Failed to fetch webhook for attachments:", webhookError);
        } else if (webhook) {
          const attachmentResult = await processAttachmentsForModmail(message.attachments, message);

          // Only send webhook messages if there are successful attachments
          if (attachmentResult.discordAttachments.length > 0) {
            const { error: webhookSendError } = await tryCatch(
              webhook.send({
                content: "The original message had attachments, see below:",
                files: attachmentResult.discordAttachments,
                threadId: result.thread!.id,
                username: i.user.displayName,
                avatarURL: i.user.displayAvatarURL(),
              })
            );

            if (webhookSendError) {
              log.error("Failed to send attachment webhook message:", webhookSendError);
            }
          }

          // Send large file summary if needed
          const fileUploadSummary = createFileUploadSummary(attachmentResult);
          if (fileUploadSummary) {
            const { error: summarySendError } = await tryCatch(
              webhook.send({
                content: `📁 **File Upload Summary:**\n${fileUploadSummary}`,
                threadId: result.thread!.id,
                username: i.user.displayName,
                avatarURL: i.user.displayAvatarURL(),
              })
            );

            if (summarySendError) {
              log.error("Failed to send file upload summary:", summarySendError);
            }
          }

          // Always send feedback to user about file processing (including failures)
          const userFeedback = createUserFileUploadFeedback(attachmentResult);
          if (userFeedback) {
            const { data: user, error: userError } = await tryCatch(getter.getUser(i.user.id));
            if (user) {
              const { error: feedbackError } = await tryCatch(user.send({ content: userFeedback }));
              if (feedbackError) {
                log.warn("Failed to send file feedback to user:", feedbackError);
              }
            } else {
              log.warn("Failed to get user for file feedback:", userError);
            }
          }
        }
      }

      // Check if DM was successful, if not notify user
      if (!result.dmSuccess) {
        // Clear rate limit even if DM failed, since thread was created successfully
        const rateLimitKey = `modmail_creation_rate_limit:${i.user.id}`;
        await redisClient.del(rateLimitKey);

        // Add success reaction since the thread was still created successfully
        const { error: reactionError } = await tryCatch(message.react("📨"));
        if (reactionError) {
          log.warn("Failed to add success reaction for DM-failed case:", reactionError);
        }

        return reply.edit({
          content: "",
          embeds: [
            ModmailEmbeds.warning(
              client,
              "DM Failed",
              `Successfully opened a modmail in **${guild.name}**!\n\nHowever, I was unable to send you a DM. Please check your privacy settings and ensure you can receive DMs from server members.\n\nYou can communicate with staff by going to the thread in the server.`
            ),
          ],
          components: [],
        });
      }

      // Success - clear rate limit and update reply
      const rateLimitKey = `modmail_creation_rate_limit:${i.user.id}`;
      await redisClient.del(rateLimitKey);

      // Add success reaction to the original user message
      const { error: reactionError } = await tryCatch(message.react("📨"));
      if (reactionError) {
        log.warn("Failed to add success reaction to original message:", reactionError);
      }

      reply.edit({
        content: "✅ Done! Modmail thread created successfully.",
        embeds: [],
        components: [],
      });
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
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
}

/**
 * @param {Modmail} mail
 * @param {Message} message
 * @param {Client} client
 */
/**
 * Enhanced modmail message handling from DMs to thread
 * - Improved error handling using tryCatch utility
 * - Better user feedback for failed operations
 * - Consistent reaction-based status indicators
 * - Enhanced attachment processing with user notifications
 * - Robust database operation error handling
 */
async function sendMessage( // Send a message from dms to the modmail thread
  mail: any,
  message: Message,
  messageContent: string,
  client: Client<true>
) {
  log.debug(
    `[sendMessage] Starting to process user message from ${message.author.id} for modmail ${mail._id}`
  );

  const cleanMessageContent = removeMentions(messageContent);
  const getter = new ThingGetter(client);
  const messageService = new ModmailMessageService();
  const db = new Database();

  const { data: guildData, error: guildError } = await tryCatch(getter.getGuild(mail.guildId));
  if (guildError) {
    log.error("Failed to get guild for modmail:", guildError);
    const { error: reactionError } = await tryCatch(message.react("❌"));
    if (reactionError) {
      log.warn("Failed to add error reaction:", reactionError);
    }
    return;
  }

  const { data: thread, error: threadError } = await tryCatch(
    getter.getChannel(mail.forumThreadId)
  );
  if (threadError) {
    log.error("Failed to get thread for modmail:", threadError);

    // If it's an "Unknown Channel" error, clean up the stale modmail record
    if ((threadError as any).code === 10003) {
      log.warn(
        `Thread ${mail.forumThreadId} no longer exists, cleaning up modmail record for user ${mail.userId}`
      );

      // Mark the modmail as closed/invalid
      const { error: cleanupError } = await tryCatch(
        db.findOneAndUpdate(
          Modmail,
          { userId: mail.userId, forumThreadId: mail.forumThreadId },
          {
            status: "closed",
            closedAt: new Date(),
            closedReason: "Thread deleted externally",
          },
          { new: true, upsert: true }
        )
      );

      if (cleanupError) {
        log.error("Failed to cleanup stale modmail record:", cleanupError);
      }

      // Notify user that their modmail was closed
      const { error: notifyError } = await tryCatch(
        message.author.send({
          content:
            "❌ **Modmail Error**\n\nYour modmail thread appears to have been closed or removed. Please send a new message to create a fresh modmail thread.",
        })
      );

      if (notifyError) {
        log.warn("Failed to notify user about deleted thread:", notifyError);
      }

      return;
    }

    // For other errors, just react with error and return
    const { error: reactionError } = await tryCatch(message.react("❌"));
    if (reactionError) {
      log.warn("Failed to add error reaction:", reactionError);
    }
    return;
  }

  const guild = guildData;
  const threadChannel = thread as ThreadChannel;

  // Process attachments with size-aware handling
  const attachmentResult = await processAttachmentsForModmail(message.attachments, message);

  // Check if all attachments were processed successfully (atomicity requirement)
  if (!attachmentResult.allSuccessful) {
    // Add warning reaction to indicate attachment processing failed
    const { error: warningReactionError } = await tryCatch(message.react("⚠️"));
    if (warningReactionError) {
      log.warn("Failed to add warning reaction for failed attachments:", warningReactionError);
    }

    // Some attachments failed, don't send the message
    const userFeedback = createUserFileUploadFeedback(attachmentResult);
    if (userFeedback) {
      const { data: user, error: userError } = await tryCatch(getter.getUser(message.author.id));
      if (user) {
        const { error: feedbackError } = await tryCatch(user.send({ content: userFeedback }));
        if (feedbackError) {
          log.warn("Failed to send user feedback:", feedbackError);
        }
      } else {
        log.warn("Failed to get user for feedback:", userError);
      }
    }
    // Don't send the message to the modmail thread
    return;
  }

  // Get the webhook from the ModmailConfig with caching
  const { data: config, error: configError } = await tryCatch(
    ModmailCache.getModmailConfig(mail.guildId, db)
  );

  if (configError) {
    log.error("Failed to get modmail config:", configError);
    const { error: reactionError } = await tryCatch(message.react("❌"));
    if (reactionError) {
      log.warn("Failed to add error reaction:", reactionError);
    }
    return;
  }

  if (!config?.webhookId || !config?.webhookToken) {
    // If there's no webhook in config, fall back to normal message
    const fallbackContent = cleanMessageContent
      ? `${message.author.username} says: ${cleanMessageContent}`
      : `${message.author.username} sent files:`;

    const { data: fallbackMsg, error: fallbackError } = await tryCatch(
      threadChannel.send({
        content: `${fallbackContent}\n\n\`\`\`No webhook found in ModmailConfig, please recreate the modmail setup.\`\`\``,
        files: attachmentResult.discordAttachments,
      })
    );

    if (fallbackError) {
      log.error("Failed to send fallback message:", fallbackError);
      const { error: reactionError } = await tryCatch(message.react("❌"));
      if (reactionError) {
        log.warn("Failed to add error reaction:", reactionError);
      }
      return;
    }

    // Track the message even for fallback
    if (fallbackMsg) {
      const { error: trackingError } = await tryCatch(
        messageService.addMessage(message.author.id, {
          messageId: messageService.generateMessageId(),
          type: "user",
          content: cleanMessageContent,
          authorId: message.author.id,
          authorName: message.author.displayName,
          authorAvatar: message.author.displayAvatarURL(),
          discordMessageId: message.id,
          discordMessageUrl: ModmailMessageService.createMessageUrl(
            null,
            message.channelId,
            message.id
          ),
          webhookMessageId: fallbackMsg.id,
          webhookMessageUrl: ModmailMessageService.createMessageUrl(
            mail.guildId,
            threadChannel.id,
            fallbackMsg.id
          ),
          attachments:
            message.attachments.size > 0
              ? Array.from(message.attachments.values()).map((att) => ({
                  filename: att.name,
                  url: att.url,
                  size: att.size,
                  contentType: att.contentType || undefined,
                }))
              : undefined,
        })
      );

      if (trackingError) {
        log.warn("Failed to track fallback message:", trackingError);
      }
    }

    return fallbackMsg;
  }

  const webhook = await client.fetchWebhook(config.webhookId, config.webhookToken);

  // Get additional embeds for messages that reference other messages (like forwards/replies)
  const { fetchReferencedMessageEmbeds } = await import("../../utils/TinyUtils");
  const additionalEmbeds = await fetchReferencedMessageEmbeds(client, message);
  const allEmbeds = [...(message.embeds || []), ...additionalEmbeds];

  // Debug logging for embed forwarding
  if (env.DEBUG_LOG || process.env.DEBUG_MODMAIL === "true") {
    log.debug(`[Modmail Debug] Sending webhook message:`, {
      hasContent: !!cleanMessageContent,
      contentLength: cleanMessageContent.length,
      originalEmbedsCount: message.embeds.length,
      additionalEmbedsCount: additionalEmbeds.length,
      totalEmbedsCount: allEmbeds.length,
      embedsData: allEmbeds.map((embed) => ({
        title: embed.title,
        description: embed.description?.substring(0, 100),
        color: embed.color,
        fieldsCount: embed.fields?.length || 0,
      })),
      hasAttachments: attachmentResult.discordAttachments.length > 0,
      attachmentCount: attachmentResult.discordAttachments.length,
      hasLargeFiles: attachmentResult.hasLargeFiles,
    });
  }

  // Send message with the user's avatar and username from the stored data or current values
  const webhookMessage = await webhook.send({
    content: cleanMessageContent || "*Attachments only*",
    embeds: allEmbeds.length > 0 ? allEmbeds : undefined,
    files: attachmentResult.discordAttachments,
    threadId: thread.id,
    username: mail.userDisplayName || message.author.displayName,
    avatarURL: mail.userAvatar || message.author.displayAvatarURL(),
  });

  await message.react("📨"); // React with a success emoji

  log.debug(
    `Webhook message sent successfully - ID: ${webhookMessage.id}, Thread ID: ${thread.id}, Guild ID: ${mail.guildId}`
  );

  // Create webhook message URL
  const webhookMessageUrl = ModmailMessageService.createMessageUrl(
    mail.guildId,
    thread.id,
    webhookMessage.id
  );
  log.debug(`Created webhook message URL: ${webhookMessageUrl}`);

  // Track the message in our system
  const trackingMessageId = messageService.generateMessageId();
  await messageService.addMessage(message.author.id, {
    messageId: trackingMessageId,
    type: "user",
    content: cleanMessageContent,
    authorId: message.author.id,
    authorName: message.author.displayName,
    authorAvatar: message.author.displayAvatarURL(),
    discordMessageId: message.id,
    discordMessageUrl: ModmailMessageService.createMessageUrl(null, message.channelId, message.id),
    webhookMessageId: webhookMessage.id,
    webhookMessageUrl: webhookMessageUrl,
    attachments:
      message.attachments.size > 0
        ? Array.from(message.attachments.values()).map((att) => ({
            filename: att.name,
            url: att.url,
            size: att.size,
            contentType: att.contentType || undefined,
          }))
        : undefined,
  });

  log.debug(`Tracked user message ${trackingMessageId} for user ${message.author.id}`);

  // Send follow-up message for large files if needed
  const fileUploadSummary = createFileUploadSummary(attachmentResult);
  if (fileUploadSummary) {
    await webhook.send({
      content: `📁 **File Upload Summary:**\n${fileUploadSummary}`,
      threadId: thread.id,
      username: mail.userDisplayName || message.author.displayName,
      avatarURL: mail.userAvatar || message.author.displayAvatarURL(),
    });
  }

  // Provide feedback to user about their message/files
  if (attachmentResult.hasLargeFiles || !attachmentResult.allSuccessful) {
    // Send feedback to user about file processing
    const userFeedback = createUserFileUploadFeedback(attachmentResult);
    if (userFeedback) {
      await tryCatch(
        (
          await getter.getUser(message.author.id)
        ).send({
          content: userFeedback,
        })
      );
    }
  }

  // Reactions are now handled by processAttachmentsForModmail

  // Update the user's avatar and display name if they're not set or have changed
  if (!mail.userAvatar || !mail.userDisplayName) {
    await db.findOneAndUpdate(
      Modmail,
      { userId: message.author.id },
      {
        userAvatar: message.author.displayAvatarURL(),
        userDisplayName: message.author.displayName,
      },
      { new: true, upsert: true }
    );
  }

  // Update last user activity for inactivity tracking
  const { error: updateError } = await tryCatch(
    db.findOneAndUpdate(
      Modmail,
      { userId: message.author.id },
      {
        lastUserActivityAt: new Date(),
        // Reset notification tracking when user becomes active again
        inactivityNotificationSent: null,
        autoCloseScheduledAt: null,
        // Reset resolved status if user sends a new message to a resolved thread
        markedResolved: false,
        resolvedAt: null,
      },
      { new: true, upsert: true }
    )
  );

  if (updateError) {
    log.error("Failed to update user activity:", updateError);
    const { error: reactionError } = await tryCatch(message.react("🚫"));
    if (reactionError) {
      log.warn("Failed to add error reaction:", reactionError);
    }
    return;
  }

  log.debug(`Updated last activity for user ${message.author.id} in modmail`);

  // Return success reaction - the webhook sending already handled the reactions above
  return;
}

/**
 * Enhanced staff reply handling from thread to user DMs
 * - Improved error handling with consistent feedback
 * - Better attachment processing and user notifications
 * - Enhanced message tracking with error recovery
 * - Consistent reaction-based status updates
 * - Robust user fetching and DM sending with fallbacks
 */
async function handleReply(message: Message, client: Client<true>, staffUser: User) {
  const db = new Database();
  const thread = message.channel;
  const messageService = new ModmailMessageService();

  // Fetch messages with error handling
  const { data: messages, error: messagesError } = await tryCatch(thread.messages.fetch());
  if (messagesError) {
    log.error("Failed to fetch thread messages:", messagesError);
    return;
  }

  // Find modmail with error handling - only process open threads
  const { data: mail, error: mailError } = await tryCatch(
    db.findOne(Modmail, { forumThreadId: thread.id, isClosed: false })
  );

  if (mailError) {
    log.error("Failed to find modmail:", mailError);
    return;
  }

  if (!mail) {
    // This is not a modmail thread so we tell the redis to cache that fact
    const { error: redisError } = await tryCatch(
      redisClient.set(`${env.MODMAIL_TABLE}:forumThreadId:${thread.id}`, "false")
    );
    if (redisError) {
      log.warn("Failed to set Redis cache:", redisError);
    }
    return;
  }
  const getter = new ThingGetter(client);
  const guild = await getter.getGuild(mail.guildId);
  if (message.content.startsWith(".")) {
    // TODO move this to an env var
    return message.react("🕵️"); // Messages starting with . are staff only
  }
  const finalContent = removeMentions((await prepModmailMessage(client, message, 1024)) || "");

  // Allow messages with attachments even if no content (for staff)
  if (!finalContent && message.attachments.size === 0) return;

  // Process attachments with size-aware handling
  const attachmentResult = await processAttachmentsForModmail(message.attachments, message, true);

  // Check if all attachments were processed successfully (atomicity requirement)
  if (!attachmentResult.allSuccessful) {
    // Some attachments failed, don't send the message
    await message.react("❌");
    await message.reply({
      content:
        "❌ **Message not sent** - Some attachments could not be processed. Please check file sizes and try again.",
    });
    return;
  }

  debugMsg(
    "Sending message to user " +
      mail.userId +
      " in guild " +
      mail.guildId +
      " from " +
      staffUser.globalName
  );

  const staffMemberName = getter.getMemberName(await getter.getMember(guild, staffUser.id));

  // Handle the case where there's no content but there are attachments
  let dmContent: string;
  if (!finalContent && attachmentResult.discordAttachments.length > 0) {
    dmContent = ModmailMessageFormatter.formatStaffReplyForDM(
      "*Sent attachments*",
      staffMemberName,
      guild.name
    );
  } else {
    dmContent = ModmailMessageFormatter.formatStaffReplyForDM(
      finalContent,
      staffMemberName,
      guild.name
    );
  }

  // Get additional embeds for messages that reference other messages (like forwards/replies)
  const { fetchReferencedMessageEmbeds } = await import("../../utils/TinyUtils");
  const additionalEmbeds = await fetchReferencedMessageEmbeds(client, message);
  const allEmbeds = [...(message.embeds || []), ...additionalEmbeds];

  // Debug logging for embed forwarding (staff to user)
  if (env.DEBUG_LOG || process.env.DEBUG_MODMAIL === "true") {
    log.debug(`[Modmail Debug] Sending DM to user:`, {
      hasContent: !!dmContent,
      contentLength: dmContent.length,
      originalEmbedsCount: message.embeds.length,
      additionalEmbedsCount: additionalEmbeds.length,
      totalEmbedsCount: allEmbeds.length,
      embedsData: allEmbeds.map((embed) => ({
        title: embed.title,
        description: embed.description?.substring(0, 100),
        color: embed.color,
        fieldsCount: embed.fields?.length || 0,
      })),
      hasAttachments: attachmentResult.discordAttachments.length > 0,
      attachmentCount: attachmentResult.discordAttachments.length,
      hasLargeFiles: attachmentResult.hasLargeFiles,
    });
  }

  const { data: user, error: userError } = await tryCatch(getter.getUser(mail.userId));
  if (userError) {
    log.error("Failed to get user for DM:", userError);
    const { error: reactionError } = await tryCatch(message.react("❌"));
    if (reactionError) {
      log.warn("Failed to add error reaction:", reactionError);
    }
    return;
  }

  if (!user) {
    log.warn(`User ${mail.userId} not found for modmail reply`);
    const { error: reactionError } = await tryCatch(message.react("❌"));
    if (reactionError) {
      log.warn("Failed to add error reaction:", reactionError);
    }
    return;
  }

  const { data: dmMessage, error: dmError } = await tryCatch(
    user.send({
      content: dmContent,
      files: attachmentResult.discordAttachments,
      embeds: allEmbeds.length > 0 ? allEmbeds : undefined,
    })
  );

  if (dmError) {
    const { error: reactionError } = await tryCatch(message.react("🚫"));
    if (reactionError) {
      log.warn("Failed to add error reaction:", reactionError);
    }

    const { error: replyError } = await tryCatch(
      message.reply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Message Send Failed",
            `An error occurred while trying to send your message to the user. They probably have DMs disabled or are not in the server anymore.\n\nHere's the error: \`\`\`${dmError}\`\`\`\n\nClick the button below to close the thread.`
          ),
        ],
        components: [createCloseThreadButton()],
      })
    );

    if (replyError) {
      log.error("Failed to send error reply:", replyError);
    }
    return;
  }

  // Send follow-up DM for large files if needed
  const fileUploadSummary = createFileUploadSummary(attachmentResult);
  if (fileUploadSummary && dmMessage && user) {
    const { error: summaryError } = await tryCatch(
      user.send({
        content: `📁 **Staff File Upload Summary:**\n${fileUploadSummary}`,
      })
    );

    if (summaryError) {
      log.warn("Failed to send file upload summary:", summaryError);
    }
  }

  // Also inform user about file processing (with better context for staff messages)
  if ((attachmentResult.hasLargeFiles || !attachmentResult.allSuccessful) && dmMessage && user) {
    const userFeedback = createUserFileUploadFeedback(attachmentResult, true);
    if (userFeedback) {
      const { error: feedbackError } = await tryCatch(
        user.send({
          content: userFeedback,
        })
      );

      if (feedbackError) {
        log.warn("Failed to send user feedback:", feedbackError);
      }
    }
  }

  // React based on attachment processing success
  if (attachmentResult.allSuccessful) {
    log.debug("Adding success reaction (📨) to user message");
    const { error: successReactionError } = await tryCatch(message.react("📨"));
    if (successReactionError) {
      log.warn("Failed to add success reaction:", successReactionError);
    } else {
      log.debug("Successfully added 📨 reaction to user message");
    }
  } else {
    log.debug("Adding warning reaction (⚠️) to user message due to attachment issues");
    const { error: warningReactionError } = await tryCatch(message.react("⚠️"));
    if (warningReactionError) {
      log.warn("Failed to add warning reaction:", warningReactionError);
    } else {
      log.debug("Successfully added ⚠️ reaction to user message");
    }
  }

  // Track the staff message in our system
  const trackingMessageId = messageService.generateMessageId();

  // Get DM channel for URL creation if the message was sent successfully
  let dmMessageUrl: string | undefined = undefined;
  if (dmMessage?.id && dmMessage?.channel?.id) {
    dmMessageUrl = ModmailMessageService.createMessageUrl(null, dmMessage.channel.id, dmMessage.id);
  }

  const { error: trackingError } = await tryCatch(
    messageService.addMessage(mail.userId, {
      messageId: trackingMessageId,
      type: "staff",
      content: finalContent,
      authorId: staffUser.id,
      authorName: staffMemberName,
      authorAvatar: staffUser.displayAvatarURL(),
      discordMessageId: message.id,
      discordMessageUrl: ModmailMessageService.createMessageUrl(
        message.guildId,
        message.channelId,
        message.id
      ),
      dmMessageId: dmMessage?.id, // The DM message ID if successful
      dmMessageUrl: dmMessageUrl,
      attachments:
        message.attachments.size > 0
          ? Array.from(message.attachments.values()).map((att) => ({
              filename: att.name,
              url: att.url,
              size: att.size,
              contentType: att.contentType || undefined,
            }))
          : undefined,
    })
  );

  if (trackingError) {
    log.warn("Failed to track staff message:", trackingError);
  } else {
    log.debug(
      `Tracked staff message ${trackingMessageId} for user ${mail.userId} from staff ${staffUser.id}`
    );
  }

  debugMsg("Sent message to user" + mail.userId + " in guild " + mail.guildId);

  const { error: finalReactionError } = await tryCatch(message.react("📨"));
  if (finalReactionError) {
    log.warn("Failed to add final reaction:", finalReactionError);
  }
}

export async function handleTag(
  modmail: ModmailType | null,
  modmailConfig: ModmailConfigType,
  db: Database,
  thread: ThreadChannel,
  forumChannel: ForumChannel
) {
  // Determine which status to set based on whether modmail exists
  const targetStatus = modmail ? ModmailStatus.OPEN : ModmailStatus.CLOSED;

  // First, ensure tags exist in the database config
  if (!modmailConfig.tags || modmailConfig.tags.length !== Object.values(ModmailStatus).length) {
    // Create tag data for all possible statuses
    const tagData: GuildForumTagData[] = [];
    for (const status of Object.values(ModmailStatus)) {
      // For each status, create a tag with the status name
      tagData.push({
        name: status,
        emoji: { name: status === ModmailStatus.OPEN ? "📬" : "📪", id: null },
        id: getTagSnowflake(status),
        moderated: true,
      });
    }

    // Set available tags on the forum channel
    await forumChannel.setAvailableTags(tagData);

    // Update the config in the database with the new tags
    await db.findOneAndUpdate(
      ModmailConfig,
      { guildId: modmailConfig.guildId },
      {
        tags: tagData.map((tag) => ({
          snowflake: tag.id,
          status: tag.name,
        })),
      },
      { new: true, upsert: true }
    );

    // Invalidate cache after config update
    await ModmailCache.invalidateModmailConfig(modmailConfig.guildId);

    // Retrieve the updated config
    const updatedConfig = await db.findOne(ModmailConfig, { guildId: modmailConfig.guildId });
    if (!updatedConfig) {
      throw new Error(
        `Failed to retrieve updated ModmailConfig for guild: ${modmailConfig.guildId}`
      );
    }
    modmailConfig = updatedConfig;
  }

  // Now check if the forum tags actually exist
  const forumTags = await forumChannel.availableTags;
  const statusTagsExist = Object.values(ModmailStatus).every((status) =>
    forumTags.some((tag) => tag.name === status)
  );

  // If forum tags don't match expected statuses, recreate them
  if (!statusTagsExist) {
    const tagData: GuildForumTagData[] = [];
    for (const status of Object.values(ModmailStatus)) {
      tagData.push({
        name: status,
        emoji: { name: status === ModmailStatus.OPEN ? "📬" : "❌", id: null },
        id: getTagSnowflake(status),
        moderated: true,
      });
    }
    await forumChannel.setAvailableTags(tagData);
  }

  // Find the correct tag for the current status
  const targetTag = forumChannel.availableTags.find((tag) => tag.name === targetStatus);

  if (targetTag) {
    // Apply the tag to the thread
    await thread.setAppliedTags([targetTag.id]);

    // If we have a modmail, update its record in the database
    if (modmail) {
      await db.findOneAndUpdate(
        Modmail,
        { userId: modmail.userId },
        {
          tags:
            modmailConfig.tags ||
            Object.values(ModmailStatus).map((status) => ({
              snowflake: getTagSnowflake(status),
              status: status,
            })),
        },
        { new: true, upsert: true }
      );
    }
  } else {
    // Log error if tag wasn't found
    console.error(`Could not find tag for status: ${targetStatus}`);
  }
}

function getTagSnowflake(status: ModmailStatus) {
  const statusNumber = Object.values(ModmailStatus).indexOf(status);
  return statusNumber.toString();
}
