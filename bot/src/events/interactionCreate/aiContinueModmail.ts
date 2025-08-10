import { ButtonInteraction, Client, EmbedBuilder } from "discord.js";
import { redisClient } from "../../Bot";
import log from "../../utils/log";
import { createModmailThread } from "../../utils/ModmailUtils";
import { ThingGetter } from "../../utils/TinyUtils";
import Database from "../../utils/data/database";
import ModmailConfig from "../../models/ModmailConfig";
import { removeMentions } from "../../Bot";
import { TicketPriority } from "../../models/ModmailConfig";

export default async (interaction: ButtonInteraction, client: Client<true>) => {
  if (!interaction.customId || !interaction.isButton()) return;
  if (!interaction.customId.startsWith("ai_continue_modmail:")) return;

  // Update the existing message immediately to show loading state
  await interaction.update({
    content: null,
    embeds: [
      new EmbedBuilder()
        .setTitle("⏳ Processing...")
        .setDescription("Please wait while we set up your support ticket...")
        .setColor(0xffaa00),
    ],
    components: [], // Remove the button immediately
  });

  try {
    // Extract context key from custom ID
    const contextKey = interaction.customId.replace("ai_continue_modmail:", "");

    // Retrieve stored context from Redis
    if (!redisClient) {
      log.error("Redis client not available for AI continue modmail");
      return interaction.editReply({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription("Unable to continue with modmail creation. Please try again.")
            .setColor(0xff0000),
        ],
      });
    }

    const contextData = await redisClient.get(contextKey);
    if (!contextData) {
      return interaction.editReply({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setTitle("⏰ Session Expired")
            .setDescription("Your support session has expired. Please start a new modmail request.")
            .setColor(0xff8800),
        ],
      });
    }

    const context = JSON.parse(contextData);

    // Verify the user ID matches
    if (context.userId !== interaction.user.id) {
      return interaction.editReply({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Unauthorized")
            .setDescription("You are not authorized to continue this modmail session.")
            .setColor(0xff0000),
        ],
      });
    }

    // Clean up the stored context
    await redisClient.del(contextKey);

    // Get necessary objects
    const guild = await client.guilds.fetch(context.guildId);
    if (!guild) {
      return interaction.editReply({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription("Unable to find the server. Please try again.")
            .setColor(0xff0000),
        ],
      });
    }

    const db = new Database();
    const modmailConfig = await db.findOne(ModmailConfig, { guildId: guild.id });
    if (!modmailConfig) {
      return interaction.editReply({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Configuration Error")
            .setDescription("Modmail is not configured for this server.")
            .setColor(0xff0000),
        ],
      });
    }

    // Verify user membership
    const getter = new ThingGetter(client);
    const member = await getter.getMember(guild, interaction.user.id);
    if (!member) {
      return interaction.editReply({
        content: null,
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Access Denied")
            .setDescription(`You are not a member of ${guild.name}.`)
            .setColor(0xff0000),
        ],
      });
    }

    // Update the user that we're proceeding (disable the button to prevent double-clicks)
    await interaction.editReply({
      content: null,
      embeds: [
        new EmbedBuilder()
          .setTitle("📧 Creating Support Ticket")
          .setDescription("Thank you for choosing to continue. Creating your support ticket now...")
          .setColor(0x00ff00),
      ],
      components: [], // Remove the button completely
    });

    // Prepare category information
    let categoryInfo: any = {
      priority: TicketPriority.MEDIUM,
    };

    if (context.categoryId) {
      try {
        const { CategoryManager } = await import("../../utils/modmail/CategoryManager");
        const categoryManager = new CategoryManager();
        const category = await categoryManager.getCategoryById(guild.id, context.categoryId);

        if (category) {
          const ticketNumber = await categoryManager.getNextTicketNumber(guild.id);
          categoryInfo = {
            categoryId: category.id,
            categoryName: category.name,
            priority: Number(category.priority) as TicketPriority,
            ticketNumber,
            formResponses: context.formResponses || {},
            formMetadata: context.formMetadata || {},
          };
        }
      } catch (error) {
        log.error("Error preparing category info:", error);
      }
    }

    // Create the modmail thread directly
    const result = await createModmailThread(client, {
      guild: guild,
      targetUser: interaction.user,
      targetMember: member,
      forumChannel: await getter.getChannel(modmailConfig.forumChannelId),
      modmailConfig: modmailConfig,
      reason:
        context.messageContent.length >= 50
          ? context.messageContent.substring(0, 50) + "..."
          : context.messageContent,
      openedBy: {
        type: "User",
        username: interaction.user.username,
        userId: interaction.user.id,
      },
      initialMessage: removeMentions(context.messageContent),
      aiResponse: context.aiResponse, // Forward AI response to staff
      ...categoryInfo,
    });

    if (!result || !result.success) {
      log.error("Thread creation failed:", result);
      return interaction.user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Error Creating Ticket")
            .setDescription(
              result?.error ||
                "An error occurred while creating your support ticket. Please try again."
            )
            .setColor(0xff0000),
        ],
      });
    }

    // Clean up the Redis context after successful modmail creation
    await redisClient.del(contextKey);

    log.info(
      `AI Continue Modmail: Successfully created modmail thread for user ${interaction.user.id} in guild ${guild.id}`
    );
  } catch (error) {
    log.error("Error in AI continue modmail handler:", error);
    await interaction.editReply({
      content: null,
      embeds: [
        new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("An unexpected error occurred. Please try again.")
          .setColor(0xff0000),
      ],
    });
  }
};
