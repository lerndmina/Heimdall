const { Client, Message, EmbedBuilder } = require("discord.js");
const { Configuration, OpenAIApi } = require("openai");
const FetchEnvs = require("../utils/FetchEnvs");

const systemPrompt = require("../utils/SystemPrompt");
const BasicEmbed = require("../utils/BasicEmbed");
const { error } = require("console");

const onMention = async (client, message, apiKey) => {
  const configuration = new Configuration({
    apiKey: apiKey,
  });

  const openai = new OpenAIApi(configuration);

  let conversationLog = [{ role: "system", content: systemPrompt }];

  const reply = await message.reply({
    embeds: [BasicEmbed(client, "⌛Thinking...", "Requesting data from OpenAI")],
  });

  try {
    let prevMessages = await message.channel.messages.fetch({ limit: 15 });
    prevMessages.reverse();

    prevMessages.forEach((msg) => {
      if (msg.content.startsWith("!")) return;
      if (msg.author.id !== client.user.id && message.author.bot) return;

      // if message contains a mention, replace it with the user's name
      if (msg.content.includes("@")) {
        msg.content = msg.content.replace(/<@!?\d+>/g, msg.author.username);
      }

      if (msg.author.id == client.user.id) {
        conversationLog.push({
          role: "assistant",
          content: msg.content,
          name: msg.author.username.replace(/\s+/g, "_").replace(/[^\w\s]/gi, ""),
        });
      }

      if (msg.author.id == message.author.id) {
        conversationLog.push({
          role: "user",
          content: msg.content,
          name: message.author.username.replace(/\s+/g, "_").replace(/[^\w\s]/gi, ""),
        });
      }
    });

    const result = await openai
      .createChatCompletion({
        model: "gpt-4",
        messages: conversationLog,
        // max_tokens: 256, // limit token usage
      })
      .catch((error) => {
        log.error(`OPENAI ERR: ${error}`);

        reply.edit({
          embeds: [BasicEmbed(client, "🔗 Error", "There was an error with the request.")],
        });
        return;
      });

    var response = result.data.choices[0].message.content;
    // if response is larger than 2000 characters, split it into multiple messages
    if (response.length > 2000) {
      log.info("Response too long, truncating.");
      response = response.substring(0, 2000);
    }

    reply.edit({ embeds: [BasicEmbed(client, "⌛Thinking...", "Parsing response...")] });
    response = await require("../utils/ResponsePlugins")(response);
    const linkExists = /\[(.*?)\]\((.*?\.gif)\)/.test(response);
    if (linkExists) {
      reply.edit({
        embeds: [],
        content: response,
      });
      return;
    }

    reply.edit({ embeds: [BasicEmbed(client, "🤖AI Response", response)] });
  } catch (error) {
    log.error(error);
    reply
      .edit({
        embeds: [BasicEmbed(client, "🐞 Error", "There was an error when parsing the response.")],
      })
      .catch((error) => {
        log.error(
          `There was an error occured while editing the message. It has probably been deleted.`
        );
        log.error(error);
      });
  }
};

module.exports = onMention;
