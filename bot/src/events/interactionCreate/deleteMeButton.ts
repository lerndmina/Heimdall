import {
  Client,
  InteractionType,
  MessageComponentInteraction,
  PermissionFlagsBits,
  messageLink,
} from "discord.js";
import { waitingEmoji } from "../../Bot";
import { ThingGetter, debugMsg, returnMessage } from "../../utils/TinyUtils";
import { initialReply } from "../../utils/initialReply";

export const DELETEME_BUTTON_PREFIX = "deleteMe-";

export default async (interaction: MessageComponentInteraction, client: Client<true>) => {
  if (interaction.type !== InteractionType.MessageComponent) return;
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;
  if (!interaction.message.author.bot) return;
  if (interaction.message.author.id !== client.user?.id) return;
  if (!interaction.customId.startsWith(DELETEME_BUTTON_PREFIX)) return;

  const userId = interaction.customId.split("-")[1];

  const getter = new ThingGetter(client);

  const member = await getter.getMember(interaction.guild, interaction.user.id);
  if (!member) {
    returnMessage(
      interaction,
      client,
      "",
      "Got an invalid member, they may have left the server.",
      { error: true, firstMsg: true, ephemeral: true }
    );
    return;
  }

  const memberHasManageMessages = member.permissions.has(PermissionFlagsBits.ManageMessages);
  debugMsg(`deleteMeButton.ts: userId: ${userId}`);
  debugMsg(`deleteMeButton.ts: memberHasManageMessages: ${memberHasManageMessages}`);
  debugMsg(`deleteMeButton.ts: interaction.user.id: ${interaction.user.id}`);

  let canDelete = false;

  if (memberHasManageMessages) canDelete = true;
  if (interaction.user.id === userId) canDelete = true;

  if (!canDelete) {
    returnMessage(interaction, client, "", "You don't have permission to delete that message.", {
      error: true,
      firstMsg: true,
      ephemeral: true,
    });
    return;
  }

  await initialReply(interaction, true);
  try {
    await interaction.message.delete();
  } catch (error) {
    await interaction.editReply({
      content: "I don't have permission to delete that message or it is already gone.",
    });
  }
  await interaction.editReply({ content: "Deleted!" });
  return;
};
