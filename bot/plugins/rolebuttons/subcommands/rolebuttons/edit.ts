import { ActionRowBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction } from "discord.js";
import { nanoid } from "nanoid";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import type { RoleButtonsPluginAPI } from "../../index.js";

const COMPONENT_TTL = 900;

function parseJsonObject(raw: string): Record<string, unknown> {
  const value = JSON.parse(raw || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function handleEdit(context: CommandContext, api: RoleButtonsPluginAPI): Promise<void> {
  const { interaction } = context;
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
    return;
  }

  const panelName = interaction.options.getString("panel", true);
  const panel = (await api.roleButtonService.listPanels(guildId)).find((p) => p.name.toLowerCase() === panelName.toLowerCase());
  if (!panel) {
    await interaction.reply({ content: `❌ Panel \`${panelName}\` not found.`, ephemeral: true });
    return;
  }

  const flowEmbed = api.lib
    .createEmbedBuilder()
    .setTitle(`Role Buttons Editor: ${panel.name}`)
    .setDescription("Use buttons below to edit embed JSON, buttons JSON, or toggle exclusivity.\n\nButtons JSON format: array of `{ label, roleId, mode, style, row, emoji? }`.")
    .addFields(
      { name: "Exclusive", value: panel.exclusive ? "Enabled" : "Disabled", inline: true },
      { name: "Buttons", value: String(panel.buttons?.length ?? 0), inline: true },
      { name: "Posts", value: String(panel.posts?.length ?? 0), inline: true },
    );

  const openJsonModal = async (i: ButtonInteraction, field: "embed" | "buttons") => {
    const modal = new ModalBuilder().setCustomId(nanoid()).setTitle(field === "embed" ? "Edit Embed JSON" : "Edit Buttons JSON");
    const input = new TextInputBuilder()
      .setCustomId("json")
      .setLabel(field === "embed" ? "Embed object JSON" : "Buttons array JSON")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue(field === "embed" ? JSON.stringify(panel.embed ?? {}, null, 2) : JSON.stringify(panel.buttons ?? [], null, 2));

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await i.showModal(modal);

    const submit = await i.awaitModalSubmit({ filter: (s) => s.customId === modal.data.custom_id && s.user.id === i.user.id, time: 300000 }).catch(() => null);
    if (!submit) return;

    try {
      const raw = submit.fields.getTextInputValue("json");
      const patch = field === "embed" ? { embed: parseJsonObject(raw) } : { buttons: JSON.parse(raw) };
      const updated = await api.roleButtonService.updatePanel(guildId, panel.id, patch as any);
      if (!updated) {
        await submit.reply({ content: "❌ Panel no longer exists.", flags: MessageFlags.Ephemeral });
        return;
      }

      panel.embed = updated.embed as any;
      panel.buttons = updated.buttons as any;
      panel.exclusive = updated.exclusive;

      broadcastDashboardChange(guildId, "rolebuttons", "panel_updated", { requiredAction: "rolebuttons.manage" });
      await submit.reply({ content: `✅ Updated ${field}.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      await submit.reply({ content: `❌ ${(error as Error).message || "Invalid JSON."}`, flags: MessageFlags.Ephemeral });
    }
  };

  const embedBtn = api.lib
    .createButtonBuilder((i) => openJsonModal(i, "embed"), COMPONENT_TTL)
    .setLabel("Edit Embed JSON")
    .setStyle(ButtonStyle.Primary);
  const buttonsBtn = api.lib
    .createButtonBuilder((i) => openJsonModal(i, "buttons"), COMPONENT_TTL)
    .setLabel("Edit Buttons JSON")
    .setStyle(ButtonStyle.Secondary);
  const exclusiveBtn = api.lib
    .createButtonBuilder(async (i) => {
      const updated = await api.roleButtonService.updatePanel(guildId, panel.id, { exclusive: !panel.exclusive } as any);
      if (!updated) {
        await i.reply({ content: "❌ Panel no longer exists.", ephemeral: true });
        return;
      }
      panel.exclusive = updated.exclusive;
      broadcastDashboardChange(guildId, "rolebuttons", "panel_updated", { requiredAction: "rolebuttons.manage" });
      await i.reply({ content: `✅ Exclusive mode is now **${panel.exclusive ? "enabled" : "disabled"}**.`, ephemeral: true });
    }, COMPONENT_TTL)
    .setLabel(panel.exclusive ? "Disable Exclusive" : "Enable Exclusive")
    .setStyle(panel.exclusive ? ButtonStyle.Danger : ButtonStyle.Success);

  const previewBtn = api.lib
    .createButtonBuilder(async (i) => {
      const preview = await api.roleButtonService.buildPanelMessage(panel as any, api.lib);
      await i.reply({ content: "Preview:", embeds: preview.embeds as any, components: preview.components as any, ephemeral: true });
    }, COMPONENT_TTL)
    .setLabel("Preview")
    .setStyle(ButtonStyle.Secondary);

  await Promise.all([embedBtn.ready(), buttonsBtn.ready(), exclusiveBtn.ready(), previewBtn.ready()]);

  await interaction.reply({
    embeds: [flowEmbed],
    components: [new ActionRowBuilder<any>().addComponents(embedBtn, buttonsBtn), new ActionRowBuilder<any>().addComponents(exclusiveBtn, previewBtn)],
    flags: MessageFlags.Ephemeral,
  });
}
