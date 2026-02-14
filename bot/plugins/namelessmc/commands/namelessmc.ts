import { ActionRowBuilder, ButtonStyle, MessageFlags, ModalBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { nanoid } from "nanoid";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { NamelessMcPluginAPI } from "../index.js";
import { NamelessMcService } from "../services/NamelessMcService.js";

function resolveSiteBaseUrl(): string {
  return (process.env.NAMELESS_SITE_BASE_URL || "").trim();
}

function resolveApiKey(): string {
  return (process.env.NAMELESS_API_KEY || "").trim();
}

export const data = new SlashCommandBuilder().setName("namelessmc").setDescription("Connect your Discord account to NamelessMC");

export const config = {
  allowInDMs: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<NamelessMcPluginAPI>("namelessmc");
  if (!pluginAPI) {
    await interaction.editReply("❌ NamelessMC plugin not loaded.");
    return;
  }

  const siteBaseUrl = resolveSiteBaseUrl();
  const apiKey = resolveApiKey();
  const isConfigured = Boolean(siteBaseUrl) && Boolean(apiKey);

  const sitePath = siteBaseUrl ? `${siteBaseUrl.replace(/\/+$/, "")}/user/connections/` : "sitebaseurl_ENV/user/connections/";

  const embed = pluginAPI.lib
    .createEmbedBuilder()
    .setColor(isConfigured ? 0x5865f2 : 0xffa500)
    .setTitle("🔗 Connect Discord to NamelessMC")
    .setDescription(
      "Follow these steps:\n" +
        `1. Navigate to **${sitePath}**\n` +
        "2. Click **Discord**\n" +
        "3. Click **Connect**\n" +
        "4. Copy the verification code shown on the site\n" +
        "5. Click the button below and paste the code into the modal",
    );

  if (!isConfigured) {
    embed.addFields({
      name: "⚙️ Configuration Needed",
      value: "Set NAMELESS_SITE_BASE_URL and NAMELESS_API_KEY in the bot environment, then run this command again.",
      inline: false,
    });
  }

  const connectButton = pluginAPI.lib.createButtonBuilder(async (buttonInteraction) => {
    if (!isConfigured) {
      await buttonInteraction.reply({
        content: "❌ NamelessMC is not configured. Missing NAMELESS_SITE_BASE_URL or NAMELESS_API_KEY.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (buttonInteraction.user.id !== interaction.user.id) {
      await buttonInteraction.reply({
        content: "❌ This panel belongs to another user.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("NamelessMC Verification");

    const codeInput = new TextInputBuilder()
      .setCustomId("verification_code")
      .setLabel("Verification code")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("Paste the code from NamelessMC")
      .setMinLength(3)
      .setMaxLength(128);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput));
    await buttonInteraction.showModal(modal);

    try {
      const submit = await buttonInteraction.awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 300_000,
      });

      await submit.deferUpdate();

      const code = submit.fields.getTextInputValue("verification_code").trim();
      const service = new NamelessMcService({ siteBaseUrl, apiKey });

      const result = await service.verifyDiscordCode({
        code,
        identifier: interaction.user.id,
        username: interaction.user.username,
      });

      if (!result.success) {
        await submit.followUp({
          content: `❌ Verification failed: ${result.message || "Invalid code or expired code."}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const successEmbed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Discord Connected").setDescription("Your Discord account is now connected to NamelessMC.");

      if (result.message) {
        successEmbed.addFields({ name: "API Response", value: result.message, inline: false });
      }

      await interaction.editReply({ embeds: [successEmbed], components: [] });
    } catch {
      // Modal timed out or interaction closed
    }
  }, 900);

  connectButton.setLabel("Paste Verification Code").setStyle(ButtonStyle.Primary).setEmoji("🔐").setDisabled(!isConfigured);
  await connectButton.ready();

  const row = new ActionRowBuilder<any>().addComponents(connectButton);
  await interaction.editReply({ embeds: [embed], components: [row] });
}
