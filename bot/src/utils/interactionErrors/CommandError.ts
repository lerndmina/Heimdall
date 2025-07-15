import { ChatInputCommandInteraction, Client } from "discord.js";
import BaseError from "./BaseError";

export default class CommandError extends BaseError {
  constructor(error: any, interaction: ChatInputCommandInteraction, client: Client<true>) {
    super(error, interaction, client);
  }
}
