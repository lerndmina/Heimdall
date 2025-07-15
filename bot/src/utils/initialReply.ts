import {
  CommandInteraction,
  Interaction,
  InteractionType,
  MessageComponentInteraction,
  MessageFlags,
} from "discord.js";
import { waitingEmoji, isAprilFools } from "../Bot";

const JOKE_MESSAGES = [
  "Getting out of bed...",
  "Finding the motivation to run this command...",
  "Searching for the meaning of life...",
  "Trying to remember where I left my keys...",
  "Downloading the latest memes...",
  "Rebooting my brain...",
  "Wow you woke me up to ask me this?!?",
];

export async function initialReply(
  interaction: Interaction | MessageComponentInteraction,
  ephemeral = false
) {
  if (interaction.type === InteractionType.ApplicationCommandAutocomplete)
    throw new Error("Autocomplete interaction is not supported for initial reply");

  if (!isAprilFools) {
    return await interaction.reply({
      content: waitingEmoji,
      flags: ephemeral ? [MessageFlags.Ephemeral] : [],
    });
  }

  const randomMessage = JOKE_MESSAGES[Math.floor(Math.random() * JOKE_MESSAGES.length)];
  return await interaction.reply({
    content: `${waitingEmoji} ${randomMessage}`,
    flags: ephemeral ? [MessageFlags.Ephemeral] : [],
  });
}
