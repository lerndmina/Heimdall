import { ChannelType, SlashCommandBuilder } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { ApplicationsPluginAPI } from "../index.js";

export const data = new SlashCommandBuilder()
  .setName("application")
  .setDescription("Manage application forms and panel posting")
  .addSubcommand((sub) => sub.setName("list").setDescription("List application forms in this server"))
  .addSubcommand((sub) =>
    sub
      .setName("post")
      .setDescription("Post an application panel to a channel")
      .addStringOption((opt) => opt.setName("form").setDescription("Form ID or form name").setRequired(true))
      .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to post into").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
  );

export const config = {
  allowInDMs: false,
  pluginName: "applications",
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  const api = getPluginAPI<ApplicationsPluginAPI>("applications");
  if (!api || !interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "❌ Applications plugin is unavailable.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "list") {
    const forms = await api.applicationService.listForms(interaction.guildId);
    if (forms.length === 0) {
      await interaction.reply({ content: "No application forms found.", ephemeral: true });
      return;
    }

    const lines = forms.slice(0, 25).map((form) => `• **${form.name}** (\`${form.formId}\`) — ${form.enabled ? "Enabled" : "Disabled"}`);
    await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    return;
  }

  const formQuery = interaction.options.getString("form", true);
  const channel = interaction.options.getChannel("channel", true);
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    await interaction.reply({ content: "❌ Target channel must be text-based.", ephemeral: true });
    return;
  }

  const forms = await api.applicationService.listForms(interaction.guildId);
  const form = forms.find((entry) => entry.formId === formQuery || entry.name.toLowerCase() === formQuery.toLowerCase());
  if (!form) {
    await interaction.reply({ content: "❌ Form not found. Use `/application list` to see available forms.", ephemeral: true });
    return;
  }

  await api.applicationService.postPanel(form as any, channel as any, interaction.user.id, api.lib);
  await interaction.reply({ content: `✅ Posted **${form.name}** panel in <#${channel.id}>.`, ephemeral: true });
}
