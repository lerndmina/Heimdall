/**
 * Tags Add - Context Menu Command
 *
 * Right-click any message to save it as a tag via modal
 */

import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageContextMenuCommandInteraction,
  Client,
  InteractionContextType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from "discord.js";
import { CommandOptions } from "../../types/commands";
import HelpieReplies from "../../utils/HelpieReplies";
import TagModel from "../../models/Tag";
import log from "../../utils/log";
import fetchEnvs from "../../utils/FetchEnvs";

const env = fetchEnvs();

export const data = new ContextMenuCommandBuilder()
  .setName("Tags -> Add")
  .setType(ApplicationCommandType.Message)
  .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel]);

export const options: CommandOptions = {
  deleted: false,
};

export async function run(interaction: MessageContextMenuCommandInteraction, client: Client) {
  const isOwner = env.OWNER_IDS.includes(interaction.user.id);

  // Get the target message
  const targetMessage = interaction.targetMessage;

  // Extract message content
  let messageContent = targetMessage.content;

  // If message has no text content, check for embeds
  if (!messageContent || messageContent.trim().length === 0) {
    if (targetMessage.embeds.length > 0) {
      const embed = targetMessage.embeds[0];
      messageContent = `${embed.title || ""}${embed.title && embed.description ? "\n\n" : ""}${embed.description || ""}`.trim();

      if (!messageContent) {
        return HelpieReplies.warning(
          interaction,
          {
            title: "No Text Content",
            message: "This message has no text content to save as a tag.",
          },
          true
        );
      }
    } else {
      return HelpieReplies.warning(
        interaction,
        {
          title: "No Text Content",
          message: "This message has no text content to save as a tag.",
        },
        true
      );
    }
  }

  // Truncate content if too long (Discord message limit is 2000)
  if (messageContent.length > 2000) {
    messageContent = messageContent.substring(0, 1997) + "...";
  }

  // Show modal to get tag name and optionally make it global (owners only)
  const modalId = `tag_add_${targetMessage.id}_${isOwner ? "owner" : "user"}`;
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(isOwner ? "Create Tag (User/Global)" : "Create Tag");

  const nameInput = new TextInputBuilder()
    .setCustomId("tag_name")
    .setLabel("Tag Name")
    .setPlaceholder("my-tag-name")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(100);

  const contentInput = new TextInputBuilder()
    .setCustomId("tag_content")
    .setLabel("Tag Content (edit if needed)")
    .setValue(messageContent)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(2000);

  const rows: ActionRowBuilder<TextInputBuilder>[] = [new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput), new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput)];

  // Add global option for owners
  if (isOwner) {
    const globalInput = new TextInputBuilder()
      .setCustomId("tag_global")
      .setLabel("Make Global? (yes/no)")
      .setPlaceholder("no")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMinLength(2)
      .setMaxLength(3);

    rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(globalInput));
  }

  modal.addComponents(...rows);

  await interaction.showModal(modal);

  // Wait for modal submission
  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      time: 300000, // 5 minutes
      filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
    });

    await handleModalSubmit(modalSubmit, client, isOwner);
  } catch (error) {
    // Modal timed out or was cancelled - no action needed
    log.debug("Tag creation modal timed out or was cancelled");
  }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction, client: Client, isOwner: boolean) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const name = interaction.fields.getTextInputValue("tag_name").toLowerCase().trim();
    const content = interaction.fields.getTextInputValue("tag_content");

    // Check if owner wants to make it global
    let makeGlobal = false;
    if (isOwner) {
      try {
        const globalInput = interaction.fields.getTextInputValue("tag_global")?.toLowerCase().trim();
        makeGlobal = globalInput === "yes" || globalInput === "y";
      } catch {
        // Field not provided or empty - default to user tag
        makeGlobal = false;
      }
    }

    const scope = makeGlobal ? "global" : "user";

    // Validate tag name format
    if (!/^[a-z0-9_-]+$/.test(name)) {
      return interaction.editReply({
        content: "😲 **Invalid Tag Name**\n\nTag names can only contain lowercase letters, numbers, dashes, and underscores.",
      });
    }

    // Check if tag already exists
    const query = scope === "global" ? { scope: "global", name: name } : { userId: interaction.user.id, scope: "user", name: name };

    const existingTag = await TagModel.findOne(query);

    if (existingTag) {
      const scopeText = scope === "global" ? "A global" : "You already have a";
      return interaction.editReply({
        content: `😲 **Tag Already Exists**\n\n${scopeText} tag named \`${name}\`. Use \`/helpie tags remove ${name}\` to delete it first, or choose a different name.`,
      });
    }

    // Create new tag
    const newTag = new TagModel({
      userId: interaction.user.id,
      scope: scope,
      name: name,
      content: content,
    });

    await newTag.save();

    const scopeLabel = scope === "global" ? "global tag" : "tag";
    log.info(`User ${interaction.user.tag} created ${scopeLabel} from message: ${name}`);

    await interaction.editReply({
      content: `🤖 **Tag Created**\n\nSuccessfully created ${scope === "global" ? "**global**" : ""} tag \`${name}\`!\n\nUse it with: \`/helpie tag ${name}\``,
    });
  } catch (error: any) {
    log.error("Failed to create tag from modal:", error);

    return interaction.editReply({
      content: `😔 **Tag Creation Failed**\n\nFailed to create tag: ${error.message || "Unknown error"}`,
    });
  }
}
