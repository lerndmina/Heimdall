import { SlashCommandProps } from "commandkit";
import { ChannelType, GuildTextBasedChannel, MessageCreateOptions } from "discord.js";
import { MessageProcessor } from "../../services/MessageProcessor";
import CommandError from "../../utils/interactionErrors/CommandError";
import log from "../../utils/log";

export default async function ({ interaction, client }: SlashCommandProps) {
  try {
    // Validate channel
    const channel = validateChannel(interaction.options.getChannel("channel"));

    // Get message data
    const attachment = interaction.options.getAttachment("data");
    const shortLink = interaction.options.getString("short-link");

    // Process message content
    await interaction.editReply(`Processing message data...`);
    const result = await MessageProcessor.processMessage(attachment, shortLink);

    if (!result.success || !result.data) {
      throw new Error(result.error || "Failed to process message data");
    }

    // Send message
    await interaction.editReply(`Sending message to ${channel.name}...`);
    const message = await sendMessage(channel, result.data as MessageCreateOptions);

    // Confirm success
    await interaction.editReply({
      content: `Message sent successfully to ${channel.name}`,
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              label: "View Message",
              style: 5,
              url: message.url,
            },
          ],
        },
      ],
    });
  } catch (error) {
    log.error(`Send message error: ${error}`);
    return new CommandError(`Failed to send message: ${error}`, interaction, client).send();
  }
}

function validateChannel(channelOption: any): GuildTextBasedChannel {
  if (!channelOption) {
    throw new Error("No channel provided");
  }

  if (channelOption.type !== ChannelType.GuildText) {
    throw new Error(`Invalid channel type. Expected text channel, got ${channelOption.type}`);
  }

  return channelOption as GuildTextBasedChannel;
}

async function sendMessage(channel: GuildTextBasedChannel, data: MessageCreateOptions) {
  try {
    return await channel.send(data);
  } catch (error) {
    throw new Error(`Failed to send message: ${error}`);
  }
}
