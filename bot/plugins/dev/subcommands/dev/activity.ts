/**
 * /dev activity — Interactive panel for managing the bot's Discord presence.
 *
 * Panel layout (ephemeral, 15-minute TTL):
 *   Row 0  — Buttons: [Add Preset] [Clear Activity] [Toggle Rotation]
 *   Row 1  — Select: Online Status
 *   Row 2  — Select: Rotation Interval
 *   Row 3  — Select: Activate a Preset       (only when presets exist)
 *   Row 4  — Select: Delete a Preset         (only when presets exist)
 */

import {
  ActivityType,
  ActionRowBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { nanoid } from "nanoid";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { LibAPI } from "../../../lib/index.js";
import type { HeimdallClient } from "../../../../src/types/Client.js";
import BotActivityModel, { type BotActivityConfig, type BotActivityPreset } from "../../models/BotActivityModel.js";
import { activityRotationService, applyPreset } from "../../services/ActivityRotationService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PANEL_TTL = 900; // 15 minutes

const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  custom: ActivityType.Custom,
  competing: ActivityType.Competing,
};

const ACTIVITY_TYPE_LABELS: Record<number, string> = {
  [ActivityType.Playing]: "Playing",
  [ActivityType.Streaming]: "Streaming",
  [ActivityType.Listening]: "Listening",
  [ActivityType.Watching]: "Watching",
  [ActivityType.Custom]: "Custom",
  [ActivityType.Competing]: "Competing",
};

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "🟢 Online", value: "online" },
  { label: "🌙 Idle", value: "idle" },
  { label: "⛔ Do Not Disturb", value: "dnd" },
  { label: "⚫ Invisible", value: "invisible" },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));

const INTERVAL_OPTIONS: { label: string; value: string }[] = [
  { label: "30 seconds", value: "30" },
  { label: "1 minute", value: "60" },
  { label: "5 minutes", value: "300" },
  { label: "15 minutes", value: "900" },
  { label: "30 minutes", value: "1800" },
  { label: "1 hour", value: "3600" },
  { label: "Custom…", value: "custom" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

async function getConfig(): Promise<BotActivityConfig | null> {
  return BotActivityModel.findById("global").lean();
}

async function ensureConfig(): Promise<BotActivityConfig> {
  return (
    (await BotActivityModel.findOneAndUpdate({ _id: "global" }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).lean()) ??
    ({ _id: "global", presets: [], activePresetId: null, status: "online", rotation: { enabled: false, intervalSeconds: 60, currentIndex: 0 } } as unknown as BotActivityConfig)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Embed builder
// ─────────────────────────────────────────────────────────────────────────────

function buildEmbed(lib: LibAPI, config: BotActivityConfig | null) {
  const presets = config?.presets ?? [];
  const rotation = config?.rotation ?? { enabled: false, intervalSeconds: 60, currentIndex: 0 };
  const activeId = config?.activePresetId ?? null;
  const status = config?.status ?? "online";
  const activePreset = presets.find((p) => p.id === activeId);

  const activityLine = activePreset ? `${ACTIVITY_TYPE_LABELS[activePreset.type] ?? "Unknown"} **${activePreset.text}**` : "*None*";

  const rotationLine = rotation.enabled ? `✅ Enabled · every **${formatInterval(rotation.intervalSeconds)}** · ${presets.length} preset${presets.length !== 1 ? "s" : ""}` : "❌ Disabled";

  const embed = lib
    .createEmbedBuilder()
    .setTitle("🤖 Bot Activity Manager")
    .addFields(
      { name: "Current Activity", value: activityLine, inline: true },
      { name: "Status", value: STATUS_LABELS[status] ?? "🟢 Online", inline: true },
      { name: "Rotation", value: rotationLine },
    );

  if (presets.length > 0) {
    const lines = presets.map((p, i) => {
      const tag = p.id === activeId ? " ◀ **active**" : "";
      return `\`${i + 1}.\` **${p.name}** — ${ACTIVITY_TYPE_LABELS[p.type] ?? "?"} \`${p.text}${p.url ? ` (${p.url})` : ""}\`${tag}`;
    });
    embed.addFields({ name: `Presets (${presets.length})`, value: lines.join("\n").slice(0, 1024) });
  } else {
    embed.addFields({ name: "Presets", value: "No presets configured. Press **➕ Add Preset** to get started." });
  }

  return embed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel builder — creates all component rows
// ─────────────────────────────────────────────────────────────────────────────

async function buildPanel(lib: LibAPI, client: HeimdallClient, originalInteraction: ChatInputCommandInteraction) {
  const config = await getConfig();
  const presets = config?.presets ?? [];
  const rotation = config?.rotation ?? { enabled: false, intervalSeconds: 60, currentIndex: 0 };
  const currentStatus = config?.status ?? "online";

  const embed = buildEmbed(lib, config);
  const components: ActionRowBuilder<any>[] = [];

  /** Re-builds the panel and edits the original ephemeral reply. */
  const refresh = async () => {
    const { embeds, components: comps } = await buildPanel(lib, client, originalInteraction);
    await originalInteraction.editReply({ embeds, components: comps });
  };

  // ── Row 0 — Buttons ────────────────────────────────────────────────────────

  const addBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      const modal = new ModalBuilder().setCustomId(nanoid()).setTitle("Add Activity Preset");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("name").setLabel("Preset Name").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Main Status").setRequired(true).setMaxLength(50),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("type")
            .setLabel("Activity Type")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Playing, Streaming, Listening, Watching, Custom, Competing")
            .setRequired(true)
            .setMaxLength(20),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("text").setLabel("Activity Text").setStyle(TextInputStyle.Short).setPlaceholder("e.g. Minecraft").setRequired(true).setMaxLength(128),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("url")
            .setLabel("Stream URL (Streaming type only)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("https://twitch.tv/…")
            .setRequired(false)
            .setMaxLength(512),
        ),
      );

      await i.showModal(modal);
      const submit = await i.awaitModalSubmit({ filter: (s) => s.customId === modal.data.custom_id && s.user.id === i.user.id, time: 300_000 }).catch(() => null);
      if (!submit) return;

      const presetName = submit.fields.getTextInputValue("name").trim();
      const typeStr = submit.fields.getTextInputValue("type").trim().toLowerCase();
      const text = submit.fields.getTextInputValue("text").trim();
      const url = submit.fields.getTextInputValue("url").trim() || undefined;

      const activityType = ACTIVITY_TYPE_MAP[typeStr];
      if (activityType === undefined) {
        await submit.reply({
          content: `❌ Invalid type \`${typeStr}\`. Must be one of: Playing, Streaming, Listening, Watching, Custom, Competing`,
          ephemeral: true,
        });
        return;
      }
      if (activityType === ActivityType.Streaming && !url) {
        await submit.reply({ content: "❌ **Streaming** requires a URL.", ephemeral: true });
        return;
      }

      await submit.deferUpdate();

      await BotActivityModel.updateOne({ _id: "global" }, { $push: { presets: { id: nanoid(8), name: presetName, type: activityType, text, url } } }, { upsert: true });

      // Restart rotation with the new preset included
      const updated = await getConfig();
      if (updated && updated.rotation?.enabled && updated.presets.length > 0) {
        activityRotationService.restart(client, updated.presets, updated.rotation.intervalSeconds, updated.status ?? "online");
      }

      await refresh();
    }, PANEL_TTL)
    .setLabel("➕ Add Preset")
    .setStyle(ButtonStyle.Success);

  const clearBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      activityRotationService.stop();
      await BotActivityModel.updateOne({ _id: "global" }, { $set: { activePresetId: null, "rotation.enabled": false } }, { upsert: true });
      client.user.setActivity();
      await refresh();
    }, PANEL_TTL)
    .setLabel("🗑️ Clear Activity")
    .setStyle(ButtonStyle.Danger);

  const toggleRotationBtn = lib
    .createButtonBuilder(async (i: ButtonInteraction) => {
      await i.deferUpdate();
      const freshConfig = await ensureConfig();
      const newEnabled = !freshConfig.rotation.enabled;

      await BotActivityModel.updateOne({ _id: "global" }, { $set: { "rotation.enabled": newEnabled } });
      const updated = await getConfig();
      if (!updated) return;

      if (newEnabled && updated.presets.length > 0) {
        activityRotationService.start(client, updated.presets, updated.rotation.intervalSeconds, updated.status ?? "online");
      } else if (newEnabled && updated.presets.length === 0) {
        // Can't rotate with no presets — revert
        await BotActivityModel.updateOne({ _id: "global" }, { $set: { "rotation.enabled": false } });
        await originalInteraction.followUp({ content: "⚠️ Add at least one preset before enabling rotation.", ephemeral: true });
      } else {
        activityRotationService.stop();
        // Restore the manually active preset if any
        if (updated.activePresetId) {
          const preset = updated.presets.find((p) => p.id === updated.activePresetId);
          if (preset) applyPreset(client, preset, updated.status ?? "online");
        }
      }

      await refresh();
    }, PANEL_TTL)
    .setLabel(rotation.enabled ? "⏸️ Disable Rotation" : "🔄 Enable Rotation")
    .setStyle(rotation.enabled ? ButtonStyle.Secondary : ButtonStyle.Primary);

  await Promise.all([addBtn.ready(), clearBtn.ready(), toggleRotationBtn.ready()]);
  components.push(new ActionRowBuilder<any>().addComponents(addBtn, clearBtn, toggleRotationBtn));

  // ── Row 1 — Status Select ──────────────────────────────────────────────────

  const statusSelect = lib
    .createStringSelectMenuBuilder(async (i: StringSelectMenuInteraction) => {
      await i.deferUpdate();
      const newStatus = i.values[0]!;
      await BotActivityModel.updateOne({ _id: "global" }, { $set: { status: newStatus } }, { upsert: true });

      // Apply status immediately — keep existing activity
      client.user.setStatus(newStatus as any);
      await refresh();
    }, PANEL_TTL)
    .setPlaceholder(`Status: ${STATUS_LABELS[currentStatus] ?? "🟢 Online"}`)
    .addOptions(STATUS_OPTIONS.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)));

  await statusSelect.ready();
  components.push(new ActionRowBuilder<any>().addComponents(statusSelect));

  // ── Row 2 — Interval Select ────────────────────────────────────────────────

  const currentInterval = rotation.intervalSeconds ?? 60;
  const intervalPlaceholder = INTERVAL_OPTIONS.find((o) => o.value !== "custom" && parseInt(o.value, 10) === currentInterval)?.label ?? `Custom (${formatInterval(currentInterval)})`;

  const intervalSelect = lib
    .createStringSelectMenuBuilder(async (i: StringSelectMenuInteraction) => {
      const value = i.values[0]!;
      let newSeconds: number;

      if (value === "custom") {
        const modal = new ModalBuilder().setCustomId(nanoid()).setTitle("Custom Rotation Interval");
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("seconds").setLabel("Interval in seconds (minimum: 10)").setStyle(TextInputStyle.Short).setPlaceholder("e.g. 45").setRequired(true).setMaxLength(6),
          ),
        );

        await i.showModal(modal);
        const submit = await i.awaitModalSubmit({ filter: (s) => s.customId === modal.data.custom_id && s.user.id === i.user.id, time: 120_000 }).catch(() => null);
        if (!submit) return;

        const raw = submit.fields.getTextInputValue("seconds").trim();
        const parsed = parseInt(raw, 10);
        if (isNaN(parsed) || parsed < 10) {
          await submit.reply({ content: "❌ Interval must be a number ≥ 10 seconds.", ephemeral: true });
          return;
        }
        newSeconds = parsed;
        await submit.deferUpdate();
      } else {
        await i.deferUpdate();
        newSeconds = parseInt(value, 10);
      }

      await BotActivityModel.updateOne({ _id: "global" }, { $set: { "rotation.intervalSeconds": newSeconds } }, { upsert: true });

      const updated = await getConfig();
      if (updated && updated.rotation?.enabled && updated.presets.length > 0) {
        activityRotationService.restart(client, updated.presets, newSeconds, updated.status ?? "online");
      }

      await refresh();
    }, PANEL_TTL)
    .setPlaceholder(`Interval: ${intervalPlaceholder}`)
    .addOptions(INTERVAL_OPTIONS.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)));

  await intervalSelect.ready();
  components.push(new ActionRowBuilder<any>().addComponents(intervalSelect));

  // ── Rows 3 & 4 — Preset selects (only when presets exist) ─────────────────

  if (presets.length > 0) {
    // Cap at 25 (Discord select menu limit)
    const visiblePresets = presets.slice(0, 25);
    const activeId = config?.activePresetId ?? null;

    // ── Activate select ──
    const activateSelect = lib
      .createStringSelectMenuBuilder(async (i: StringSelectMenuInteraction) => {
        await i.deferUpdate();
        const presetId = i.values[0]!;

        // Stop rotation — manual activation takes precedence
        activityRotationService.stop();
        await BotActivityModel.updateOne({ _id: "global" }, { $set: { activePresetId: presetId, "rotation.enabled": false } });

        const updated = await getConfig();
        if (updated) {
          const preset = updated.presets.find((p) => p.id === presetId);
          if (preset) applyPreset(client, preset, updated.status ?? "online");
        }

        await refresh();
      }, PANEL_TTL)
      .setPlaceholder(activeId ? `Active: ${visiblePresets.find((p) => p.id === activeId)?.name ?? "Unknown"}` : "Activate a preset…")
      .addOptions(
        visiblePresets.map((p) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${p.name} (${ACTIVITY_TYPE_LABELS[p.type] ?? "?"})`)
            .setDescription(p.text.length > 50 ? `${p.text.slice(0, 47)}…` : p.text)
            .setValue(p.id),
        ),
      );

    await activateSelect.ready();
    components.push(new ActionRowBuilder<any>().addComponents(activateSelect));

    // ── Delete select ──
    const deleteSelect = lib
      .createStringSelectMenuBuilder(async (i: StringSelectMenuInteraction) => {
        await i.deferUpdate();
        const presetId = i.values[0]!;

        const currentConfig = await getConfig();
        const wasActive = currentConfig?.activePresetId === presetId;

        await BotActivityModel.updateOne({ _id: "global" }, { $pull: { presets: { id: presetId } } });

        if (wasActive) {
          await BotActivityModel.updateOne({ _id: "global" }, { $set: { activePresetId: null } });
          client.user.setActivity();
        }

        const updated = await getConfig();
        if (updated && updated.rotation?.enabled) {
          if (updated.presets.length > 0) {
            activityRotationService.restart(client, updated.presets, updated.rotation.intervalSeconds, updated.status ?? "online");
          } else {
            // No presets left — disable rotation
            activityRotationService.stop();
            await BotActivityModel.updateOne({ _id: "global" }, { $set: { "rotation.enabled": false } });
            client.user.setActivity();
          }
        }

        await refresh();
      }, PANEL_TTL)
      .setPlaceholder("🗑️ Delete a preset…")
      .addOptions(
        visiblePresets.map((p) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(p.name)
            .setDescription(`${ACTIVITY_TYPE_LABELS[p.type] ?? "?"}: ${p.text.slice(0, 50)}`)
            .setValue(p.id),
        ),
      );

    await deleteSelect.ready();
    components.push(new ActionRowBuilder<any>().addComponents(deleteSelect));
  }

  return { embeds: [embed], components };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function handleActivity(context: CommandContext): Promise<void> {
  const { interaction, client, getPluginAPI } = context;

  const lib = getPluginAPI<LibAPI>("lib");
  if (!lib) {
    await interaction.reply({ content: "❌ lib plugin not available.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const { embeds, components } = await buildPanel(lib, client as unknown as HeimdallClient, interaction);
  await interaction.editReply({ embeds, components });
}
