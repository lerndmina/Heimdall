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
  const mail = await db.findOne(Modmail, { userId: user.id }, true);

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

    // Remove from database and clean cache
    await db.deleteOne(Modmail, { forumThreadId: forumThread.id });
    await db.cleanCache(`${env.MONGODB_DATABASE}:${env.MODMAIL_TABLE}:userId:*`);

    // Notify user
    await message.reply({
      embeds: [
        BasicEmbed(
          client,
          "🔒 Thread Closed",
          "Your final message has been sent and the modmail thread has been closed.",
          undefined,
          "Green"
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
    await sendMessage(mail, message, finalContent || "", client);
  }
}

async function newModmail(
  customIds: string[],
  message: Message,
  messageContent: string,
  user: User,
  client: Client<true>
) {
  // Check if the message is longer than 50 characters
  const minCharacters = 50;
  let forced = false;
  if (messageContent.length < minCharacters && !messageContent.includes("--force")) {
    const deleteTime = 30 * 1000;
    const discordDeleteTime = new Date(Date.now() + deleteTime);
    message.react("🚫");

    // If the message is too short, send a warning and return
    const earlyreply = message.reply({
      embeds: [
        BasicEmbed(
          client,
          "Modmail",
          `Your message is too short to open a modmail ticket. Please send a message longer than ${minCharacters} characters. Please make sure to include as much detail about your issue as possible. If you would like to temporarily override this check please include \`--force\` at the end of your message.\n\nThis message will delete ${getDiscordDate(
            discordDeleteTime,
            TimeType.RELATIVE
          )} seconds.`,
          undefined,
          "Red"
        ),
      ],
    });
    earlyreply.then((msg) => {
      setTimeout(() => {
        msg.delete();
      }, 30 * 1000);
    });
    return;
  } else if (messageContent.includes("--force")) {
    forced = true;
    // If the message contains --force, remove it from the message
    messageContent = messageContent
      .replace(
        "--force",
        "\n-# The user has force opened a modmail ticket with a short message, this modmial ticket may not contain enough information."
      )
      .trim();
    await message.reply(
      `-# - You have used the --force flag. This will override the message length check. If you do not provide enough detail staff may not be able to help you. Please make sure to include as much detail about your issue as possible.`
    );
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
    embeds: [
      BasicEmbed(
        client,
        "Modmail",
        "Would you like to create a modmail thread?",
        undefined,
        "Random"
      ),
    ],
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
      await guild.members
        .fetch(i.user)
        .then(() => sharedGuilds.push(guild))
        .catch((error) => log.info(error));
    }
    const stringSelectMenuID = `guildList-${i.id}`;
    var guildList = new StringSelectMenuBuilder()
      .setCustomId(stringSelectMenuID)
      .setPlaceholder("Select a server")
      .setMinValues(1)
      .setMaxValues(1);
    var addedSomething = false;
    for (var guild of sharedGuilds) {
      const db = new Database();
      const config = await db.findOne(ModmailConfig, { guildId: guild.id });
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
        embeds: [
          BasicEmbed(
            client,
            "Modmail",
            "There are no servers that have modmail enabled that you and I are both in.",
            undefined,
            "Random"
          ),
        ],
      });
      return;
    }
    const row = new ActionRowBuilder().addComponents(guildList);
    await orignalMsg.edit({
      embeds: [
        BasicEmbed(
          client,
          "Modmail",
          "Select a server to open a modmail thread in.",
          undefined,
          "Random"
        ),
      ],
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
        embeds: [
          BasicEmbed(
            client,
            "Modmail",
            "You took too long to respond. Please try again.\n\nIf you want to open a modmail thread, just DM me again!\nThis message will delete in 15 seconds.",
            undefined,
            "Red"
          ),
        ],
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
          embeds: [
            BasicEmbed(
              client,
              "Modmail",
              "Cancelled modmail thread creation.",
              undefined,
              "Random"
            ),
          ],
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
          embeds: [
            BasicEmbed(
              client,
              "Modmail",
              `You are not a member of **${guild.name}**. Please join the server to open a modmail thread.`,
              undefined,
              "Red"
            ),
          ],
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
          embeds: [
            BasicEmbed(
              client,
              "Modmail",
              "Modmail configuration not found for this server.",
              undefined,
              "Red"
            ),
          ],
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
        return reply.edit({
          content: "",
          embeds: [
            BasicEmbed(
              client,
              "Modmail",
              `An error occurred while trying to create a modmail thread. Please contact the bot developer. I've logged the error for them.\n\nHere's the error: \`\`\`${
                result?.error || "Unknown error"
              }\`\`\``,
              undefined,
              "Red"
            ),
          ],
          components: [],
        });
      } // Send only attachments via webhook if there are any (don't repeat the text content)
      if (message.attachments.size > 0) {
        try {
          const webhook = await client.fetchWebhook(config.webhookId!, config.webhookToken!);
          const attachmentResult = await processAttachmentsForModmail(message.attachments, message);

          // Only send webhook messages if there are successful attachments
          // Since the thread is already created, we don't prevent its creation, but we don't send empty attachment messages
          if (attachmentResult.discordAttachments.length > 0) {
            await webhook.send({
              content: "The original message had attachments, see below:",
              files: attachmentResult.discordAttachments,
              threadId: result.thread!.id,
              username: i.user.displayName,
              avatarURL: i.user.displayAvatarURL(),
            });
          }

          // Send large file summary if needed
          const fileUploadSummary = createFileUploadSummary(attachmentResult);
          if (fileUploadSummary) {
            await webhook.send({
              content: `📁 **File Upload Summary:**\n${fileUploadSummary}`,
              threadId: result.thread!.id,
              username: i.user.displayName,
              avatarURL: i.user.displayAvatarURL(),
            });
          }

          // Always send feedback to user about file processing (including failures)
          const userFeedback = createUserFileUploadFeedback(attachmentResult);
          if (userFeedback) {
            await tryCatch(
              (
                await getter.getUser(i.user.id)
              ).send({
                content: userFeedback,
              })
            );
          }
        } catch (error) {
          log.error("Failed to send initial message attachments via webhook:", error);
        }
      }

      // Check if DM was successful, if not notify user
      if (!result.dmSuccess) {
        return reply.edit({
          content: "",
          embeds: [
            BasicEmbed(
              client,
              "Modmail",
              `Successfully opened a modmail in **${guild.name}**!\n\nHowever, I was unable to send you a DM. Please check your privacy settings and ensure you can receive DMs from server members.\n\nYou can communicate with staff by going to the thread in the server.`,
              undefined,
              "Orange"
            ),
          ],
          components: [],
        });
      }

      // Success - DM was sent, so just update the reply to indicate success
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
          embeds: [
            BasicEmbed(
              client,
              "Modmail",
              "You took too long to respond. Please try again.\n\nIf you want to open a modmail thread, just DM me again!\nThis message will delete in 15 seconds.",
              undefined,
              "Red"
            ),
          ],
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
async function sendMessage( // Send a message from dms to the modmail thread
  mail: any,
  message: Message,
  messageContent: string,
  client: Client<true>
) {
  const cleanMessageContent = removeMentions(messageContent);
  const getter = new ThingGetter(client);
  const messageService = new ModmailMessageService();

  try {
    const guild = await getter.getGuild(mail.guildId);
    const thread = (await getter.getChannel(mail.forumThreadId)) as ThreadChannel;

    // Process attachments with size-aware handling
    const attachmentResult = await processAttachmentsForModmail(message.attachments, message);

    // Check if all attachments were processed successfully (atomicity requirement)
    if (!attachmentResult.allSuccessful) {
      // Some attachments failed, don't send the message
      const userFeedback = createUserFileUploadFeedback(attachmentResult);
      if (userFeedback) {
        const getter = new ThingGetter(client);
        await tryCatch(
          (
            await getter.getUser(message.author.id)
          ).send({
            content: userFeedback,
          })
        );
      }
      // Don't send the message to the modmail thread
      return;
    }

    // Get the webhook from the ModmailConfig with caching
    const db = new Database();
    const config = await ModmailCache.getModmailConfig(mail.guildId, db);

    if (!config?.webhookId || !config?.webhookToken) {
      // If there's no webhook in config, fall back to normal message
      const fallbackContent = cleanMessageContent
        ? `${message.author.username} says: ${cleanMessageContent}`
        : `${message.author.username} sent files:`;

      const fallbackMsg = await thread.send({
        content: `${fallbackContent}\n\n\`\`\`No webhook found in ModmailConfig, please recreate the modmail setup.\`\`\``,
        files: attachmentResult.discordAttachments,
      });

      // Track the message even for fallback
      await messageService.addMessage(message.author.id, {
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
          thread.id,
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
      });

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
      discordMessageUrl: ModmailMessageService.createMessageUrl(
        null,
        message.channelId,
        message.id
      ),
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
    await db.findOneAndUpdate(
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
    );

    log.debug(`Updated last activity for user ${message.author.id} in modmail`);
  } catch (error) {
    log.error(error as string);
    return message.react("<:error:1182430951897321472>");
  }

  // Return success reaction - the webhook sending already handled the reactions above
  return;
}

async function handleReply(message: Message, client: Client<true>, staffUser: User) {
  const db = new Database();
  const thread = message.channel;
  const messages = await thread.messages.fetch();
  const messageService = new ModmailMessageService();

  // const lastMessage = messages.last()!; // Check that the bot is the one who opened the thread.
  // if (lastMessage.author.id !== client.user.id) return;
  // ^ This caused ratelimiting when checking if the bot owned the channel

  const mail = await db.findOne(Modmail, { forumThreadId: thread.id });
  if (!mail) {
    // This is not a modmail thread so we tell the redis to cache that fact
    return redisClient.set(`${env.MODMAIL_TABLE}:forumThreadId:${thread.id}`, "false");
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

  const data = await tryCatch(
    (
      await getter.getUser(mail.userId)
    ).send({
      content: dmContent,
      files: attachmentResult.discordAttachments,
      embeds: allEmbeds.length > 0 ? allEmbeds : undefined,
    })
  );

  if (data.error) {
    message.react("🚫");
    return message.reply({
      embeds: [
        BasicEmbed(
          client,
          "Modmail",
          `An error occured while trying to send your message to the user. They probably have DMs disabled or are not in the server anymore.\n\nHere's the error: \`\`\`${data.error}\`\`\`\n\nClick the button below to close the thread.`,
          undefined,
          "Red"
        ),
      ],
      components: [createCloseThreadButton()],
    });
  }

  // Send follow-up DM for large files if needed
  const fileUploadSummary = createFileUploadSummary(attachmentResult);
  if (fileUploadSummary && data.data) {
    await tryCatch(
      (
        await getter.getUser(mail.userId)
      ).send({
        content: `📁 **Staff File Upload Summary:**\n${fileUploadSummary}`,
      })
    );
  }

  // Also inform user about file processing (with better context for staff messages)
  if ((attachmentResult.hasLargeFiles || !attachmentResult.allSuccessful) && data.data) {
    const userFeedback = createUserFileUploadFeedback(attachmentResult, true);
    if (userFeedback) {
      await tryCatch(
        (
          await getter.getUser(mail.userId)
        ).send({
          content: userFeedback,
        })
      );
    }
  }

  // React based on attachment processing success
  if (attachmentResult.allSuccessful) {
    await message.react("📨");
  } else {
    await message.react("⚠️");
  }

  // Track the staff message in our system
  const trackingMessageId = messageService.generateMessageId();

  // Get DM channel for URL creation if the message was sent successfully
  let dmMessageUrl: string | undefined = undefined;
  if (data.data?.id && data.data?.channel?.id) {
    dmMessageUrl = ModmailMessageService.createMessageUrl(null, data.data.channel.id, data.data.id);
  }

  await messageService.addMessage(mail.userId, {
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
    dmMessageId: data.data?.id, // The DM message ID if successful
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
  });

  log.debug(
    `Tracked staff message ${trackingMessageId} for user ${mail.userId} from staff ${staffUser.id}`
  );

  debugMsg("Sent message to user" + mail.userId + " in guild " + mail.guildId);

  return message.react("📨");
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
