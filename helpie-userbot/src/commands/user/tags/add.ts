/**
 * Tags Add Command
 * Adds a new tag with the specified name and content
 */

import { ChatInputCommandInteraction, Client, SlashCommandBuilder } from "discord.js";
import TagModel from "../../../models/Tag";
import log from "../../../utils/log";
import HelpieReplies from "../../../utils/HelpieReplies";
import fetchEnvs from "../../../utils/FetchEnvs";

const env = fetchEnvs();

export const data = new SlashCommandBuilder()
  .setName("add")
  .setDescription("Create a new tag")
  .addStringOption((option) => option.setName("name").setDescription("Tag name (lowercase, alphanumeric, dashes and underscores only)").setRequired(true).setMinLength(1).setMaxLength(100))
  .addStringOption((option) => option.setName("content").setDescription("Tag content to send when triggered").setRequired(true).setMinLength(1).setMaxLength(2000))
  .addBooleanOption((option) => option.setName("global").setDescription("Make this a global tag (owner-only)").setRequired(false));

export const options = {
  devOnly: false,
  deleted: false,
};

export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  await HelpieReplies.deferThinking(interaction, true);

  try {
    const name = interaction.options.getString("name", true).toLowerCase().trim();
    const content = interaction.options.getString("content", true);
    const makeGlobal = interaction.options.getBoolean("global") ?? false;

    // Only owners can create global tags
    const isOwner = env.OWNER_IDS.includes(interaction.user.id);
    if (makeGlobal && !isOwner) {
      return HelpieReplies.editWarning(interaction, {
        title: "Permission Denied",
        message: "Only bot owners can create global tags.",
      });
    }

    const scope = makeGlobal ? "global" : "user";

    // Validate tag name format
    if (!/^[a-z0-9_-]+$/.test(name)) {
      return HelpieReplies.editWarning(interaction, {
        title: "Invalid Tag Name",
        message: "Tag names can only contain lowercase letters, numbers, dashes, and underscores.",
      });
    }

    // Check if tag already exists
    const query = scope === "global" ? { scope: "global", name: name } : { userId: interaction.user.id, scope: "user", name: name };

    const existingTag = await TagModel.findOne(query);

    if (existingTag) {
      const scopeText = scope === "global" ? "A global" : "You already have a";
      return HelpieReplies.editWarning(interaction, {
        title: "Tag Already Exists",
        message: `${scopeText} tag named \`${name}\`. Use \`/helpie tags remove ${name}\` to delete it first, or choose a different name.`,
      });
    }

    // Create new tag
    const newTag = new TagModel({
      userId: interaction.user.id,
      scope: scope,
      name: name,
      content: content,
    });

    await newTag.save();

    const scopeLabel = scope === "global" ? "global tag" : "tag";
    log.info(`User ${interaction.user.tag} created ${scopeLabel}: ${name}`);

    await HelpieReplies.editSuccess(interaction, {
      title: "Tag Created",
      message: `Successfully created ${scope === "global" ? "**global**" : ""} tag \`${name}\`!\n\nUse it with: \`/helpie tag ${name}\``,
    });
  } catch (error: any) {
    log.error("Failed to create tag:", error);

    return HelpieReplies.editError(interaction, {
      title: "Tag Creation Failed",
      message: `Failed to create tag: ${error.message || "Unknown error"}`,
    });
  }
}
