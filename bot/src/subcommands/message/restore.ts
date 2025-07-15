import { SlashCommandProps } from "commandkit";
import { ActionRowBuilder, ButtonBuilder, Client, EmbedBuilder, Message } from "discord.js";
import { ThingGetter } from "../../utils/TinyUtils";
import { MessageProcessor } from "../../services/MessageProcessor";
import BasicEmbed from "../../utils/BasicEmbed";
import CommandError from "../../utils/interactionErrors/CommandError";
import ButtonWrapper from "../../utils/ButtonWrapper";

export default async function ({ interaction, client }: SlashCommandProps) {
  try {
    const messageUrl = interaction.options.getString("url", true);
    const url = new URL(messageUrl);

    const getter = new ThingGetter(client);
    const message = await getter.getMessageFromUrl(url);

    if (!message) {
      throw new Error("Message not found");
    }

    const { embed, components } = await getRestoreEmbed(message, client);
    await interaction.editReply({ embeds: [embed], content: "", components });
  } catch (error) {
    return new CommandError(`Failed to restore message: ${error}`, interaction, client).send();
  }
}

async function getRestoreEmbed(
  message: Message,
  client: Client<true>
): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] }> {
  try {
    // Extract message content and embeds
    const messageData = {
      content: message.content || undefined,
      embeds: cleanEmbeds(message.embeds),
    };

    const shortUrl = await MessageProcessor.uploadJson(messageData);

    const buttons = ButtonWrapper([
      new ButtonBuilder().setURL(shortUrl).setLabel("View Data").setStyle(5),
    ]) as ActionRowBuilder<ButtonBuilder>[];

    return {
      embed: BasicEmbed(
        client,
        "Message Restored",
        [
          `Click [here](${shortUrl}) to view the message json.`,
          `You can then copy it to discohook's JSON editor to restore the message.`,
        ].join("\n")
      ),
      components: buttons,
    };
  } catch (error) {
    throw new Error(`Failed to create restore link: ${error}`);
  }
}

/**
 * Cleans embedded properties that aren't needed for Discohook
 * @param embeds Array of Discord embeds
 * @returns Cleaned embeds without extraneous properties
 */
function cleanEmbeds(embeds: any[]): any[] {
  return embeds.map((embed) => {
    // Create a new object with only the properties we want to keep
    const cleanEmbed: any = {};

    // Copy allowed properties
    if (embed.title) cleanEmbed.title = embed.title;
    if (embed.description) cleanEmbed.description = embed.description;
    if (embed.url) cleanEmbed.url = embed.url;
    if (embed.timestamp) cleanEmbed.timestamp = embed.timestamp;
    if (embed.color) cleanEmbed.color = embed.color;

    // Handle footer
    if (embed.footer) {
      cleanEmbed.footer = {
        text: embed.footer.text,
      };
      if (embed.footer.iconURL) cleanEmbed.footer.icon_url = embed.footer.iconURL;
    }

    // Handle image
    if (embed.image) {
      cleanEmbed.image = {
        url: embed.image.url,
      };
    }

    // Handle thumbnail
    if (embed.thumbnail) {
      cleanEmbed.thumbnail = {
        url: embed.thumbnail.url,
      };
    }

    // Handle author
    if (embed.author) {
      cleanEmbed.author = {
        name: embed.author.name,
      };
      if (embed.author.iconURL) cleanEmbed.author.icon_url = embed.author.iconURL;
      if (embed.author.url) cleanEmbed.author.url = embed.author.url;
    }

    // Handle fields
    if (embed.fields && embed.fields.length > 0) {
      cleanEmbed.fields = embed.fields.map((field: any) => ({
        name: field.name,
        value: field.value,
        inline: field.inline,
      }));
    }

    return cleanEmbed;
  });
}
