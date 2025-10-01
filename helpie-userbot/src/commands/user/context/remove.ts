/**
 * Context Remove Command
 * Removes a context from the system
 * Owner-only command
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { ContextService } from "../../../services/ContextService";
import fetchEnvs from "../../../utils/FetchEnvs";
import log from "../../../utils/log";

const env = fetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("remove")
  .setDescription("Remove a context")
  .addStringOption((option) =>
    option.setName("scope").setDescription("Context scope").setRequired(true).addChoices({ name: "Global", value: "global" }, { name: "Guild", value: "guild" }, { name: "User", value: "user" })
  )
  .addUserOption((option) => option.setName("target-user").setDescription("Target user (required for user scope)").setRequired(false))
  .addStringOption((option) => option.setName("target-guild").setDescription("Target guild ID (optional for guild scope, defaults to current)").setRequired(false));

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Owner-only validation
  if (!env.OWNER_IDS.includes(interaction.user.id)) {
    return interaction.reply({
      content: "❌ This command is only available to bot owners.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const scope = interaction.options.getString("scope", true) as "global" | "guild" | "user";
    const targetUser = interaction.options.getUser("target-user");
    const targetGuild = interaction.options.getString("target-guild");

    // Validate scope-specific requirements
    if (scope === "user" && !targetUser) {
      return interaction.editReply({
        content: "❌ User scope requires a target user. Please specify `target-user`.",
      });
    }

    if (scope === "guild" && !targetGuild && !interaction.guildId) {
      return interaction.editReply({
        content: "❌ Guild scope requires a target guild ID or must be run in a guild.",
      });
    }

    // Get context to check if it exists
    const targetId = scope === "user" ? targetUser!.id : scope === "guild" ? targetGuild || interaction.guildId : undefined;

    const context = await ContextService.getContext(scope, targetId || undefined);

    if (!context) {
      return interaction.editReply({
        content: "❌ No context found for this scope.",
      });
    }

    // Build confirmation message
    let scopeDisplay = "Global";
    if (scope === "guild") {
      const guildId = targetGuild || interaction.guildId;
      const guild = client.guilds.cache.get(guildId!);
      scopeDisplay = `Guild (${guild?.name || guildId})`;
    } else if (scope === "user") {
      scopeDisplay = `User (${targetUser!.tag})`;
    }

    // Create confirmation buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirm_remove").setLabel("Confirm Remove").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("cancel_remove").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
    );

    const shortUrl = context.githubUrl.length > 60 ? context.githubUrl.substring(0, 57) + "..." : context.githubUrl;

    const response = await interaction.editReply({
      content: `⚠️ **Confirm Context Removal**

**Scope:** ${scopeDisplay}
${context.name ? `**Name:** ${context.name}\n` : ""}**URL:** ${shortUrl}

Are you sure you want to remove this context?
This action cannot be undone.`,
      components: [row],
    });

    // Wait for button interaction
    try {
      const confirmation = await response.awaitMessageComponent({
        filter: (i) => i.user.id === interaction.user.id,
        time: 30000, // 30 seconds
      });

      if (confirmation.customId === "confirm_remove") {
        // Remove context
        const removed = await ContextService.removeContext(scope, targetId || undefined);

        if (removed) {
          await confirmation.update({
            content: `✅ **Context Removed Successfully**

**Scope:** ${scopeDisplay}

The context has been deleted and cache cleared.`,
            components: [],
          });

          log.info("Context removed", {
            scope,
            targetId,
            removedBy: interaction.user.id,
          });
        } else {
          await confirmation.update({
            content: "❌ Failed to remove context. It may have already been deleted.",
            components: [],
          });
        }
      } else {
        await confirmation.update({
          content: "❌ Context removal cancelled.",
          components: [],
        });
      }
    } catch (error) {
      // Timeout
      await interaction.editReply({
        content: "❌ Confirmation timed out. Context was not removed.",
        components: [],
      });
    }
  } catch (error) {
    log.error("Error removing context:", error);
    await interaction.editReply({
      content: "❌ An error occurred while removing the context. Please try again later.",
    });
  }
}
