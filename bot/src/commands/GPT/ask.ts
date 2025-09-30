import { SlashCommandBuilder, Client } from "discord.js";
import OpenAI from "openai";
import BasicEmbed from "../../utils/BasicEmbed";
import FetchEnvs, { isOptionalUnset } from "../../utils/FetchEnvs";
import { LegacySlashCommandProps } from "@heimdall/command-handler";
import systemPrompt from "../../utils/SystemPrompt";
import ResponsePlugins from "../../utils/ResponsePlugins";
import { returnMessage } from "../../utils/TinyUtils";
import { globalCooldownKey, setCommandCooldown, userCooldownKey } from "../../Bot";
import { contextService } from "../../services/ContextService";
import log from "../../utils/log";
const env = FetchEnvs();

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask the AI")
  .addStringOption((option) =>
    option.setName("message").setDescription("The message to send to the AI.").setRequired(true)
  );

export const options = {
  devOnly: false,
};

export async function run({ interaction, client, handler }: LegacySlashCommandProps) {
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
  const requestMessage = interaction.options.getString("message");

  // Tell discord to wait while we process the request
  await interaction.deferReply({ ephemeral: false });

  // Get context for AI if in a guild
  let contextualSystemPrompt = systemPrompt;
  let contextSources: string[] = [];

  if (interaction.guildId) {
    try {
      const context = await contextService.getContextForAI(
        interaction.guildId,
        requestMessage!,
        client
      );
      contextSources = await contextService.getContextSources(interaction.guildId, requestMessage!);

      if (context.trim()) {
        contextualSystemPrompt = `${systemPrompt}

ADDITIONAL CONTEXT:
${context}

When using this context, prioritize accuracy and helpfulness. If the context contains relevant information for the user's question, use it. If not, rely on your general knowledge.`;
      }
    } catch (error) {
      log.error("Error getting AI context:", error);
      // Continue with default system prompt if context fails
    }
  }

  let conversation = [{ role: "system", content: contextualSystemPrompt }];

  conversation.push({
    role: "user",
    content: requestMessage as string,
  });

  // Send the message to OpenAI to be processed
  const response = await openai.chat.completions
    .create({
      model: "gpt-5-mini",
      messages: conversation as any,
      // max_tokens: 256, // limit token usage
    })
    .catch((error) => {
      log.error(`OPENAI ERR: ${error}`);
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

  let aiResponse = await ResponsePlugins(response.choices[0].message.content);

  // Add context indicators if context was used
  if (contextSources.length > 0) {
    const contextIndicators = contextSources
      .map((source) => {
        switch (source) {
          case "bot":
            return "🤖 *Bot Knowledge*";
          case "custom":
            return "📝 *Server Context*";
          default:
            return "";
        }
      })
      .filter(Boolean);

    if (contextIndicators.length > 0) {
      aiResponse += `\n\n*Response based on: ${contextIndicators.join(" + ")}*`;
    }
  }

  // Send the response back to discord
  interaction.editReply({ content: aiResponse });
}
