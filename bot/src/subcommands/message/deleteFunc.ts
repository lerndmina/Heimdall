import { SlashCommandProps } from "commandkit";
import { ThingGetter } from "../../utils/TinyUtils";
import CommandError from "../../utils/interactionErrors/CommandError";

export default async function ({ interaction, client }: SlashCommandProps) {
  try {
    const messageUrl = interaction.options.getString("url", true);
    const url = new URL(messageUrl);

    const getter = new ThingGetter(client);
    const message = await getter.getMessageFromUrl(url);

    if (!message) {
      throw new Error("Message not found");
    }

    await message.delete();
    await interaction.editReply({ content: "Message deleted successfully" });
  } catch (error) {
    return new CommandError(`Failed to delete message: ${error}`, interaction, client).send();
  }
}
