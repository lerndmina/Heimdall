import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

/**
 * Creates a View Message button that links to a message
 * @param url The URL of the message to link to
 * @returns ActionRowBuilder with button
 */
export function createViewMessageButton(url: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("View Message").setStyle(ButtonStyle.Link).setURL(url)
  );
}
