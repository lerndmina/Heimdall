import { EmbedBuilder, Message } from "discord.js";

export async function editMessage(
  message: Message,
  title: string,
  description: string,
  fields: any,
  online = true
) {
  const originalEmbed = message.embeds[0];
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setColor(online ? "Green" : "DarkRed");
  try {
    await message.edit({ embeds: [originalEmbed ? originalEmbed : {}, embed] });
    return true;
  } catch (error) {
    return false;
  }
}
