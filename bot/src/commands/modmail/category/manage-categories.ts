import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  ButtonInteraction,
} from "discord.js";
import { SlashCommandProps, CommandOptions } from "commandkit";
import { ModmailEmbeds } from "../../../utils/modmail/ModmailEmbeds";
import { CategoryManager } from "../../../utils/modmail/CategoryManager";
import { FormBuilder } from "../../../utils/FormBuilder";
import {
  FormFieldSchema,
  FormFieldType,
  CategoryType,
  TicketPriority,
} from "../../../models/ModmailConfig";
import { ThingGetter } from "../../../utils/TinyUtils";
import log from "../../../utils/log";
import { tryCatch } from "../../../utils/trycatch";

export const data = new SlashCommandBuilder()
  .setName("category")
  .setDescription("Manage modmail categories and forms")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand.setName("create").setDescription("Create a new modmail category")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("edit")
      .setDescription("Edit an existing modmail category")
      .addStringOption((option) =>
        option
          .setName("category")
          .setDescription("The category to edit")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Delete a modmail category")
      .addStringOption((option) =>
        option
          .setName("category")
          .setDescription("The category to delete")
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("List all modmail categories")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("test-form")
      .setDescription("Test a category's form")
      .addStringOption((option) =>
        option
          .setName("category")
          .setDescription("The category to test")
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

export const options: CommandOptions = {
  devOnly: false,
  userPermissions: ["ManageGuild"],
  botPermissions: ["SendMessages", "EmbedLinks"],
};

export async function run({ interaction, client }: SlashCommandProps) {
  const subcommand = interaction.options.getSubcommand();
  const categoryManager = new CategoryManager();

  switch (subcommand) {
    case "create":
      await handleCreateCategory(interaction, client, categoryManager);
      break;
    case "edit":
      await handleEditCategory(interaction, client, categoryManager);
      break;
    case "delete":
      await handleDeleteCategory(interaction, client, categoryManager);
      break;
    case "list":
      await handleListCategories(interaction, client, categoryManager);
      break;
    case "test-form":
      await handleTestForm(interaction, client, categoryManager);
      break;
    default:
      await interaction.reply({
        embeds: [
          ModmailEmbeds.error(client, "Invalid Subcommand", "Unknown subcommand specified."),
        ],
        ephemeral: true,
      });
  }
}

export async function autocomplete({ interaction }: { interaction: any }) {
  const subcommand = interaction.options.getSubcommand();
  const focusedOption = interaction.options.getFocused(true);

  if (focusedOption.name === "category") {
    const categoryManager = new CategoryManager();
    const categories = await categoryManager.getAvailableCategories(interaction.guild.id);

    const filtered = categories
      .filter((cat) => cat.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
      .slice(0, 25)
      .map((cat) => ({
        name: cat.name,
        value: cat.id,
      }));

    await interaction.respond(filtered);
  }
}

/**
 * Handle creating a new category
 */
async function handleCreateCategory(
  interaction: ChatInputCommandInteraction,
  client: any,
  categoryManager: CategoryManager
) {
  const modalId = `category-create-${interaction.user.id}-${Date.now()}`;

  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Create Modmail Category");

  const nameInput = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Category Name")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g., Technical Support")
    .setRequired(true)
    .setMaxLength(50);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Category Description")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Describe what this category is for...")
    .setRequired(false)
    .setMaxLength(200);

  const emojiInput = new TextInputBuilder()
    .setCustomId("emoji")
    .setLabel("Category Emoji (optional)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("🔧")
    .setRequired(false)
    .setMaxLength(4);

  const priorityInput = new TextInputBuilder()
    .setCustomId("priority")
    .setLabel("Priority (1-4: Low, Medium, High, Urgent)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("2")
    .setRequired(false)
    .setValue("2");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(emojiInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(priorityInput)
  );

  await interaction.showModal(modal);

  try {
    const modalSubmission = await interaction.awaitModalSubmit({
      filter: (i) => i.customId === modalId && i.user.id === interaction.user.id,
      time: 300000, // 5 minutes
    });

    const name = modalSubmission.fields.getTextInputValue("name");
    const description = modalSubmission.fields.getTextInputValue("description") || undefined;
    const emoji = modalSubmission.fields.getTextInputValue("emoji") || undefined;
    const priorityStr = modalSubmission.fields.getTextInputValue("priority") || "2";

    const priority = parseInt(priorityStr) as TicketPriority;
    if (isNaN(priority) || priority < 1 || priority > 4) {
      await modalSubmission.reply({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Invalid Priority",
            "Priority must be between 1-4 (1=Low, 2=Medium, 3=High, 4=Urgent)"
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // Show channel selection
    await showChannelSelection(modalSubmission, client, categoryManager, {
      name,
      description,
      emoji,
      priority,
    });
  } catch (error) {
    log.error("Error in category creation modal:", error);
    // Modal timed out or other error - interaction already expired
  }
}

/**
 * Show channel selection for category creation
 */
async function showChannelSelection(
  interaction: ModalSubmitInteraction,
  client: any,
  categoryManager: CategoryManager,
  categoryData: { name: string; description?: string; emoji?: string; priority: TicketPriority }
) {
  const getter = new ThingGetter(client);
  const guild = interaction.guild!;

  // Get forum channels
  const forumChannels = guild.channels.cache
    .filter((channel) => channel.type === 15) // Forum channel type
    .map((channel) => ({
      name: channel.name,
      id: channel.id,
    }));

  if (forumChannels.length === 0) {
    await interaction.reply({
      embeds: [
        ModmailEmbeds.error(
          client,
          "No Forum Channels",
          "No forum channels found in this server. Please create a forum channel first."
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const selectMenuId = `channel-select-${interaction.user.id}-${Date.now()}`;

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(selectMenuId)
    .setPlaceholder("Select a forum channel for this category")
    .setMinValues(1)
    .setMaxValues(1);

  // Add channel options
  forumChannels.slice(0, 25).forEach((channel) => {
    selectMenu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`#${channel.name}`)
        .setValue(channel.id)
        .setDescription(`Forum channel for ${categoryData.name} tickets`)
    );
  });

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setTitle("📁 Select Forum Channel")
    .setDescription(
      `Choose the forum channel where tickets for **${categoryData.name}** will be created.`
    )
    .addFields([
      { name: "Category Name", value: categoryData.name, inline: true },
      { name: "Priority", value: getPriorityName(categoryData.priority), inline: true },
      { name: "Description", value: categoryData.description || "No description", inline: false },
    ])
    .setColor(0x3498db)
    .setTimestamp();

  if (categoryData.emoji) {
    embed.addFields([{ name: "Emoji", value: categoryData.emoji, inline: true }]);
  }

  await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });

  // Wait for channel selection
  const filter = (i: StringSelectMenuInteraction) => {
    return i.customId === selectMenuId && i.user.id === interaction.user.id;
  };

  const collector = interaction.channel?.createMessageComponentCollector({
    filter,
    componentType: ComponentType.StringSelect,
    time: 300000, // 5 minutes
    max: 1,
  });

  collector?.on("collect", async (selectInteraction) => {
    const forumChannelId = selectInteraction.values[0];

    // Create the category
    const { data: newCategory, error } = await tryCatch(
      categoryManager.createCategory(guild.id, {
        name: categoryData.name,
        description: categoryData.description,
        emoji: categoryData.emoji,
        priority: categoryData.priority,
        forumChannelId,
        formFields: undefined, // Start with no form fields
      })
    );

    if (error) {
      await selectInteraction.update({
        embeds: [
          ModmailEmbeds.error(
            client,
            "Creation Failed",
            `Failed to create category: ${error.message}`
          ),
        ],
        components: [],
      });
      return;
    }

    // Show success and option to add form fields
    await showCategoryCreated(selectInteraction, client, newCategory!);
  });

  collector?.on("end", (collected) => {
    if (collected.size === 0) {
      // Interaction expired - edit the original message
      interaction
        .editReply({
          embeds: [ModmailEmbeds.error(client, "Timeout", "Channel selection timed out.")],
          components: [],
        })
        .catch(() => {}); // Ignore errors if interaction is already expired
    }
  });
}

/**
 * Show category creation success
 */
async function showCategoryCreated(
  interaction: StringSelectMenuInteraction,
  client: any,
  category: CategoryType
) {
  const embed = new EmbedBuilder()
    .setTitle("✅ Category Created Successfully!")
    .setDescription(`The category **${category.name}** has been created.`)
    .addFields([
      { name: "Category ID", value: category.id, inline: true },
      {
        name: "Priority",
        value: getPriorityName(category.priority as TicketPriority),
        inline: true,
      },
      { name: "Forum Channel", value: `<#${category.forumChannelId}>`, inline: true },
    ])
    .setColor(0x00ff00)
    .setTimestamp();

  if (category.emoji) {
    embed.addFields([{ name: "Emoji", value: category.emoji, inline: true }]);
  }

  if (category.description) {
    embed.addFields([{ name: "Description", value: category.description, inline: false }]);
  }

  const addFormButton = new ButtonBuilder()
    .setCustomId(`add-form-${category.id}-${interaction.user.id}`)
    .setLabel("Add Form Fields")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("📝");

  const doneButton = new ButtonBuilder()
    .setCustomId(`category-done-${interaction.user.id}`)
    .setLabel("Done")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(addFormButton, doneButton);

  await interaction.update({
    embeds: [embed],
    components: [row],
  });

  // Handle button interactions
  const buttonFilter = (i: ButtonInteraction) => {
    return (
      (i.customId.startsWith("add-form-") || i.customId.startsWith("category-done-")) &&
      i.user.id === interaction.user.id
    );
  };

  const buttonCollector = interaction.message.createMessageComponentCollector({
    filter: buttonFilter,
    componentType: ComponentType.Button,
    time: 600000, // 10 minutes
    max: 1,
  });

  buttonCollector.on("collect", async (buttonInteraction) => {
    if (buttonInteraction.customId.startsWith("add-form-")) {
      await buttonInteraction.update({
        embeds: [embed],
        components: [],
      });

      // TODO: Implement form field addition flow
      await buttonInteraction.followUp({
        content:
          "🚧 **Form field configuration coming in Phase 4.1!**\n\nFor now, your category is created and ready to use without form fields. Form field configuration will be available soon.",
        ephemeral: true,
      });
    } else {
      await buttonInteraction.update({
        embeds: [embed],
        components: [],
      });

      await buttonInteraction.followUp({
        content: `✅ Category **${category.name}** is ready to use!`,
        ephemeral: true,
      });
    }
  });
}

/**
 * Handle editing an existing category
 */
async function handleEditCategory(
  interaction: ChatInputCommandInteraction,
  client: any,
  categoryManager: CategoryManager
) {
  await interaction.reply({
    content:
      "🚧 **Category editing coming in Phase 4.2!**\n\nThis feature will allow you to modify existing categories, including their names, descriptions, priorities, and form fields.",
    ephemeral: true,
  });
}

/**
 * Handle deleting a category
 */
async function handleDeleteCategory(
  interaction: ChatInputCommandInteraction,
  client: any,
  categoryManager: CategoryManager
) {
  await interaction.reply({
    content:
      "🚧 **Category deletion coming in Phase 4.3!**\n\nThis feature will allow you to safely delete categories with proper validation and cleanup.",
    ephemeral: true,
  });
}

/**
 * Handle listing categories
 */
async function handleListCategories(
  interaction: ChatInputCommandInteraction,
  client: any,
  categoryManager: CategoryManager
) {
  const { data: categories, error } = await tryCatch(
    categoryManager.getAvailableCategories(interaction.guild!.id)
  );

  if (error) {
    await interaction.reply({
      embeds: [
        ModmailEmbeds.error(client, "Error", `Failed to fetch categories: ${error.message}`),
      ],
      ephemeral: true,
    });
    return;
  }

  if (categories!.length === 0) {
    await interaction.reply({
      embeds: [
        ModmailEmbeds.info(
          client,
          "No Categories",
          "No modmail categories have been configured for this server yet.\n\nUse `/category create` to create your first category!"
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Modmail Categories")
    .setDescription(`Found ${categories!.length} configured categories:`)
    .setColor(0x3498db)
    .setTimestamp();

  categories!.forEach((category) => {
    const priorityName = getPriorityName(category.priority as TicketPriority);
    const formFieldCount = category.formFields?.length || 0;

    embed.addFields([
      {
        name: `${category.emoji || "📁"} ${category.name}`,
        value:
          `**ID:** \`${category.id}\`\n` +
          `**Priority:** ${priorityName}\n` +
          `**Channel:** <#${category.forumChannelId}>\n` +
          `**Form Fields:** ${formFieldCount}\n` +
          `**Description:** ${category.description || "No description"}`,
        inline: true,
      },
    ]);
  });

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}

/**
 * Handle testing a category's form
 */
async function handleTestForm(
  interaction: ChatInputCommandInteraction,
  client: any,
  categoryManager: CategoryManager
) {
  await interaction.reply({
    content:
      "🚧 **Form testing coming in Phase 4.4!**\n\nThis feature will allow you to test category forms to ensure they work correctly before users see them.",
    ephemeral: true,
  });
}

/**
 * Get priority name from number
 */
function getPriorityName(priority: TicketPriority): string {
  switch (priority) {
    case TicketPriority.LOW:
      return "🔸 Low";
    case TicketPriority.MEDIUM:
      return "🔹 Medium";
    case TicketPriority.HIGH:
      return "🔶 High";
    case TicketPriority.URGENT:
      return "🔴 Urgent";
    default:
      return "🔹 Medium";
  }
}
