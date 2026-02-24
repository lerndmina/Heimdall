import { Events, type Interaction } from "discord.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import { getApplicationsAPI } from "../../index.js";

export const event = Events.InteractionCreate;
export const pluginName = "applications";

export async function execute(_client: HeimdallClient, interaction: Interaction): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  if (!interaction.customId.startsWith("application.review.reason.")) return;

  const api = getApplicationsAPI();
  if (!api) return;
  await api.reviewService.handleDecisionModalSubmit(interaction);
}
