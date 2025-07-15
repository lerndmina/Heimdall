import { Client, RepliableInteraction } from "discord.js";
import BasicEmbed from "../BasicEmbed";
import log from "../log";

export default class BaseError {
  error: any;
  interaction: RepliableInteraction;
  client: Client<true>;
  constructor(error: any, interaction: RepliableInteraction, client: Client<true>) {
    this.error = error;
    this.interaction = interaction;
    this.client = client;
  }

  send(message?: string) {
    log.error(this.error);
    if (this.interaction.replied) {
      return this.interaction.editReply({
        content: "",
        embeds: [
          BasicEmbed(
            this.client,
            "An error occurred",
            `${message ? `${message}\n\n` : ""}Full Error: \`\`\`${this.error}\`\`\``
          ),
        ],
      });
    }
  }
}
