/**
 * /suggestion-categories edit — Edit a suggestion category via modal
 */

import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import { nanoid } from "nanoid";
import type { CommandContext } from "../../../../src/core/CommandManager.js";
import { broadcastDashboardChange } from "../../../../src/core/broadcast.js";
import type { SuggestionsPluginAPI } from "../../index.js";
import { SuggestionConfigHelper } from "../../models/SuggestionConfig.js";
import { createLogger } from "../../../../src/core/Logger.js";

const log = createLogger("suggestions:cat-edit");

export async function handleEdit(context: CommandContext, pluginAPI: SuggestionsPluginAPI): Promise<void> {
  const { interaction } = context;

  try {
    const categoryId = interaction.options.getString("category", true);

    const category = await SuggestionConfigHelper.getCategory(interaction.guildId!, categoryId);
    if (!category) {
      await interaction.reply({ content: "❌ Category not found.", ephemeral: true });
      return;
    }

    const modalId = nanoid();
    const modal = new ModalBuilder().setCustomId(modalId).setTitle(`Edit Category: ${category.name}`);

    const nameInput = new TextInputBuilder().setCustomId("name").setLabel("Category Name").setStyle(TextInputStyle.Short).setMaxLength(50).setValue(category.name).setRequired(true);

    const descriptionInput = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("Category Description")
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(200)
      .setValue(category.description)
      .setRequired(true);

    const emojiInput = new TextInputBuilder()
      .setCustomId("emoji")
      .setLabel("Category Emoji (optional)")
      .setPlaceholder("🐛 or use full Discord format <:emoji:123456>")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setValue(category.emoji || "")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(emojiInput),
    );

    await interaction.showModal(modal);

    const modalSubmit = await interaction
      .awaitModalSubmit({
        filter: (i) => i.user.id === interaction.user.id && i.customId === modalId,
        time: 900_000,
      })
      .catch(() => null);

    if (!modalSubmit) return;

    await modalSubmit.deferReply({ ephemeral: true });

    const newName = modalSubmit.fields.getTextInputValue("name");
    const newDescription = modalSubmit.fields.getTextInputValue("description");
    const newEmoji = modalSubmit.fields.getTextInputValue("emoji") || undefined;

    const result = await SuggestionConfigHelper.updateCategory(interaction.guildId!, categoryId, { name: newName, description: newDescription, emoji: newEmoji }, interaction.user.id);

    if (!result.success) {
      await modalSubmit.editReply(`❌ Failed to update category: ${result.error}`);
      return;
    }

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("✅ Category Updated Successfully")
      .setColor(0x00ff00)
      .addFields(
        { name: "Name", value: `${newEmoji || "📁"} ${newName}`, inline: true },
        { name: "Description", value: newDescription, inline: true },
        { name: "Status", value: category.isActive ? "Active" : "Inactive", inline: true },
      )
      .setTimestamp();

    await modalSubmit.editReply({ embeds: [embed] });
    broadcastDashboardChange(interaction.guildId!, "suggestions", "category_updated", { requiredAction: "suggestions.manage_categories" });
  } catch (error) {
    log.error("Error editing category:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ An error occurred while editing the category.", ephemeral: true });
    }
  }
}
