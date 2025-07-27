import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  InteractionResponse,
  StringSelectMenuInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  Client,
} from "discord.js";
import Database from "../data/database";
import log from "../log";
import { tryCatch } from "../trycatch";
import { ModmailEmbeds } from "./ModmailEmbeds";
import ModmailConfig, {
  CategoryType,
  FormFieldSchema,
  FormFieldType,
  ModmailConfigType,
} from "../../models/ModmailConfig";
import { v4 as uuidv4 } from "uuid";

/**
 * Interface for form field management context
 */
export interface FormManagementContext {
  interaction: any;
  client: Client;
  category: CategoryType;
  config: ModmailConfigType;
}

/**
 * Manages form fields for modmail categories
 * Provides interactive UI for adding, editing, and removing form fields
 */
export class FormFieldManager {
  private db: Database;

  constructor() {
    this.db = new Database();
  }

  /**
   * Show the main form management interface
   * @param context Form management context
   */
  async showFormManagementInterface(context: FormManagementContext): Promise<void> {
    const { interaction, client, category, config } = context;

    const formFields = category.formFields || [];
    const canAddMore = formFields.length < 5; // Discord modal limit

    const embed = new EmbedBuilder()
      .setTitle(`📝 Form Management: ${category.name}`)
      .setDescription(
        `Manage form fields for this category. Users will fill out these fields when creating tickets.\n\n` +
          `**Current Fields:** ${formFields.length}/5\n` +
          `**Category:** ${category.name} ${category.emoji || ""}`
      )
      .setColor(0x0099ff)
      .setTimestamp();

    // Add field list to embed
    if (formFields.length > 0) {
      const fieldList = formFields
        .map((field, index) => {
          const required = field.required ? "✅" : "❌";
          const typeIcon = this.getFieldTypeIcon(field.type);
          return `${index + 1}. ${typeIcon} **${field.label}** (${
            field.type
          }) - Required: ${required}`;
        })
        .join("\n");

      embed.addFields([
        {
          name: "📋 Current Form Fields",
          value: fieldList,
          inline: false,
        },
      ]);
    } else {
      embed.addFields([
        {
          name: "📋 Current Form Fields",
          value: "No form fields configured",
          inline: false,
        },
      ]);
    }

    // Create action buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>();

    if (canAddMore) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`form_add_${category.id}`)
          .setLabel("Add Field")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("➕")
      );
    }

    if (formFields.length > 0) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`form_edit_${category.id}`)
          .setLabel("Edit Field")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("✏️"),
        new ButtonBuilder()
          .setCustomId(`form_delete_${category.id}`)
          .setLabel("Remove Field")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🗑️")
      );
    }

    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`form_close_${category.id}`)
        .setLabel("Close")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌")
        .setDisabled(false)
    );

    const components = [buttons];

    await interaction.editReply({
      content: "",
      embeds: [embed],
      components,
    });

    // Set up collectors for button interactions
    this.setupFormManagementCollectors(context);
  }

  /**
   * Set up collectors for form management interactions
   * @param context Form management context
   */
  private setupFormManagementCollectors(context: FormManagementContext): void {
    const { interaction, client, category, config } = context;

    const filter = (i: any) => i.user.id === interaction.user.id;
    const collector = interaction.channel?.createMessageComponentCollector({
      filter,
      time: 300000, // 5 minutes
    });

    collector?.on("collect", async (buttonInteraction: ButtonInteraction) => {
      const customId = buttonInteraction.customId;

      try {
        if (customId.startsWith("form_add_")) {
          await this.handleAddField(buttonInteraction, context);
        } else if (customId.startsWith("form_edit_")) {
          await this.handleEditField(buttonInteraction, context);
        } else if (customId.startsWith("form_delete_")) {
          await this.handleDeleteField(buttonInteraction, context);
        } else if (customId.startsWith("form_close_")) {
          await this.handleClose(buttonInteraction, context);
          collector.stop();
        }
      } catch (error) {
        log.error("Error handling form management interaction:", error);
        await buttonInteraction.reply({
          embeds: [
            ModmailEmbeds.error(
              client,
              "Error",
              "An error occurred while processing your request."
            ),
          ],
          ephemeral: true,
        });
      }
    });

    collector?.on("end", () => {
      log.debug("[Form Management] Collectors ended for category", category.id);
      // Clean up - disable components
      const disabledComponents = context.interaction.message?.components?.map((row: any) => {
        const newRow = new ActionRowBuilder();
        row.components.forEach((component: any) => {
          if (component.type === ComponentType.Button) {
            const button = ButtonBuilder.from(component).setDisabled(true);
            newRow.addComponents(button);
          }
        });
        return newRow;
      });

      if (disabledComponents) {
        context.interaction.editReply({ components: disabledComponents }).catch(() => {});
      }
    });
  }

  /**
   * Handle adding a new form field
   * @param interaction Button interaction
   * @param context Form management context
   */
  private async handleAddField(
    interaction: ButtonInteraction,
    context: FormManagementContext
  ): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId(`add_field_${context.category.id}`)
      .setTitle("Add Form Field");

    const labelInput = new TextInputBuilder()
      .setCustomId("field_label")
      .setLabel("Field Label")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setPlaceholder("e.g., What type of issue are you experiencing?");

    const typeInput = new TextInputBuilder()
      .setCustomId("field_type")
      .setLabel("Field Type")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("short, paragraph, select, or number")
      .setValue("short");

    const placeholderInput = new TextInputBuilder()
      .setCustomId("field_placeholder")
      .setLabel("Placeholder Text (Optional)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100)
      .setPlaceholder("Hint text for the user");

    const optionsInput = new TextInputBuilder()
      .setCustomId("field_options")
      .setLabel("Options (For Select Fields Only)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder("One option per line (only for select fields)");

    const requiredInput = new TextInputBuilder()
      .setCustomId("field_required")
      .setLabel("Required Field")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("true or false")
      .setValue("false");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(labelInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(placeholderInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(optionsInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(requiredInput)
    );

    await interaction.showModal(modal);

    // Handle modal submission
    const modalFilter = (i: ModalSubmitInteraction) =>
      i.customId === `add_field_${context.category.id}` && i.user.id === interaction.user.id;

    try {
      const modalInteraction = await interaction.awaitModalSubmit({
        filter: modalFilter,
        time: 300000,
      });

      await this.processAddFieldModal(modalInteraction, context);
    } catch (error) {
      log.error("Modal submission timeout or error:", error);
    }
  }

  /**
   * Process the add field modal submission
   * @param interaction Modal submit interaction
   * @param context Form management context
   */
  private async processAddFieldModal(
    interaction: ModalSubmitInteraction,
    context: FormManagementContext
  ): Promise<void> {
    const label = interaction.fields.getTextInputValue("field_label");
    const typeString = interaction.fields.getTextInputValue("field_type").toLowerCase();
    const placeholder = interaction.fields.getTextInputValue("field_placeholder") || undefined;
    const optionsString = interaction.fields.getTextInputValue("field_options");
    const requiredString = interaction.fields.getTextInputValue("field_required").toLowerCase();

    // Validate field type
    const validTypes = Object.values(FormFieldType);
    if (!validTypes.includes(typeString as FormFieldType)) {
      await interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            context.client,
            "Invalid Field Type",
            `Field type must be one of: ${validTypes.join(", ")}`
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    const fieldType = typeString as FormFieldType;

    // Validate required field
    const required = requiredString === "true";

    // Process options for select fields
    let options: string[] | undefined;
    if (fieldType === FormFieldType.SELECT) {
      if (!optionsString.trim()) {
        await interaction.reply({
          embeds: [
            ModmailEmbeds.error(
              context.client,
              "Missing Options",
              "Select fields must have at least one option."
            ),
          ],
          ephemeral: true,
        });
        return;
      }

      options = optionsString
        .split("\n")
        .map((opt) => opt.trim())
        .filter((opt) => opt.length > 0);

      if (options.length === 0 || options.length > 25) {
        await interaction.reply({
          embeds: [
            ModmailEmbeds.error(
              context.client,
              "Invalid Options",
              "Select fields must have 1-25 options."
            ),
          ],
          ephemeral: true,
        });
        return;
      }
    }

    // Create the new field
    const newField: FormFieldSchema = {
      id: uuidv4(),
      label,
      type: fieldType,
      required,
      placeholder,
      options,
    };

    // Add field to category and update database
    const currentFormFields = context.category.formFields || [];
    const updatedFormFields = [...currentFormFields, newField];

    const { error } = await tryCatch(
      this.updateCategoryFormFields(context.config.guildId, context.category.id, updatedFormFields)
    );

    if (error) {
      await interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            context.client,
            "Database Error",
            "Failed to save the new form field."
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        ModmailEmbeds.success(
          context.client,
          "Field Added",
          `Successfully added form field "${label}" to category "${context.category.name}".`
        ),
      ],
      ephemeral: true,
    });

    // Refresh the main interface by fetching updated category
    const { data: updatedConfig } = await tryCatch(
      this.db.findOne(ModmailConfig, { guildId: context.config.guildId })
    );

    if (updatedConfig) {
      const updatedCategory = updatedConfig.categories?.find(
        (cat) => cat.id === context.category.id
      );
      if (updatedCategory) {
        const updatedContext = { ...context, category: updatedCategory, config: updatedConfig };
        setTimeout(() => this.showFormManagementInterface(updatedContext), 1000);
      }
    }
  }

  /**
   * Handle editing an existing form field (simplified for now)
   * @param interaction Button interaction
   * @param context Form management context
   */
  private async handleEditField(
    interaction: ButtonInteraction,
    context: FormManagementContext
  ): Promise<void> {
    await interaction.reply({
      embeds: [
        ModmailEmbeds.error(
          context.client,
          "Feature Coming Soon",
          "Field editing will be available in the next update. For now, you can delete and recreate fields."
        ),
      ],
      ephemeral: true,
    });
  }

  /**
   * Handle deleting a form field (simplified for now)
   * @param interaction Button interaction
   * @param context Form management context
   */
  private async handleDeleteField(
    interaction: ButtonInteraction,
    context: FormManagementContext
  ): Promise<void> {
    await interaction.reply({
      embeds: [
        ModmailEmbeds.error(
          context.client,
          "Feature Coming Soon",
          "Field deletion will be available in the next update."
        ),
      ],
      ephemeral: true,
    });
  }

  /**
   * Handle closing the form management interface
   * @param interaction Button interaction
   * @param context Form management context
   */
  private async handleClose(
    interaction: ButtonInteraction,
    context: FormManagementContext
  ): Promise<void> {
    await interaction.update({
      embeds: [
        ModmailEmbeds.success(
          context.client,
          "Form Management Closed",
          `Form management for category "${context.category.name}" has been closed.`
        ),
      ],
      components: [],
    });
  }

  /**
   * Update form fields for a specific category
   * @param guildId Guild ID
   * @param categoryId Category ID
   * @param formFields Updated form fields
   */
  private async updateCategoryFormFields(
    guildId: string,
    categoryId: string,
    formFields: any[]
  ): Promise<void> {
    // Get current config
    const config = await this.db.findOne(ModmailConfig, { guildId });
    if (!config) throw new Error("Config not found");

    // Update the specific category's form fields
    const updatedCategories = config.categories?.map((cat) => {
      if (cat.id === categoryId) {
        return { ...cat, formFields };
      }
      return cat;
    });

    await this.db.findOneAndUpdate(ModmailConfig, { guildId }, { categories: updatedCategories });
  }

  /**
   * Update category in database
   * @param config Modmail config
   * @param updatedCategory Updated category
   */
  private async updateCategoryInDatabase(
    config: ModmailConfigType,
    updatedCategory: CategoryType
  ): Promise<void> {
    const updatedCategories = config.categories?.map((cat) =>
      cat.id === updatedCategory.id ? updatedCategory : cat
    );

    await this.db.findOneAndUpdate(
      ModmailConfig,
      { guildId: config.guildId },
      { categories: updatedCategories }
    );
  }

  /**
   * Get icon for field type
   * @param fieldType Field type
   * @returns Emoji icon
   */
  private getFieldTypeIcon(fieldType: FormFieldType): string {
    switch (fieldType) {
      case FormFieldType.SHORT:
        return "📝";
      case FormFieldType.PARAGRAPH:
        return "📄";
      case FormFieldType.SELECT:
        return "📋";
      case FormFieldType.NUMBER:
        return "🔢";
      default:
        return "❓";
    }
  }
}
