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
        // Get fresh context with updated data for each interaction
        const freshContext = await this.getFreshContext(context);

        if (customId.startsWith("form_add_")) {
          await this.handleAddField(buttonInteraction, freshContext);
        } else if (customId.startsWith("form_edit_")) {
          await this.handleEditField(buttonInteraction, freshContext);
        } else if (customId.startsWith("form_delete_")) {
          await this.handleDeleteField(buttonInteraction, freshContext);
        } else if (customId.startsWith("form_close_")) {
          await this.handleClose(buttonInteraction, freshContext);
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
   * Get fresh context with updated data from database
   * @param originalContext Original form management context
   * @returns Updated context with fresh data
   */
  private async getFreshContext(
    originalContext: FormManagementContext
  ): Promise<FormManagementContext> {
    try {
      const { data: updatedConfig } = await tryCatch(
        this.db.findOne(ModmailConfig, { guildId: originalContext.config.guildId })
      );

      if (updatedConfig) {
        const updatedCategory = updatedConfig.categories?.find(
          (cat) => cat.id === originalContext.category.id
        );

        if (updatedCategory) {
          return {
            ...originalContext,
            category: updatedCategory,
            config: updatedConfig,
          };
        }
      }

      // Fallback to original context if fetch fails
      return originalContext;
    } catch (error) {
      log.error("Error fetching fresh context:", error);
      return originalContext;
    }
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

    // Refresh the main interface with fresh context after addition
    setTimeout(async () => {
      const freshContext = await this.getFreshContext(context);
      await this.refreshFormInterface(freshContext);
    }, 2000);
  }

  /**
   * Handle editing an existing form field
   * @param interaction Button interaction
   * @param context Form management context
   */
  private async handleEditField(
    interaction: ButtonInteraction,
    context: FormManagementContext
  ): Promise<void> {
    const formFields = context.category.formFields || [];

    if (formFields.length === 0) {
      await interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            context.client,
            "No Fields",
            "There are no form fields to edit in this category."
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // Create select menu for choosing which field to edit
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`edit_field_select_${context.category.id}`)
      .setPlaceholder("Choose a field to edit")
      .addOptions(
        formFields.map((field, index) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${index + 1}. ${field.label}`)
            .setDescription(`Type: ${field.type} | Required: ${field.required ? "Yes" : "No"}`)
            .setValue(field.id)
        )
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({
      content: "Select the field you want to edit:",
      components: [row],
      ephemeral: true,
    });

    // Set up collector for select menu
    const filter = (i: any) =>
      i.customId === `edit_field_select_${context.category.id}` &&
      i.user.id === interaction.user.id &&
      i.isStringSelectMenu();

    try {
      const selectInteraction = (await interaction.channel?.awaitMessageComponent({
        filter,
        time: 60000,
      })) as StringSelectMenuInteraction;

      if (selectInteraction) {
        await this.showEditFieldModal(selectInteraction, context);
      }
    } catch (error) {
      log.error("Field selection timeout or error:", error);
      await interaction.followUp({
        content: "Selection timed out. Please try again.",
        ephemeral: true,
      });
    }
  }

  /**
   * Show the edit field modal with pre-filled values
   * @param interaction String select menu interaction
   * @param context Form management context
   */
  private async showEditFieldModal(
    interaction: StringSelectMenuInteraction,
    context: FormManagementContext
  ): Promise<void> {
    const fieldId = interaction.values[0];
    const field = context.category.formFields?.find((f) => f.id === fieldId);

    if (!field) {
      await interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            context.client,
            "Field Not Found",
            "The selected field could not be found."
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`edit_field_modal_${fieldId}_${context.category.id}`)
      .setTitle(`Edit Field: ${field.label}`);

    const labelInput = new TextInputBuilder()
      .setCustomId("field_label")
      .setLabel("Field Label")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100)
      .setValue(field.label)
      .setPlaceholder("e.g., What type of issue are you experiencing?");

    const typeInput = new TextInputBuilder()
      .setCustomId("field_type")
      .setLabel("Field Type")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(field.type)
      .setPlaceholder("short, paragraph, select, or number");

    const placeholderInput = new TextInputBuilder()
      .setCustomId("field_placeholder")
      .setLabel("Placeholder Text (Optional)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(100)
      .setValue(field.placeholder || "")
      .setPlaceholder("Hint text for the user");

    const optionsInput = new TextInputBuilder()
      .setCustomId("field_options")
      .setLabel("Options (For Select Fields Only)")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setValue(field.options?.join("\n") || "")
      .setPlaceholder("One option per line (only for select fields)");

    const requiredInput = new TextInputBuilder()
      .setCustomId("field_required")
      .setLabel("Required Field")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(field.required.toString())
      .setPlaceholder("true or false");

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
      i.customId === `edit_field_modal_${fieldId}_${context.category.id}` &&
      i.user.id === interaction.user.id;

    try {
      const modalInteraction = await interaction.awaitModalSubmit({
        filter: modalFilter,
        time: 300000,
      });

      await this.processEditFieldModal(modalInteraction, context, fieldId);
    } catch (error) {
      log.error("Edit modal submission timeout or error:", error);
    }
  }

  /**
   * Process the edit field modal submission
   * @param interaction Modal submit interaction
   * @param context Form management context
   * @param fieldId ID of the field being edited
   */
  private async processEditFieldModal(
    interaction: ModalSubmitInteraction,
    context: FormManagementContext,
    fieldId: string
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

    // Update the field
    const updatedField: FormFieldSchema = {
      id: fieldId,
      label,
      type: fieldType,
      required,
      placeholder,
      options,
    };

    // Update form fields array
    const currentFormFields = context.category.formFields || [];
    const updatedFormFields = currentFormFields.map((field) =>
      field.id === fieldId ? updatedField : field
    );

    const { error } = await tryCatch(
      this.updateCategoryFormFields(context.config.guildId, context.category.id, updatedFormFields)
    );

    if (error) {
      await interaction.reply({
        embeds: [
          ModmailEmbeds.error(context.client, "Database Error", "Failed to update the form field."),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        ModmailEmbeds.success(
          context.client,
          "Field Updated",
          `Successfully updated form field "${label}" in category "${context.category.name}".`
        ),
      ],
      ephemeral: true,
    });

    // Refresh the main interface with fresh context after update
    setTimeout(async () => {
      const freshContext = await this.getFreshContext(context);
      await this.refreshFormInterface(freshContext);
    }, 2000);
  }

  /**
   * Handle deleting a form field
   * @param interaction Button interaction
   * @param context Form management context
   */
  private async handleDeleteField(
    interaction: ButtonInteraction,
    context: FormManagementContext
  ): Promise<void> {
    const formFields = context.category.formFields || [];

    if (formFields.length === 0) {
      await interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            context.client,
            "No Fields",
            "There are no form fields to delete in this category."
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // Create select menu for choosing which field to delete
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`delete_field_select_${context.category.id}`)
      .setPlaceholder("Choose a field to delete")
      .addOptions(
        formFields.map((field, index) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${index + 1}. ${field.label}`)
            .setDescription(`Type: ${field.type} | Required: ${field.required ? "Yes" : "No"}`)
            .setValue(field.id)
        )
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    await interaction.reply({
      content:
        "⚠️ **WARNING:** This action cannot be undone!\n\nSelect the field you want to delete:",
      components: [row],
      ephemeral: true,
    });

    // Set up collector for select menu
    const filter = (i: any) =>
      i.customId === `delete_field_select_${context.category.id}` &&
      i.user.id === interaction.user.id &&
      i.isStringSelectMenu();

    try {
      const selectInteraction = (await interaction.channel?.awaitMessageComponent({
        filter,
        time: 60000,
      })) as StringSelectMenuInteraction;

      if (selectInteraction) {
        await this.processDeleteField(selectInteraction, context);
      }
    } catch (error) {
      log.error("Field deletion selection timeout or error:", error);
      await interaction.followUp({
        content: "Selection timed out. Please try again.",
        ephemeral: true,
      });
    }
  }

  /**
   * Process the deletion of a selected field
   * @param interaction String select menu interaction
   * @param context Form management context
   */
  private async processDeleteField(
    interaction: StringSelectMenuInteraction,
    context: FormManagementContext
  ): Promise<void> {
    const fieldId = interaction.values[0];
    const field = context.category.formFields?.find((f) => f.id === fieldId);

    if (!field) {
      await interaction.reply({
        embeds: [
          ModmailEmbeds.error(
            context.client,
            "Field Not Found",
            "The selected field could not be found."
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm_delete_${fieldId}`)
      .setLabel("Yes, Delete")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️");

    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel_delete_${fieldId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("⚠️ Confirm Deletion")
          .setDescription(
            `Are you sure you want to delete the following field?\n\n` +
              `**Label:** ${field.label}\n` +
              `**Type:** ${field.type}\n` +
              `**Required:** ${field.required ? "Yes" : "No"}\n\n` +
              `**This action cannot be undone!**`
          )
          .setColor(0xff6b6b),
      ],
      components: [row],
      ephemeral: true,
    });

    // Set up collector for confirmation buttons
    const buttonFilter = (i: any) =>
      (i.customId === `confirm_delete_${fieldId}` || i.customId === `cancel_delete_${fieldId}`) &&
      i.user.id === interaction.user.id;

    try {
      const buttonInteraction = (await interaction.channel?.awaitMessageComponent({
        filter: buttonFilter,
        time: 30000,
      })) as ButtonInteraction;

      if (buttonInteraction.customId === `confirm_delete_${fieldId}`) {
        // Proceed with deletion
        const currentFormFields = context.category.formFields || [];
        const updatedFormFields = currentFormFields.filter((f) => f.id !== fieldId);

        console.log("BEFORE DELETION:", {
          categoryId: context.category.id,
          originalFieldCount: currentFormFields.length,
          updatedFieldCount: updatedFormFields.length,
          fieldId: fieldId,
        });

        const { error } = await tryCatch(
          this.updateCategoryFormFields(
            context.config.guildId,
            context.category.id,
            updatedFormFields
          )
        );

        if (error) {
          console.error("ERROR DURING DELETION:", error);
          await buttonInteraction.reply({
            embeds: [
              ModmailEmbeds.error(
                context.client,
                "Database Error",
                "Failed to delete the form field."
              ),
            ],
            ephemeral: true,
          });
          return;
        }

        console.log("DELETION COMPLETED - NO ERROR");

        await buttonInteraction.reply({
          embeds: [
            ModmailEmbeds.success(
              context.client,
              "Field Deleted",
              `Successfully deleted form field "${field.label}" from category "${context.category.name}".`
            ),
          ],
          ephemeral: true,
        });

        // Refresh the main interface with fresh context after deletion
        setTimeout(async () => {
          const freshContext = await this.getFreshContext(context);
          await this.refreshFormInterface(freshContext);
        }, 2000);
      } else {
        // Cancelled
        await buttonInteraction.reply({
          content: "❌ Deletion cancelled.",
          ephemeral: true,
        });
      }
    } catch (error) {
      log.error("Deletion confirmation timeout or error:", error);
      await interaction.followUp({
        content: "Confirmation timed out. Deletion cancelled.",
        ephemeral: true,
      });
    }
  }

  /**
   * Refresh the form management interface with updated data
   * @param context Form management context
   */
  private async refreshFormInterface(context: FormManagementContext): Promise<void> {
    try {
      log.debug("[Form Management] Starting refresh for category", context.category.id);

      // Fetch updated config from database
      const { data: updatedConfig } = await tryCatch(
        this.db.findOne(ModmailConfig, { guildId: context.config.guildId })
      );

      if (updatedConfig) {
        const updatedCategory = updatedConfig.categories?.find(
          (cat) => cat.id === context.category.id
        );
        if (updatedCategory) {
          log.debug(
            "[Form Management] Found updated category with",
            updatedCategory.formFields?.length || 0,
            "fields"
          );
          // Update the original interaction message with fresh data
          await this.updateOriginalMessage(context, updatedCategory, updatedConfig);
        } else {
          log.error("[Form Management] Updated category not found");
        }
      } else {
        log.error("[Form Management] Updated config not found");
      }
    } catch (error) {
      log.error("Error refreshing form interface:", error);
    }
  }

  /**
   * Update the original form management message
   * @param context Original form management context
   * @param updatedCategory Updated category data
   * @param updatedConfig Updated config data
   */
  private async updateOriginalMessage(
    context: FormManagementContext,
    updatedCategory: CategoryType,
    updatedConfig: ModmailConfigType
  ): Promise<void> {
    const formFields = updatedCategory.formFields || [];
    const canAddMore = formFields.length < 5; // Discord modal limit

    const embed = new EmbedBuilder()
      .setTitle(`📝 Form Management: ${updatedCategory.name}`)
      .setDescription(
        `Manage form fields for this category. Users will fill out these fields when creating tickets.\n\n` +
          `**Current Fields:** ${formFields.length}/5\n` +
          `**Category:** ${updatedCategory.name} ${updatedCategory.emoji || ""}`
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
          .setCustomId(`form_add_${updatedCategory.id}`)
          .setLabel("Add Field")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("➕")
      );
    }

    if (formFields.length > 0) {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`form_edit_${updatedCategory.id}`)
          .setLabel("Edit Field")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("✏️"),
        new ButtonBuilder()
          .setCustomId(`form_delete_${updatedCategory.id}`)
          .setLabel("Remove Field")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🗑️")
      );
    }

    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(`form_close_${updatedCategory.id}`)
        .setLabel("Close")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌")
        .setDisabled(false)
    );

    const components = [buttons];

    // Update the original message
    try {
      await context.interaction.editReply({
        content: "",
        embeds: [embed],
        components,
      });
    } catch (error) {
      log.error("Error updating original message:", error);
      // If edit fails, try to follow up with a new message
      try {
        await context.interaction.followUp({
          content: "🔄 **Form management interface updated:**",
          embeds: [embed],
          components,
          ephemeral: true,
        });
      } catch (followUpError) {
        log.error("Error sending follow-up message:", followUpError);
      }
    }
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
    console.log("updateCategoryFormFields called with:", {
      guildId,
      categoryId,
      fieldCount: formFields.length,
      fields: formFields.map((f) => ({ id: f.id, label: f.label })),
    });

    log.debug(
      "[Form Management] Updating category",
      categoryId,
      "with",
      formFields.length,
      "fields"
    );

    // Get current config
    const config = await this.db.findOne(ModmailConfig, { guildId });
    if (!config) {
      console.error("Config not found for guildId:", guildId);
      throw new Error("Config not found");
    }

    console.log("Found config with categories count:", config.categories?.length);

    // Find the category index
    const categoryIndex = config.categories?.findIndex((cat) => cat.id === categoryId);
    if (categoryIndex === -1 || categoryIndex === undefined) {
      console.error("Category not found:", categoryId);
      throw new Error("Category not found");
    }

    console.log("Found category at index:", categoryIndex);

    // Use MongoDB dot notation to update the specific array element
    const updatePath = `categories.${categoryIndex}.formFields`;
    const updateQuery = { [updatePath]: formFields };

    console.log("Update query:", { updatePath, fieldCount: formFields.length });

    const result = await this.db.findOneAndUpdate(
      ModmailConfig,
      { guildId },
      updateQuery,
      { new: true, upsert: false } // Get the updated document back
    );

    console.log("findOneAndUpdate completed, result exists:", !!result);
    log.debug("[Form Management] Database update completed");

    // Verify the update with a fresh query
    const verifyConfig = await this.db.findOne(ModmailConfig, { guildId });
    const verifyCategory = verifyConfig?.categories?.find((cat) => cat.id === categoryId);

    console.log("Verification results:", {
      configExists: !!verifyConfig,
      categoryExists: !!verifyCategory,
      finalFieldCount: verifyCategory?.formFields?.length || 0,
      updatedResultFieldCount: result?.categories?.[categoryIndex]?.formFields?.length || 0,
    });

    log.debug(
      "[Form Management] Verification: category now has",
      verifyCategory?.formFields?.length || 0,
      "fields"
    );

    // Double-check by logging the actual field IDs
    console.log("Final field IDs:", verifyCategory?.formFields?.map((f) => f.id) || []);
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
