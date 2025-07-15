import {
  Client,
  InteractionType,
  MessageComponentInteraction,
  MessageCreateOptions,
  MessagePayload,
  PermissionFlagsBits,
  messageLink,
} from "discord.js";
import { waitingEmoji } from "../../Bot";
import { ThingGetter, debugMsg, returnMessage } from "../../utils/TinyUtils";

export default async (interaction: MessageComponentInteraction, client: Client<true>) => {
  if (interaction.type !== InteractionType.MessageComponent) return;
  if (!interaction.isButton()) return;
  if (!interaction.guild) return;
  if (!interaction.message.author.bot) return;
  if (interaction.message.author.id !== client.user?.id) return;
  if (!interaction.customId.startsWith("ts_dmMe-")) return;

  try {
    const user = interaction.user;
    const tsSeconds = interaction.customId.split("-")[2];

    const dmChannel = await user.createDM();
    dmChannel.send;
    const messages: (string | MessagePayload | MessageCreateOptions)[] = [
      "Here is the timestamp you requested:",
      "<t:" + tsSeconds + ":F>",
      "Long press on the above line and select `Copy Text` to copy the timestamp to your clipboard.\nHere's a [short video](<https://i.imgur.com/vHnSC2u.mp4>) that shows how to do it. If you are having trouble try pressing down slightly to the right of the timestamp but still on the same line.",
    ];

    let errorSending: boolean = false;
    for (const message of messages) {
      try {
        await dmChannel.send(message);
      } catch (error) {
        errorSending = true;
        break;
      }
    }

    if (errorSending) {
      await interaction.reply({
        content:
          "One or more of the messages could not be sent to you. Please make sure you have [DMs enabled](https://5v1.me/view/Discord_fxWJWL6SXr.png).",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `Sent the timestamp to you in [our DMs](<${dmChannel.url}>)!`,
        ephemeral: true,
      });
    }
  } catch (error: any) {
    console.error(error);
    console.error("Error in dmTimestamp.ts");
    returnMessage(
      interaction,
      client,
      "Emergency Try/Catch Hit!",
      `I just hit an emergency try/catch block. Please report this to the developers. This happened in the \`dmTimestamp.ts\` file at ⏱️ \`${Date.now().toString()}\`.`,
      { error: true, ephemeral: true }
    );
  }
};
