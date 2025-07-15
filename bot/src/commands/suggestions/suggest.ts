import type { SlashCommandProps, CommandOptions } from "commandkit";
import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  ButtonBuilder,
  ButtonStyle,
  Interaction,
  EmbedField,
  ChannelType,
  Message,
  userMention,
} from "discord.js";
import { globalCooldownKey, setCommandCooldown, userCooldownKey, waitingEmoji } from "../../Bot";
import generateHelpFields from "../../utils/data/static/generateHelpFields";
import { initialReply } from "../../utils/initialReply";
import Database from "../../utils/data/database";
import SuggestionConfigModel, { SuggestionConfigType } from "../../models/SuggestionConfig";
import BasicEmbed from "../../utils/BasicEmbed";
import { tryCatch } from "../../utils/trycatch";
import SuggestionModel, { SuggestionStatus, SuggestionsType } from "../../models/Suggestions";
import FetchEnvs from "../../utils/FetchEnvs";
import OpenAI from "openai";
import log from "../../utils/log";
import { Channel } from "diagnostics_channel";

export const data = new SlashCommandBuilder()
  .setName("suggest")
  .setDescription("Suggest a feature or improvement")
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

const db = new Database();
const env = FetchEnvs();

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const suggestionConfig = await db.findOne(
    SuggestionConfigModel,
    {
      guildId: interaction.guildId!,
    },
    true
  );
  if (!suggestionConfig) {
    await interaction.reply({
      content: "",
      embeds: [BasicEmbed(client, "‼️ Error", "This server does not have suggestions enabled.")],
      ephemeral: true,
    });
    return;
  }

  // Create the modal
  const modalId = `suggestionModal-${interaction.id}`;
  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle("Submit a Suggestion (Submit within 1 hour)");
  const modalTimer = 60 * 60 * 1000; // 1 hour in milliseconds

  // Create the text input components
  const suggestionInput = new TextInputBuilder()
    .setCustomId("suggestionInput")
    .setLabel("What's your suggestion?")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(20)
    .setMaxLength(1000)
    .setPlaceholder("Describe your suggestion in detail...")
    .setRequired(true);

  const reasonInput = new TextInputBuilder()
    .setCustomId("reasonInput")
    .setLabel("Why should we add this?")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(20)
    .setMaxLength(500)
    .setPlaceholder("Explain why this would be beneficial...")
    .setRequired(true);

  // ! Disabled Importance ! //
  // const importanceInput = new TextInputBuilder()
  //   .setCustomId("importanceInput")
  //   .setLabel("How important is this? (1-10)")
  //   .setStyle(TextInputStyle.Short)
  //   .setMinLength(1)
  //   .setMaxLength(2)
  //   .setPlaceholder("Enter a number between 1 and 10")
  //   .setRequired(true);

  // Add inputs to action rows
  const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(suggestionInput);
  const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  // ! Disabled Importance ! //
  // const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(importanceInput);

  // Add action rows to the modal
  modal.addComponents(firstActionRow, secondActionRow);

  // Present the modal to the user
  try {
    await interaction.showModal(modal);
  } catch (error) {
    console.error("Error showing modal:", error);
    await interaction.reply({
      content:
        "There was an error showing the suggestion modal. Please try again in a few seconds. If you contineu to have issues, please contact the server admin.",
      ephemeral: true,
    });
    return;
  }

  // Wait for the modal submission
  const filter = (i: ModalSubmitInteraction) => i.customId === modalId;
  try {
    const modalSubmit = await interaction.awaitModalSubmit({
      filter,
      time: 60 * 60 * 1000,
    });

    // Get the data entered by the user
    const suggestion = modalSubmit.fields.getTextInputValue("suggestionInput");
    const reason = modalSubmit.fields.getTextInputValue("reasonInput");
    // ! Disabled Importance ! //
    // const importance = modalSubmit.fields.getTextInputValue("importanceInput");

    // ! Disabled Importance ! //
    // // Validate importance is between 1 and 10
    // const importanceNum = parseInt(importance);
    // if (isNaN(importanceNum) || importanceNum < 0 || importanceNum > 10) {
    //   await modalSubmit.reply({
    //     content: `Please provide a valid importance rating between 1 and 10.\nSuggestion: ${suggestion}\nReason: ${reason}`,
    //     ephemeral: true,
    //   });
    //   return;
    // }

    await submitSuggestion(modalSubmit, suggestion, reason, suggestionConfig);
  } catch (error) {
    // If the user didn't submit the modal in time
    console.error("Modal timeout or error:", error);
    // No need to reply as the modal probably timed out
  }
}

async function submitSuggestion(
  interaction: ModalSubmitInteraction,
  suggestion: string,
  reason: string,
  suggestionConfig: SuggestionConfigType
) {
  await initialReply(interaction, true);

  let suggestionMessage: Message<true> | null = null;

  try {
    log.debug("Starting suggestion submission process", {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: suggestionConfig.channelId,
      suggestionLength: suggestion.length,
      reasonLength: reason.length,
    });

    const title = await getSuggestionTitle(suggestion, reason);
    log.debug("Generated suggestion title", { title, titleLength: title.length });

    // Create a temporary suggestion object for display purposes
    const tempSuggestion = {
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      channelId: suggestionConfig.channelId,
      suggestion,
      reason,
      title,
      status: SuggestionStatus.Pending,
      id: `temp-${Date.now()}`, // Temporary ID for buttons
      messageLink: "", // Temporary empty messageLink
    };

    // Send message to the suggestions channel first
    log.debug("Attempting to fetch suggestions channel", { channelId: suggestionConfig.channelId });
    const suggestionsChannel = await interaction.client.channels.fetch(suggestionConfig.channelId);
    log.debug("Channel fetch completed", {
      channelExists: !!suggestionsChannel,
      channelType: suggestionsChannel?.type,
      isTextBased: suggestionsChannel?.isTextBased(),
    });

    if (
      !suggestionsChannel ||
      !suggestionsChannel.isTextBased() ||
      suggestionsChannel.type !== ChannelType.GuildText
    ) {
      log.debug("Channel validation failed", {
        channelExists: !!suggestionsChannel,
        isTextBased: suggestionsChannel?.isTextBased(),
        channelType: suggestionsChannel?.type,
        expectedType: ChannelType.GuildText,
      });
      await interaction.editReply({
        content:
          "There was an error accessing the suggestions channel. Please contact an administrator.",
      });
      return;
    }

    log.debug("Channel validation passed, creating embed and buttons");
    const suggestionEmbed = getSuggestionEmbed(interaction, tempSuggestion as SuggestionsType);
    const row = getSuggestionButtons(0, 0, tempSuggestion as SuggestionsType); // Initialize with 0 upvotes and downvotes
    log.debug("Embed and buttons created, attempting to send message");

    const { data: messageResult, error: messageError } = await tryCatch(
      suggestionsChannel.send({
        embeds: [suggestionEmbed],
        components: [row],
      })
    );

    if (!messageResult || messageError) {
      log.error("Failed to send suggestion message to channel", { error: messageError });
      await interaction.editReply({
        content: "There was an error sending your suggestion message. Please try again later.",
      });
      return;
    }

    suggestionMessage = messageResult;
    log.debug("Message sent successfully", {
      messageId: suggestionMessage.id,
      messageUrl: suggestionMessage.url,
    });

    // Now create and save the suggestion to the database with the message URL
    const newSuggestion = new SuggestionModel({
      userId: interaction.user.id,
      guildId: interaction.guildId!,
      channelId: suggestionConfig.channelId,
      suggestion,
      reason,
      title,
      status: SuggestionStatus.Pending,
      messageLink: suggestionMessage.url,
    });
    log.debug("Created new suggestion model", {
      modelId: newSuggestion.id,
      status: newSuggestion.status,
      hasTitle: !!newSuggestion.title,
      hasMessageLink: !!newSuggestion.messageLink,
    });

    // Save the suggestion to the database
    log.debug("Attempting to save suggestion to database", { suggestionId: newSuggestion.id });
    const savedSuggestion = await db.findOneAndUpdate(
      SuggestionModel,
      { id: newSuggestion.id },
      newSuggestion,
      {
        upsert: true,
        new: true,
      }
    );
    log.debug("Database save operation completed", {
      savedSuggestionExists: !!savedSuggestion,
      savedSuggestionId: savedSuggestion?.id,
      savedSuggestionStatus: savedSuggestion?.status,
    });

    if (!savedSuggestion || !savedSuggestion.id) {
      log.error("Failed to save suggestion to database");
      // Delete the message since DB save failed
      await tryCatch(suggestionMessage.delete());
      log.debug("Deleted message due to database save failure");
      await interaction.editReply({
        content: "There was an error saving your suggestion. Please try again later.",
      });
      return;
    }

    log.info(`New suggestion created with ID: ${savedSuggestion.id}`);

    // Update the message with the correct suggestion ID in buttons
    const updatedEmbed = getSuggestionEmbed(interaction, savedSuggestion);
    const updatedRow = getSuggestionButtons(0, 0, savedSuggestion);

    const { error: updateError } = await tryCatch(
      suggestionMessage.edit({
        embeds: [updatedEmbed],
        components: [updatedRow],
      })
    );

    if (updateError) {
      log.warn("Failed to update message with correct suggestion ID", { error: updateError });
    }

    if (suggestionMessage && !suggestionMessage.hasThread) {
      log.debug("Creating thread for suggestion message", { messageId: suggestionMessage.id });
      const { data: thread, error: _ } = await tryCatch(
        suggestionMessage.startThread({
          name: `Suggestion Discussion - ${savedSuggestion.title}`,
          reason: `Suggestion discussion for ${savedSuggestion.title}`,
        })
      );

      if (thread) {
        thread.send({
          content: `${userMention(
            interaction.user.id
          )} This thread has been created for discussion about the suggestion: ${
            savedSuggestion.title
          }. Please keep the discussion respectful and constructive.`,
        });
      }
      log.debug("Thread created successfully");
    }

    // Reply to the user
    log.debug("Sending final reply to user", { messageLink: savedSuggestion.messageLink });
    await interaction.editReply({
      content: `Thank you! Your suggestion has been submitted ${savedSuggestion.messageLink}`,
    });
    log.debug("Final reply sent successfully");

    // Set cooldown
    log.debug("Setting user cooldown", { userId: interaction.user.id, cooldownSeconds: 3600 });
    setCommandCooldown(userCooldownKey(interaction.user.id, "suggest"), 60 * 60); // 1 hour cooldown in seconds
    log.debug("Suggestion submission process completed successfully");
  } catch (error) {
    log.error("Error submitting suggestion:", error);
    log.debug("Error context", {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: suggestionConfig.channelId,
      errorName: error instanceof Error ? error.name : "Unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    // If we have a message and an error occurred, try to delete it
    if (suggestionMessage) {
      await tryCatch(suggestionMessage.delete());
      log.debug("Deleted message due to error in submission process");
    }

    await interaction.editReply({
      content: "There was an error submitting your suggestion. Please try again later.",
    });
  }
}

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

async function getSuggestionTitle(suggestion: string, reason?: string): Promise<string> {
  // // !!! DISABLED FOR NOW !!!
  // return "A User Suggestion Title"; // Fallback title

  try {
    const conversation = [
      {
        role: "system",
        content:
          "You are a title generating service. You will be provided with a suggestion and you will generate a short title for it 20-100 characters.",
      },
    ];
    conversation.push({
      role: "user",
      content: suggestion,
    });
    if (reason) {
      conversation.push({
        role: "user",
        content: `The reason for this suggestion is: ${reason}`,
      });
    }
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: conversation as any,
      max_tokens: 100, // limit token usage
      temperature: 0.5,
    });

    if (!response || !response.choices[0] || !response.choices[0].message.content) {
      return "Untitled Suggestion";
    }
    return response.choices[0].message.content.trim();
  } catch (error) {
    return "Untitled Suggestion"; // Fallback title in case of error
  }
}

export function getSuggestionButtons(
  upvotes: number,
  downvotes: number,
  savedSuggestion: SuggestionsType
) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`suggest-upvote-${savedSuggestion.id}`)
      .setLabel(`Upvote (${upvotes})`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(savedSuggestion.status !== SuggestionStatus.Pending)
      .setEmoji("👍"),
    new ButtonBuilder()
      .setCustomId(`suggest-downvote-${savedSuggestion.id}`)
      .setLabel(`Downvote (${downvotes})`)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(savedSuggestion.status !== SuggestionStatus.Pending)
      .setEmoji("👎")
  );

  if (savedSuggestion.status !== SuggestionStatus.Approved)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`suggest-manage-${savedSuggestion.id}`)
        .setLabel("Manage")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⚙️")
    );

  return row;
}

export function getSuggestionEmbed(
  interaction: Interaction,
  savedSuggestion: SuggestionsType,
  managedBy?: string
) {
  const embedColour =
    savedSuggestion.status === SuggestionStatus.Pending
      ? "Blue"
      : savedSuggestion.status === SuggestionStatus.Approved
      ? "Green"
      : "Red";
  const embedEmoji =
    savedSuggestion.status === SuggestionStatus.Pending
      ? "⏳"
      : savedSuggestion.status === SuggestionStatus.Approved
      ? "✅"
      : "❌";

  managedBy = managedBy || savedSuggestion.managedBy || interaction.user.id; // Default to the user who submitted the suggestion

  const fields: EmbedField[] = [
    { name: "Suggestion (Your suggestion)", value: savedSuggestion.suggestion, inline: false },
    { name: "Reason (Why we should add this)", value: savedSuggestion.reason, inline: false },
    { name: "Submitted by", value: `<@${savedSuggestion.userId}>`, inline: true },
    { name: "Created / Updated", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
    { name: "Status", value: savedSuggestion.status, inline: true },
  ];

  if (savedSuggestion.status !== SuggestionStatus.Pending) {
    fields.push({
      name: savedSuggestion.status === SuggestionStatus.Approved ? "Approved by" : "Denied by",
      value: `<@${managedBy}>`,
      inline: true,
    });
  }

  return BasicEmbed(
    interaction.client,
    `${embedEmoji} - ${savedSuggestion.title}`,
    ``,
    fields,
    savedSuggestion.status === SuggestionStatus.Pending
      ? "Blue"
      : savedSuggestion.status === SuggestionStatus.Approved
      ? "Green"
      : "Red"
  );
}
