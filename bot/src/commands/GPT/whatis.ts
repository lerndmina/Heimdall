import { SlashCommandBuilder, Client } from "discord.js";
import OpenAI from "openai";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs, { isOptionalUnset } from "../../utils/FetchEnvs";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { globalCooldownKey, setCommandCooldown, userCooldownKey } from "../../Bot";
import { returnMessage } from "../../utils/TinyUtils";
import log from "../../utils/log";
const env = FetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("whatis")
  .setDescription("Ask the AI about this object")
  .addStringOption((option) =>
    option
      .setName("object")
      .setDescription("The object for the AI to describe.")
      .setRequired(true)
      .setMaxLength(30)
  );

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
};

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function run({ interaction, client, handler }: SlashCommandProps) {
  if (isOptionalUnset(env.OPENAI_API_KEY)) {
    return returnMessage(
      interaction,
      client,
      "Disabled",
      "The AI integration is disabled. If you think this is a mistake, please contact the server owner.",
      { error: false, firstMsg: true, ephemeral: true }
    );
  }
  await setCommandCooldown(globalCooldownKey(interaction.commandName), 60);
  await setCommandCooldown(userCooldownKey(interaction.user.id, interaction.commandName), 300);
  const requestMessage = interaction.options.getString("object");
  if (!requestMessage)
    return interaction.reply({ content: "You must specify an object.", ephemeral: true });

  let conversation = [
    {
      role: "system",
      content:
        "You are an AI, you will be presented with a name or object. You must come up with a funny and incorrect description for the prompt. Please keep it short. Do not mention the object name in the response.",
    },
  ];

  conversation.push({
    role: "user",
    content: requestMessage,
  });

  // Tell discord to wait while we process the request
  await interaction.deferReply({ ephemeral: false });

  // Send the message to OpenAI to be processed
  const response = await openai.chat.completions
    .create({
      model: "gpt-4o-mini",
      messages: conversation as any,
      // max_tokens: 256, // limit token usage
    })
    .catch((error) => {
      log.error(`OPENAI ERR: ${error}`);
      interaction.editReply({
        content: "Something went wrong with the AI. Please try again.",
      });
      return;
    });

  if (!response || !response.choices[0] || !response.choices[0].message.content) {
    return returnMessage(
      interaction,
      client,
      "Error",
      "Something went wrong with the AI. Please try again.",
      { error: true }
    );
  }

  const aiResponse = response.choices[0].message.content;

  // Send the response back to discord
  interaction.editReply({
    embeds: [BasicEmbed(client, `Object: ${requestMessage}`, `\`\`\`${aiResponse}\`\`\``)],
  });
}
