/**
 * Tag Command
 * Sends a tag by name with autocomplete
 */

import { AutocompleteInteraction, ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import TagModel from "../../models/Tag";
import log from "../../utils/log";
import HelpieReplies from "../../utils/HelpieReplies";

export const data = new SlashCommandBuilder()
  .setName("tag")
  .setDescription("Send a saved tag")
  .addStringOption((option) => option.setName("name").setDescription("Tag name to send").setRequired(true).setAutocomplete(true))
  .addUserOption((option) => option.setName("target").setDescription("User to ping (optional)").setRequired(false));

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  try {
    const name = interaction.options.getString("name", true).toLowerCase().trim();
    const targetUser = interaction.options.getUser("target");

    // Find the tag - check global first, then user-specific
    let tag = await TagModel.findOne({
      scope: "global",
      name: name,
    });

    if (!tag) {
      tag = await TagModel.findOne({
        userId: interaction.user.id,
        scope: "user",
        name: name,
      });
    }

    if (!tag) {
      return HelpieReplies.warning(
        interaction,
        {
          title: "Tag Not Found",
          message: `No tag named \`${name}\` found.\n\nView your tags: \`/helpie tags list\``,
        },
        true
      );
    }

    // Build content with optional user mention
    const content = targetUser ? `${targetUser} ${tag.content}` : tag.content;

    // Send tag content first (not ephemeral - tags are meant to be shared)
    await interaction.reply({
      content: content,
    });

    // Update usage stats atomically to avoid race conditions
    await TagModel.findByIdAndUpdate(tag._id, {
      $inc: { usageCount: 1 },
      $set: { lastUsed: new Date() },
    });

    const scopeLabel = tag.scope === "global" ? "global tag" : "tag";
    log.debug(`User ${interaction.user.tag} used ${scopeLabel}: ${name}`);
  } catch (error: any) {
    log.error("Failed to send tag:", error);

    return HelpieReplies.error(
      interaction,
      {
        title: "Tag Retrieval Failed",
        message: `Failed to retrieve tag: ${error.message || "Unknown error"}`,
      },
      true
    );
  }
}

/**
 * Autocomplete handler for tag names
 */
export async function autocomplete(interaction: AutocompleteInteraction, client: Client) {
  try {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    // Get both global tags and user's personal tags
    const [globalTags, userTags] = await Promise.all([
      TagModel.find({ scope: "global" }).sort({ usageCount: -1, name: 1 }).limit(15),
      TagModel.find({ userId: interaction.user.id, scope: "user" }).sort({ usageCount: -1, name: 1 }).limit(15),
    ]);

    // Combine and filter tags by focused value
    const allTags = [...globalTags, ...userTags];
    const filtered = allTags
      .filter((tag) => tag.name.includes(focusedValue))
      .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name))
      .slice(0, 25)
      .map((tag) => ({
        name: `${tag.name}${tag.scope === "global" ? " 🌍" : ""} ${tag.usageCount > 0 ? `(${tag.usageCount}x)` : ""}`,
        value: tag.name,
      }));

    await interaction.respond(filtered);
  } catch (error) {
    log.error("Failed to autocomplete tags:", error);
    await interaction.respond([]);
  }
}
