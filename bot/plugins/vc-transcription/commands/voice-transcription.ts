/**
 * /voice-transcription command — Configure voice message transcription settings
 *
 * Subcommands:
 * - status: View current transcription config
 * - set: Set transcription mode (disabled/reactions/auto)
 */

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../src/core/broadcast.js";
import VoiceTranscriptionConfig from "../models/VoiceTranscriptionConfig.js";
import { TranscriptionMode, WhisperProvider } from "../types/index.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("vc-transcription");

export const data = new SlashCommandBuilder()
  .setName("voice-transcription")
  .setDescription("Configure voice message transcription settings")
  .addSubcommand((sub) => sub.setName("status").setDescription("View current transcription configuration"))
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Set transcription mode")
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("Transcription mode")
          .setRequired(true)
          .addChoices(
            { name: "🚫 Disabled — No transcription", value: TranscriptionMode.DISABLED },
            { name: "✍️ Reactions — React to transcribe", value: TranscriptionMode.REACTIONS },
            { name: "🤖 Auto — Transcribe all voice messages", value: TranscriptionMode.AUTO },
          ),
      ),
  );

export const config = {
  allowInDMs: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;

  if (!interaction.guild) {
    await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "status") {
    await handleStatus(interaction);
  } else if (subcommand === "set") {
    await handleSet(interaction);
  }
}

async function handleStatus(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void> {
  try {
    const config = await VoiceTranscriptionConfig.findOne({ guildId: interaction.guild!.id });
    const mode = (config?.mode as TranscriptionMode) || TranscriptionMode.DISABLED;
    const provider = (config?.whisperProvider as WhisperProvider) || WhisperProvider.LOCAL;
    const model = config?.whisperModel || "base.en";

    const modeDescriptions: Record<TranscriptionMode, string> = {
      [TranscriptionMode.DISABLED]: "🚫 **Disabled** — Voice messages are not transcribed",
      [TranscriptionMode.REACTIONS]: "✍️ **Reactions** — Users react with ✍️ to transcribe",
      [TranscriptionMode.AUTO]: "🤖 **Auto** — All voice messages are automatically transcribed",
    };

    const providerLabel = provider === WhisperProvider.OPENAI ? "OpenAI API" : "Local (whisper.cpp)";

    const filterInfo = [];
    if (config?.roleFilter?.mode && config.roleFilter.mode !== "disabled") {
      filterInfo.push(`Role filter: **${config.roleFilter.mode}** (${config.roleFilter.roles.length} roles)`);
    }
    if (config?.channelFilter?.mode && config.channelFilter.mode !== "disabled") {
      filterInfo.push(`Channel filter: **${config.channelFilter.mode}** (${config.channelFilter.channels.length} channels)`);
    }

    const filterSection = filterInfo.length > 0 ? `\n\n**Filters:**\n${filterInfo.join("\n")}` : "\n\n**Filters:** None configured";

    await interaction.reply({
      content:
        `## Voice Transcription Settings\n\n` +
        `**Mode:** ${modeDescriptions[mode]}\n` +
        `**Provider:** ${providerLabel}\n` +
        `**Model:** \`${model}\`` +
        filterSection +
        `\n\n*Use the dashboard for full configuration or \`/voice-transcription set\` to change the mode.*`,
      ephemeral: true,
    });
  } catch (error) {
    log.error("Failed to fetch transcription config:", error);
    await interaction.reply({ content: "❌ Failed to fetch transcription settings.", ephemeral: true });
  }
}

async function handleSet(interaction: import("discord.js").ChatInputCommandInteraction): Promise<void> {
  const mode = interaction.options.getString("mode", true) as TranscriptionMode;

  try {
    await VoiceTranscriptionConfig.findOneAndUpdate({ guildId: interaction.guild!.id }, { mode }, { upsert: true, new: true });

    const modeMessages: Record<TranscriptionMode, string> = {
      [TranscriptionMode.DISABLED]: "🚫 Voice transcription has been **disabled**. Voice messages will not be transcribed.",
      [TranscriptionMode.REACTIONS]: "✍️ Voice transcription set to **reactions mode**. Users can react with ✍️ to transcribe, or ❌ to dismiss.",
      [TranscriptionMode.AUTO]: "🤖 Voice transcription set to **auto mode**. All voice messages will be automatically transcribed.",
    };

    log.info(`Voice transcription mode changed to ${mode} in guild ${interaction.guild!.id} by ${interaction.user.username}`);

    await interaction.reply({
      content: `## Settings Updated\n\n${modeMessages[mode]}`,
      ephemeral: false,
    });
    broadcastDashboardChange(interaction.guild!.id, "vc-transcription", "config_updated", {
      requiredAction: "vc-transcription.manage_config",
    });
  } catch (error) {
    log.error("Failed to update transcription config:", error);
    await interaction.reply({ content: "❌ Failed to update transcription settings.", ephemeral: true });
  }
}
