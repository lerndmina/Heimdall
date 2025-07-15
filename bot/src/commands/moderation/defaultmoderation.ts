import type { SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import { initialReply } from "../../utils/initialReply";
import { ModerationCategory } from "../../models/ModeratedChannels";
import ModeratedChannel from "../../models/ModeratedChannels";
import log from "../../utils/log";
import Database from "../../utils/data/database";

export const data = new SlashCommandBuilder()
  .setName("defaultmoderation")
  .setDescription("Configure default AI moderation settings for the entire server")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addBooleanOption((option) =>
    option
      .setName("enabled")
      .setDescription("Whether server-wide moderation is enabled")
      .setRequired(true)
  )
  .addChannelOption((option) =>
    option
      .setName("modlog")
      .setDescription("Default channel where moderation reports will be sent")
      .setRequired(true)
  )
  .addBooleanOption((option) => option.setName("sexual").setDescription("Moderate sexual content"))
  .addBooleanOption((option) =>
    option.setName("sexual_minors").setDescription("Moderate sexual content involving minors")
  )
  .addBooleanOption((option) => option.setName("harassment").setDescription("Moderate harassment"))
  .addBooleanOption((option) =>
    option.setName("harassment_threatening").setDescription("Moderate threatening harassment")
  )
  .addBooleanOption((option) => option.setName("hate").setDescription("Moderate hate speech"))
  .addBooleanOption((option) =>
    option.setName("hate_threatening").setDescription("Moderate threatening hate speech")
  )
  .addBooleanOption((option) =>
    option.setName("violence").setDescription("Moderate violent content")
  )
  .addBooleanOption((option) =>
    option.setName("violence_graphic").setDescription("Moderate graphic violence")
  )
  .addBooleanOption((option) =>
    option.setName("self_harm").setDescription("Moderate self-harm content")
  )
  .addBooleanOption((option) =>
    option.setName("self_harm_intent").setDescription("Moderate self-harm intent")
  )
  .addBooleanOption((option) =>
    option.setName("self_harm_instructions").setDescription("Moderate self-harm instructions")
  )
  .addBooleanOption((option) =>
    option.setName("illicit").setDescription("Moderate illegal activities")
  )
  .addBooleanOption((option) =>
    option.setName("illicit_violent").setDescription("Moderate violent illegal activities")
  );

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["Administrator"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);

  const enabled = interaction.options.getBoolean("enabled") ?? true;
  const modlogChannel = interaction.options.getChannel("modlog");

  log.debug(
    `Default moderation command triggered by ${interaction.user.tag} for guild ${
      interaction.guild?.name || "unknown"
    }`
  );
  log.debug(
    `Default moderation ${enabled ? "enabled" : "disabled"}, modlog: ${
      modlogChannel?.name || "none"
    }`
  );

  if (!interaction.guildId) {
    await interaction.editReply({
      content: "This command can only be used in a server.",
    });
    return;
  }

  // Get selected categories
  const categoryMap: Record<string, ModerationCategory> = {
    sexual: ModerationCategory.SEXUAL,
    sexual_minors: ModerationCategory.SEXUAL_MINORS,
    harassment: ModerationCategory.HARASSMENT,
    harassment_threatening: ModerationCategory.HARASSMENT_THREATENING,
    hate: ModerationCategory.HATE,
    hate_threatening: ModerationCategory.HATE_THREATENING,
    violence: ModerationCategory.VIOLENCE,
    violence_graphic: ModerationCategory.VIOLENCE_GRAPHIC,
    self_harm: ModerationCategory.SELF_HARM,
    self_harm_intent: ModerationCategory.SELF_HARM_INTENT,
    self_harm_instructions: ModerationCategory.SELF_HARM_INSTRUCTIONS,
    illicit: ModerationCategory.ILLICIT,
    illicit_violent: ModerationCategory.ILLICIT_VIOLENT,
  };

  // Collect selected categories
  const selectedCategories = Object.entries(categoryMap)
    .filter(([optionName]) => interaction.options.getBoolean(optionName) !== false)
    .map(([_, category]) => category);

  // Default to all categories if none selected
  const categories =
    selectedCategories.length > 0 ? selectedCategories : Object.values(ModerationCategory);

  log.debug(`Selected default moderation categories: ${categories.join(", ")}`);

  const db = new Database();

  try {
    // Update or create the guild default settings
    const result = await db.findOneAndUpdate(
      ModeratedChannel,
      { guildId: interaction.guildId, isGuildDefault: true },
      {
        guildId: interaction.guildId,
        isEnabled: enabled,
        moderationCategories: categories,
        modlogChannelId: modlogChannel?.id,
        isGuildDefault: true,
      },
      { upsert: true, new: true }
    );

    log.debug(
      `Default moderation settings updated: ${JSON.stringify({
        guildId: result?.guildId,
        isGuildDefault: result?.isGuildDefault,
        isEnabled: result?.isEnabled,
        modlogChannelId: result?.modlogChannelId,
        categoriesCount: result?.moderationCategories?.length || 0,
      })}`
    );
    await interaction.editReply({
      content: `Default AI moderation for this server has been ${
        enabled ? "enabled" : "disabled"
      }.${
        modlogChannel ? ` Moderation reports will be sent to <#${modlogChannel.id}>.` : ""
      } These settings will apply to all channels without specific moderation settings.`,
    });
  } catch (error) {
    log.error("Error setting up server default moderation:", error);
    await interaction.editReply({
      content: "There was an error setting up default moderation for this server.",
    });
  }
}
