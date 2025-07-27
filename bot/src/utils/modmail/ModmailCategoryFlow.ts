import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  Client,
  Guild,
  User,
  StringSelectMenuInteraction,
  InteractionResponse,
  Message,
  ModalBuilder,
  ModalSubmitInteraction,
  CollectorFilter,
  ComponentType,
  BaseInteraction,
} from "discord.js";
import { CategoryManager } from "./CategoryManager";
import { FormBuilder } from "../FormBuilder";
import { FormResponseProcessor } from "../FormResponseProcessor";
import { FormProgressTracker } from "./FormProgressTracker";
import {
  CategoryType,
  FormFieldSchema,
  FormFieldType,
  TicketPriority,
} from "../../models/ModmailConfig";
import { ModmailEmbeds } from "./ModmailEmbeds";
import log from "../log";
import { tryCatch } from "../trycatch";

/**
 * Interface for category selection context
 */
export interface CategorySelectionContext {
  client: Client;
  user: User;
  guild: Guild;
  originalMessage: Message;
  initialMessage: string;
  reply: InteractionResponse;
}

/**
 * Interface for form collection result
 */
export interface FormCollectionResult {
  success: boolean;
  categoryId?: string;
  formResponses?: Record<string, any>;
  metadata?: Record<string, { label: string; type: string }>;
  error?: string;
}

/**
 * Utility class for handling modmail category selection and form collection
 */
export class ModmailCategoryFlow {
  private categoryManager: CategoryManager;

  constructor() {
    this.categoryManager = new CategoryManager();
  }

  /**
   * Start the category selection flow
   * @param context Category selection context
   * @returns Promise with category and form data or error
   */
  public async startCategorySelection(
    context: CategorySelectionContext
  ): Promise<FormCollectionResult> {
    try {
      // Get available categories for the guild
      const categories = await this.categoryManager.getAvailableCategories(context.guild.id);

      if (categories.length === 0) {
        // No categories configured, check for default category
        const defaultCategory = await this.categoryManager.getDefaultCategory(context.guild.id);
        if (defaultCategory) {
          // Use default category
          return {
            success: true,
            categoryId: defaultCategory.id,
            formResponses: {},
          };
        }

        // No categories or default category configured, proceed with basic flow
        return {
          success: true,
          categoryId: undefined,
          formResponses: {},
        };
      }

      // Create category selection menu
      log.info(`[Form Debug] Starting category selection with ${categories.length} categories`);

      const categorySelectResult = await this.showCategorySelection(context, categories);

      log.info(`[Form Debug] Category selection result:`, categorySelectResult);

      if (!categorySelectResult.success) {
        return categorySelectResult;
      }

      const selectedCategory = categories.find((cat) => cat.id === categorySelectResult.categoryId);
      log.info(
        `[Form Debug] Found selected category:`,
        selectedCategory ? selectedCategory.name : "NOT FOUND"
      );

      if (!selectedCategory) {
        return {
          success: false,
          error: "Selected category not found",
        };
      }

      // Check if category has form fields
      log.info(
        `[Form Debug] Category "${selectedCategory.name}" has ${
          selectedCategory.formFields?.length || 0
        } form fields`
      );

      if (!selectedCategory.formFields || selectedCategory.formFields.length === 0) {
        log.info(`[Form Debug] No form fields required for category "${selectedCategory.name}"`);
        // No form required, proceed with just category selection
        return {
          success: true,
          categoryId: selectedCategory.id,
          formResponses: {},
        };
      }

      log.info(`[Form Debug] Starting form collection for category "${selectedCategory.name}"`);

      // Collect form responses if required
      const formResult = await this.collectFormResponses(context, selectedCategory);

      log.info(`[Form Debug] Form collection result:`, formResult);

      if (!formResult.success) {
        return formResult;
      }

      return {
        success: true,
        categoryId: selectedCategory.id,
        formResponses: formResult.formResponses || {},
        metadata: formResult.metadata || {},
      };
    } catch (error) {
      log.error("Error in category selection flow:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Show category selection menu to user
   * @param context Category selection context
   * @param categories Available categories
   * @returns Promise with selected category ID
   */
  private async showCategorySelection(
    context: CategorySelectionContext,
    categories: CategoryType[]
  ): Promise<{ success: boolean; categoryId?: string; error?: string }> {
    try {
      const selectMenuId = `category-select-${context.user.id}-${Date.now()}`;

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(selectMenuId)
        .setPlaceholder("Select a category for your ticket")
        .setMinValues(1)
        .setMaxValues(1);

      // Add category options
      for (const category of categories) {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(category.name)
          .setValue(category.id)
          .setDescription(category.description || "No description available");

        if (category.emoji) {
          option.setEmoji(category.emoji);
        }

        selectMenu.addOptions(option);
      }

      // Add cancel option
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Cancel")
          .setValue("cancel")
          .setDescription("Cancel ticket creation")
          .setEmoji("❌")
      );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setTitle("📋 Select Ticket Category")
        .setDescription("Please choose the category that best describes your issue:")
        .setColor(0x0099ff)
        .setTimestamp();

      // Add category descriptions to embed
      if (categories.length <= 5) {
        for (const category of categories) {
          embed.addFields([
            {
              name: `${category.emoji || "📁"} ${category.name}`,
              value: category.description || "No description",
              inline: true,
            },
          ]);
        }
      }

      await context.reply.edit({
        embeds: [embed],
        components: [row],
      });

      // Wait for user selection
      const filter: CollectorFilter<[StringSelectMenuInteraction]> = (interaction) => {
        return interaction.customId === selectMenuId && interaction.user.id === context.user.id;
      };

      const collector = context.reply.createMessageComponentCollector({
        filter,
        componentType: ComponentType.StringSelect,
        time: 300000, // 5 minutes
        max: 1,
      });

      return new Promise((resolve) => {
        collector.on("collect", async (interaction) => {
          const selectedValue = interaction.values[0];

          log.debug("Category selected:", { selectedValue, userId: interaction.user.id });

          if (selectedValue === "cancel") {
            log.debug("User cancelled category selection");
            await interaction.update({
              embeds: [ModmailEmbeds.cancelled(context.client)],
              components: [],
            });
            resolve({ success: false, error: "Cancelled by user" });
            return;
          }

          log.debug("Updating interaction with processing message");
          await interaction.update({
            content: "⏳ Processing...",
            embeds: [],
            components: [],
          });

          log.debug("Interaction updated, resolving with category ID:", selectedValue);
          resolve({ success: true, categoryId: selectedValue });
        });

        collector.on("end", (collected) => {
          if (collected.size === 0) {
            resolve({ success: false, error: "Selection timed out" });
          }
        });
      });
    } catch (error) {
      log.error("Error showing category selection:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Collect form responses from user
   * @param context Category selection context
   * @param category Selected category with form fields
   * @returns Promise with form responses
   */
  private async collectFormResponses(
    context: CategorySelectionContext,
    category: CategoryType
  ): Promise<FormCollectionResult> {
    try {
      log.info(`[Form Debug] Starting collectFormResponses for category: ${category.name}`);

      const formFields = category.formFields as FormFieldSchema[];
      log.info(`[Form Debug] Form fields:`, formFields);

      const formBuilder = new FormBuilder(formFields);
      const responseProcessor = new FormResponseProcessor(formFields, context.user.id, category.id);
      const progressTracker = new FormProgressTracker(formFields);

      log.info(`[Form Debug] Has modal fields: ${formBuilder.hasModalFields()}`);
      log.info(`[Form Debug] Has select fields: ${formBuilder.hasSelectFields()}`);

      // Show initial progress
      await this.showFormProgress(context, progressTracker, category.name);

      // Process fields in their original order by type groups but maintaining order within types
      const modalFields = formFields.filter(
        (field) => field.type === FormFieldType.SHORT || field.type === FormFieldType.PARAGRAPH
      );
      const selectFields = formFields.filter((field) => field.type === FormFieldType.SELECT);

      // Determine which type comes first in the original order
      const firstModalIndex = formFields.findIndex(
        (field) => field.type === FormFieldType.SHORT || field.type === FormFieldType.PARAGRAPH
      );
      const firstSelectIndex = formFields.findIndex((field) => field.type === FormFieldType.SELECT);

      const shouldProcessModalsFirst =
        firstModalIndex !== -1 && (firstSelectIndex === -1 || firstModalIndex < firstSelectIndex);

      if (shouldProcessModalsFirst) {
        // Process modal fields first if they appear first in the order
        if (modalFields.length > 0) {
          log.info(`[Form Debug] Collecting modal responses (first in order)`);
          const modalResult = await this.collectModalResponses(
            context,
            new FormBuilder(modalFields),
            responseProcessor,
            category,
            progressTracker
          );
          if (!modalResult.success) {
            log.error(`[Form Debug] Modal collection failed:`, modalResult);
            return modalResult;
          }
        }

        // Then process select fields
        if (selectFields.length > 0) {
          log.info(`[Form Debug] Collecting select menu responses (second in order)`);
          const selectResult = await this.collectSelectMenuResponses(
            context,
            new FormBuilder(selectFields),
            responseProcessor,
            progressTracker
          );
          if (!selectResult.success) {
            log.error(`[Form Debug] Select menu collection failed:`, selectResult);
            return selectResult;
          }
        }
      } else {
        // Process select fields first if they appear first in the order
        if (selectFields.length > 0) {
          log.info(`[Form Debug] Collecting select menu responses (first in order)`);
          const selectResult = await this.collectSelectMenuResponses(
            context,
            new FormBuilder(selectFields),
            responseProcessor,
            progressTracker
          );
          if (!selectResult.success) {
            log.error(`[Form Debug] Select menu collection failed:`, selectResult);
            return selectResult;
          }
        }

        // Then process modal fields
        if (modalFields.length > 0) {
          log.info(`[Form Debug] Collecting modal responses (second in order)`);
          const modalResult = await this.collectModalResponses(
            context,
            new FormBuilder(modalFields),
            responseProcessor,
            category,
            progressTracker
          );
          if (!modalResult.success) {
            log.error(`[Form Debug] Modal collection failed:`, modalResult);
            return modalResult;
          }
        }
      }

      // Show final progress
      await this.showFormProgress(context, progressTracker, category.name);

      // Validate that all required fields are completed
      if (!responseProcessor.isFormComplete()) {
        const missingFields = responseProcessor.getMissingRequiredFields();
        return {
          success: false,
          error: `Missing required fields: ${missingFields.join(", ")}`,
        };
      }

      // Get final form submission
      const submission = responseProcessor.getFormSubmission();

      // Create a more detailed form responses object with field labels
      const formResponsesWithLabels: Record<string, any> = {};
      const formResponsesMetadata: Record<string, { label: string; type: string }> = {};

      submission.responses.forEach((response) => {
        formResponsesWithLabels[response.fieldId] = response.value;
        formResponsesMetadata[response.fieldId] = {
          label: response.fieldLabel,
          type: response.fieldType,
        };
      });

      return {
        success: true,
        formResponses: formResponsesWithLabels,
        metadata: formResponsesMetadata,
      };
    } catch (error) {
      log.error("Error collecting form responses:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Collect modal responses (text inputs)
   * @param context Category selection context
   * @param formBuilder Form builder instance
   * @param responseProcessor Response processor instance
   * @param category Selected category
   * @param progressTracker Progress tracker instance
   * @returns Promise with collection result
   */
  private async collectModalResponses(
    context: CategorySelectionContext,
    formBuilder: FormBuilder,
    responseProcessor: FormResponseProcessor,
    category: CategoryType,
    progressTracker: FormProgressTracker
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const modals = formBuilder.createModals("ticket-form", `${category.name} Information`);

      // Handle modals sequentially (most forms will have only 1 modal)
      for (let i = 0; i < modals.length; i++) {
        const modal = modals[i];
        const modalId = `${modal.data.custom_id}-${context.user.id}-${Date.now()}`;

        // Update modal ID to be unique
        modal.setCustomId(modalId);

        // Show the modal
        // Note: This requires an interaction that can show modals
        // For now, we'll create a button that triggers the modal
        const modalResult = await this.showModalForm(context, modal, modalId);
        if (!modalResult.success) {
          return modalResult;
        }

        // Process modal responses
        responseProcessor.processModalSubmission(modalResult.interaction as ModalSubmitInteraction);
      }

      return { success: true };
    } catch (error) {
      log.error("Error collecting modal responses:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Collect select menu responses
   * @param context Category selection context
   * @param formBuilder Form builder instance
   * @param responseProcessor Response processor instance
   * @param progressTracker Progress tracker instance
   * @returns Promise with collection result
   */
  private async collectSelectMenuResponses(
    context: CategorySelectionContext,
    formBuilder: FormBuilder,
    responseProcessor: FormResponseProcessor,
    progressTracker: FormProgressTracker
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const selectFields = formBuilder.getSelectFields();

      // Handle select fields sequentially
      for (const field of selectFields) {
        const selectResult = await this.showSelectMenuForm(context, field, responseProcessor);
        if (!selectResult.success) {
          return selectResult;
        }
      }

      return { success: true };
    } catch (error) {
      log.error("Error collecting select menu responses:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Show a modal form to the user
   * @param context Category selection context
   * @param modal Modal to show
   * @param modalId Unique modal ID
   * @returns Promise with modal result
   */
  private async showModalForm(
    context: CategorySelectionContext,
    modal: ModalBuilder,
    modalId: string
  ): Promise<{ success: boolean; interaction?: ModalSubmitInteraction; error?: string }> {
    try {
      // Create a button to trigger the modal
      const buttonId = `show-form-${context.user.id}-${Date.now()}`;

      const button = new ActionRowBuilder<any>().addComponents(
        new (await import("discord.js")).ButtonBuilder()
          .setCustomId(buttonId)
          .setLabel("Continue with Form")
          .setStyle((await import("discord.js")).ButtonStyle.Primary)
          .setEmoji("📝")
      );

      const embed = new EmbedBuilder()
        .setTitle("📝 Additional Information Required")
        .setDescription("Please click the button below to fill out the required form fields.")
        .setColor(0x0099ff)
        .setTimestamp();

      await context.reply.edit({
        embeds: [embed],
        components: [button],
      });

      // Wait for button click
      const filter = (interaction: BaseInteraction) => {
        return (
          interaction.isButton() &&
          interaction.customId === buttonId &&
          interaction.user.id === context.user.id
        );
      };

      const buttonCollector = context.reply.createMessageComponentCollector({
        filter,
        componentType: ComponentType.Button,
        time: 300000, // 5 minutes
        max: 1,
      });

      return new Promise((resolve) => {
        buttonCollector.on("collect", async (buttonInteraction) => {
          try {
            // Show the modal
            await buttonInteraction.showModal(modal);

            // Wait for modal submission
            const modalFilter = (modalInteraction: ModalSubmitInteraction) => {
              return (
                modalInteraction.customId === modalId &&
                modalInteraction.user.id === context.user.id
              );
            };

            const modalSubmission = await buttonInteraction.awaitModalSubmit({
              filter: modalFilter,
              time: 600000, // 10 minutes for form completion
            });

            await modalSubmission.reply({
              content: "✅ Form submitted successfully!",
              ephemeral: true,
            });

            resolve({ success: true, interaction: modalSubmission });
          } catch (error) {
            log.error("Error handling modal submission:", error);
            resolve({
              success: false,
              error: error instanceof Error ? error.message : "Modal submission failed",
            });
          }
        });

        buttonCollector.on("end", (collected) => {
          if (collected.size === 0) {
            resolve({ success: false, error: "Form button interaction timed out" });
          }
        });
      });
    } catch (error) {
      log.error("Error showing modal form:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Show a select menu form to the user
   * @param context Category selection context
   * @param field Select field schema
   * @param responseProcessor Response processor instance
   * @returns Promise with select result
   */
  private async showSelectMenuForm(
    context: CategorySelectionContext,
    field: FormFieldSchema,
    responseProcessor: FormResponseProcessor
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const selectMenuId = `form-select-${field.id}-${context.user.id}-${Date.now()}`;

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(selectMenuId)
        .setPlaceholder(`Select ${field.label}`)
        .setMinValues(field.required ? 1 : 0)
        .setMaxValues(1);

      // Add options from field schema
      if (field.options) {
        for (const option of field.options) {
          selectMenu.addOptions(
            new StringSelectMenuOptionBuilder().setLabel(option).setValue(option)
          );
        }
      }

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setTitle(`📋 ${field.label}`)
        .setDescription(`Please select an option for ${field.label}`)
        .setColor(0x0099ff)
        .setTimestamp();

      await context.reply.edit({
        embeds: [embed],
        components: [row],
      });

      // Wait for selection
      const filter = (interaction: StringSelectMenuInteraction) => {
        return interaction.customId === selectMenuId && interaction.user.id === context.user.id;
      };

      const collector = context.reply.createMessageComponentCollector({
        filter,
        componentType: ComponentType.StringSelect,
        time: 300000, // 5 minutes
        max: 1,
      });

      return new Promise((resolve) => {
        collector.on("collect", async (interaction) => {
          const selectedValue = interaction.values[0];

          // Add response directly to the processor's internal state
          // Since processSelectResponse doesn't exist, we'll create a mock interaction
          const mockInteraction = {
            values: [selectedValue],
            customId: selectMenuId,
            user: context.user,
          } as any;

          // Process the response using processSelectMenuInteraction
          await responseProcessor.processSelectMenuInteraction(mockInteraction, field.id);

          await interaction.update({
            content: `✅ Selected: ${selectedValue}`,
            embeds: [],
            components: [],
          });

          resolve({ success: true });
        });

        collector.on("end", (collected) => {
          if (collected.size === 0) {
            resolve({ success: false, error: "Select menu interaction timed out" });
          }
        });
      });
    } catch (error) {
      log.error("Error showing select menu form:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create an enhanced modmail thread with category and form data
   * @param context Category selection context
   * @param categoryId Selected category ID
   * @param formResponses Collected form responses
   * @returns Promise with thread creation result
   */
  public async createEnhancedModmailThread(
    context: CategorySelectionContext,
    categoryId: string | undefined,
    formResponses: Record<string, any>
  ): Promise<{ success: boolean; thread?: any; error?: string }> {
    try {
      // Get category information if provided
      let category: CategoryType | null = null;
      let forumChannelId: string;
      let priority: TicketPriority = TicketPriority.MEDIUM;

      if (categoryId) {
        category = await this.categoryManager.getCategoryById(context.guild.id, categoryId);
        if (category) {
          forumChannelId = category.forumChannelId;
          priority = category.priority as TicketPriority;
        } else {
          return {
            success: false,
            error: "Selected category not found",
          };
        }
      } else {
        // Use default forum channel from guild config
        // This would need to be fetched from the modmail config
        return {
          success: false,
          error: "No category selected and no default forum channel configured",
        };
      }

      // Generate ticket number
      const ticketNumber = await this.categoryManager.getNextTicketNumber(context.guild.id);

      // This is where we would call the enhanced createModmailThread function
      // with category and form data

      return {
        success: true,
        // thread: result.thread
      };
    } catch (error) {
      log.error("Error creating enhanced modmail thread:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Show form progress to the user
   * @param context Category selection context
   * @param progressTracker Progress tracker instance
   * @param categoryName Category name
   */
  private async showFormProgress(
    context: CategorySelectionContext,
    progressTracker: FormProgressTracker,
    categoryName: string
  ): Promise<void> {
    try {
      const progressEmbed = progressTracker.createProgressEmbed(
        context.client,
        context.user,
        categoryName
      );

      await context.reply.edit({
        embeds: [progressEmbed],
        components: [],
      });
    } catch (error) {
      log.error("Error showing form progress:", error);
      // Don't throw, just log - progress display is not critical
    }
  }
}
