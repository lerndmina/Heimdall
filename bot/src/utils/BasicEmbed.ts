import { Client, EmbedBuilder, Embed, ColorResolvable, EmbedField } from "discord.js";
import { getRandomFooterMessage } from "../Bot";

/**
 * @description Create a basic embed with a title, description, fields, and color.
 * @param client The Discord client object.
 * @param title The title of the embed.
 * @param description The description of the embed.
 * @param fields The fields of the embed.
 * @param color The color of the embed.
 * @returns The embed object.
 */
export default function (
  client: Client<true>,
  title: string,
  description?: string,
  fields?: EmbedField[],
  color?: ColorResolvable
) {
  if (color == undefined) color = "#de3b79";

  var embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setAuthor({
      name: client.user.username,
      iconURL: client.user.avatarURL() || undefined,
    })
    .setTimestamp(Date.now())
    .setFooter({ text: getRandomFooterMessage() });

  if (fields != undefined) {
    fields.forEach((field) => {
      embed.addFields(field);
    });
  }

  if (description && description !== "*") embed.setDescription(description);

  return embed;
}
