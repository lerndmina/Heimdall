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
  BaseInteraction
} from 'discord.js';
import { CategoryManager } from './CategoryManager';
import { FormBuilder } from '../FormBuilder';
import { FormResponseProcessor } from '../FormResponseProcessor';
import { CategoryType, FormFieldSchema, TicketPriority } from '../../models/ModmailConfig';
import { ModmailEmbeds } from './ModmailEmbeds';
import log from '../log';
import { tryCatch } from '../trycatch';

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
  public async startCategorySelection(context: CategorySelectionContext): Promise<FormCollectionResult> {
    try {
      // Get available categories for the guild
      const categories = await this.categoryManager.getAvailableCategories(context.guild.id);
      
      if (categories.length === 0) {
        // No categories configured, proceed with default flow
        return {
          success: true,
          categoryId: undefined,
          formResponses: {}
        };
      }

      // Create category selection menu
      const categorySelectResult = await this.showCategorySelection(context, categories);
      if (!categorySelectResult.success) {
        return categorySelectResult;
      }

      const selectedCategory = categories.find(cat => cat.id === categorySelectResult.categoryId);
      if (!selectedCategory) {
        return {
          success: false,
          error: 'Selected category not found'
        };
      }

      // Check if category has form fields
      if (!selectedCategory.formFields || selectedCategory.formFields.length === 0) {
        // No form required, proceed with just category selection
        return {
          success: true,
          categoryId: selectedCategory.id,
          formResponses: {}
        };
      }

      // For now, skip form collection and just proceed with category selection
      // TODO: Implement proper form collection flow in Phase 3.1
      log.info(`Category ${selectedCategory.name} has ${selectedCategory.formFields.length} form fields - form collection not yet implemented`);
      
      return {
        success: true,
        categoryId: selectedCategory.id,
        formResponses: {} // Empty for now
      };

    } catch (error) {
      log.error('Error in category selection flow:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
        .setPlaceholder('Select a category for your ticket')
        .setMinValues(1)
        .setMaxValues(1);

      // Add category options
      for (const category of categories) {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(category.name)
          .setValue(category.id)
          .setDescription(category.description || 'No description available');

        if (category.emoji) {
          option.setEmoji(category.emoji);
        }

        selectMenu.addOptions(option);
      }

      // Add cancel option
      selectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Cancel')
          .setValue('cancel')
          .setDescription('Cancel ticket creation')
          .setEmoji('❌')
      );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setTitle('📋 Select Ticket Category')
        .setDescription('Please choose the category that best describes your issue:')
        .setColor(0x0099ff)
        .setTimestamp();

      // Add category descriptions to embed
      if (categories.length <= 5) {
        for (const category of categories) {
          embed.addFields([{
            name: `${category.emoji || '📁'} ${category.name}`,
            value: category.description || 'No description',
            inline: true
          }]);
        }
      }

      await context.reply.edit({
        embeds: [embed],
        components: [row]
      });

      // Wait for user selection
      const filter: CollectorFilter<[StringSelectMenuInteraction]> = (interaction) => {
        return interaction.customId === selectMenuId && interaction.user.id === context.user.id;
      };

      const collector = context.reply.createMessageComponentCollector({
        filter,
        componentType: ComponentType.StringSelect,
        time: 300000, // 5 minutes
        max: 1
      });

      return new Promise((resolve) => {
        collector.on('collect', async (interaction) => {
          const selectedValue = interaction.values[0];
          
          if (selectedValue === 'cancel') {
            await interaction.update({
              embeds: [ModmailEmbeds.cancelled(context.client)],
              components: []
            });
            resolve({ success: false, error: 'Cancelled by user' });
            return;
          }

          await interaction.update({
            content: '⏳ Processing...',
            embeds: [],
            components: []
          });

          resolve({ success: true, categoryId: selectedValue });
        });

        collector.on('end', (collected) => {
          if (collected.size === 0) {
            resolve({ success: false, error: 'Selection timed out' });
          }
        });
      });

    } catch (error) {
      log.error('Error showing category selection:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
      const formFields = category.formFields as FormFieldSchema[];
      const formBuilder = new FormBuilder(formFields);
      const responseProcessor = new FormResponseProcessor(formFields, context.user.id, category.id);

      // Check if form has any modal fields (text inputs)
      if (formBuilder.hasModalFields()) {
        const modalResult = await this.collectModalResponses(context, formBuilder, responseProcessor, category);
        if (!modalResult.success) {
          return modalResult;
        }
      }

      // Check if form has any select menu fields
      if (formBuilder.hasSelectFields()) {
        const selectResult = await this.collectSelectMenuResponses(context, formBuilder, responseProcessor);
        if (!selectResult.success) {
          return selectResult;
        }
      }

      // Validate that all required fields are completed
      if (!responseProcessor.isFormComplete()) {
        const missingFields = responseProcessor.getMissingRequiredFields();
        return {
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`
        };
      }

      // Get final form submission
      const submission = responseProcessor.getFormSubmission();
      
      return {
        success: true,
        formResponses: submission.responses.reduce((acc, response) => {
          acc[response.fieldId] = response.value;
          return acc;
        }, {} as Record<string, any>)
      };

    } catch (error) {
      log.error('Error collecting form responses:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Collect modal responses (text inputs)
   * @param context Category selection context
   * @param formBuilder Form builder instance
   * @param responseProcessor Response processor instance
   * @param category Selected category
   * @returns Promise with collection result
   */
  private async collectModalResponses(
    context: CategorySelectionContext,
    formBuilder: FormBuilder,
    responseProcessor: FormResponseProcessor,
    category: CategoryType
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const modals = formBuilder.createModals('ticket-form', `${category.name} Information`);
      
      // For now, only handle single modal (most common case)
      // TODO: Implement multi-modal flow for forms with >5 fields
      const modal = modals[0];
      
      // This would need to be shown to the user via interaction
      // For the current implementation, we'll need to modify the flow to handle modals
      // This is a placeholder that would need integration with the interaction system
      
      return { success: true };

    } catch (error) {
      log.error('Error collecting modal responses:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Collect select menu responses
   * @param context Category selection context
   * @param formBuilder Form builder instance
   * @param responseProcessor Response processor instance
   * @returns Promise with collection result
   */
  private async collectSelectMenuResponses(
    context: CategorySelectionContext,
    formBuilder: FormBuilder,
    responseProcessor: FormResponseProcessor
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const selectFields = formBuilder.getSelectFields();
      
      // For simplicity, handle one select field at a time
      // TODO: Implement multi-select field flow
      
      return { success: true };

    } catch (error) {
      log.error('Error collecting select menu responses:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
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
            error: 'Selected category not found'
          };
        }
      } else {
        // Use default forum channel from guild config
        // This would need to be fetched from the modmail config
        return {
          success: false,
          error: 'No category selected and no default forum channel configured'
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
      log.error('Error creating enhanced modmail thread:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
