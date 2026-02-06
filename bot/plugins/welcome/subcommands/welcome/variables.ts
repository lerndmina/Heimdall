/**
 * /welcome variables — Show available template variables
 */

import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { WelcomePluginAPI } from "../../index.js";

export async function handleVariables(context: CommandContext, pluginAPI: WelcomePluginAPI): Promise<void> {
  const { interaction } = context;

  const docs = pluginAPI.welcomeService.getTemplateDocumentation();

  const variablesList = Object.entries(docs)
    .map(([key, description]) => `**${key}** — ${description}`)
    .join("\n");

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📝 Welcome Message Variables")
    .setDescription("You can use these variables in your welcome message:\n\n" + variablesList)
    .addFields({
      name: "Example",
      value: "```Welcome {mention} to {guild}! You are member #{membercount}.{newline}We hope you enjoy your stay, {username}!```",
      inline: false,
    })
    .setFooter({ text: "Variables are case-sensitive" });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
