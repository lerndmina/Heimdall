/**
 * Tags Remove Command
 * Removes a tag by name with autocomplete
 */

import { AutocompleteInteraction, ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import TagModel from "../../../models/Tag";
import log from "../../../utils/log";
import HelpieReplies from "../../../utils/HelpieReplies";
import fetchEnvs from "../../../utils/FetchEnvs";

const env = fetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("remove")
  .setDescription("Delete a tag")
  .addStringOption((option) => option.setName("name").setDescription("Tag name to delete").setRequired(true).setAutocomplete(true));

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  await HelpieReplies.deferThinking(interaction, true);

  try {
    const name = interaction.options.getString("name", true).toLowerCase().trim();
    const isOwner = env.OWNER_IDS.includes(interaction.user.id);

    // Try to find the tag (check user's tags, or global if owner)
    let tag;
    if (isOwner) {
      // Owners can delete both user and global tags - check global first
      tag = await TagModel.findOne({ scope: "global", name: name });
      if (!tag) {
        tag = await TagModel.findOne({ userId: interaction.user.id, scope: "user", name: name });
      }
    } else {
      // Regular users can only delete their own user tags
      tag = await TagModel.findOne({ userId: interaction.user.id, scope: "user", name: name });
    }

    if (!tag) {
      return HelpieReplies.editWarning(interaction, {
        title: "Tag Not Found",
        message: `No tag named \`${name}\` found that you can delete.`,
      });
    }

    // Check permissions for global tags
    if (tag.scope === "global" && !isOwner) {
      return HelpieReplies.editWarning(interaction, {
        title: "Permission Denied",
        message: `Tag \`${name}\` is a global tag. Only bot owners can delete global tags.`,
      });
    }

    // Delete the tag
    await TagModel.findByIdAndDelete(tag._id);

    const scopeLabel = tag.scope === "global" ? "global tag" : "tag";
    log.info(`User ${interaction.user.tag} deleted ${scopeLabel}: ${name}`);

    await HelpieReplies.editSuccess(interaction, {
      title: "Tag Deleted",
      message: `Successfully deleted ${tag.scope === "global" ? "**global**" : ""} tag \`${name}\`.`,
    });
  } catch (error: any) {
    log.error("Failed to delete tag:", error);

    return HelpieReplies.editError(interaction, {
      title: "Tag Deletion Failed",
      message: `Failed to delete tag: ${error.message || "Unknown error"}`,
    });
  }
}

/**
 * Autocomplete handler for tag names
 * Only shows tags the user can actually delete
 */
export async function autocomplete(interaction: AutocompleteInteraction, client: Client) {
  try {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const isOwner = env.OWNER_IDS.includes(interaction.user.id);

    let tags;
    if (isOwner) {
      // Owners can see both global and their own user tags
      const [globalTags, userTags] = await Promise.all([
        TagModel.find({ scope: "global" }).sort({ name: 1 }).limit(15),
        TagModel.find({ userId: interaction.user.id, scope: "user" }).sort({ name: 1 }).limit(15),
      ]);
      tags = [...globalTags, ...userTags];
    } else {
      // Regular users only see their own user tags
      tags = await TagModel.find({ userId: interaction.user.id, scope: "user" }).sort({ name: 1 }).limit(25);
    }

    // Filter tags by focused value
    const filtered = tags
      .filter((tag) => tag.name.includes(focusedValue))
      .slice(0, 25)
      .map((tag) => ({
        name: `${tag.name}${tag.scope === "global" ? " 🌍" : ""} (${tag.usageCount}x)`,
        value: tag.name,
      }));

    await interaction.respond(filtered);
  } catch (error) {
    log.error("Failed to autocomplete tags:", error);
    await interaction.respond([]);
  }
}
