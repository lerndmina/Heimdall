import type { SlashCommandProps, CommandOptions } from "commandkit";
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import { initialReply } from "../../utils/initialReply";
import { ModerationCategory } from "../../models/ModeratedChannels";
import ModeratedChannel from "../../models/ModeratedChannels";
import log from "../../utils/log";
import Database from "../../utils/data/database";

export const data = new SlashCommandBuilder()
  .setName("setup-moderation")
  .setDescription("Configure AI moderation for a channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .setDMPermission(false)
  .addChannelOption((option) =>
    option.setName("channel").setDescription("The channel to moderate").setRequired(true)
  )
  .addBooleanOption((option) =>
    option.setName("enabled").setDescription("Whether moderation is enabled").setRequired(true)
  )
  .addChannelOption((option) =>
    option
      .setName("modlog")
      .setDescription("Channel where moderation reports will be sent")
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
  userPermissions: ["ManageChannels"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  await initialReply(interaction, true);
  // setCommandCooldown(globalCooldownKey(interaction.commandName), 15);

  const channel = interaction.options.getChannel("channel");
  const enabled = interaction.options.getBoolean("enabled") ?? true;
  const modlogChannel = interaction.options.getChannel("modlog");

  log.debug(
    `Setup moderation command triggered by ${interaction.user.tag} for channel ${
      channel?.name || "unknown"
    }`
  );
  log.debug(
    `Moderation ${enabled ? "enabled" : "disabled"}, modlog: ${modlogChannel?.name || "none"}`
  );

  if (!channel) {
    await interaction.editReply({
      content: "Please select a valid channel.",
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

  log.debug(`Selected moderation categories: ${categories.join(", ")}`);

  const db = new Database();

  try {
    const result = await db.findOneAndUpdate(
      ModeratedChannel,
      { channelId: channel.id },
      {
        guildId: interaction.guildId,
        channelId: channel.id,
        isEnabled: enabled,
        moderationCategories: categories,
        modlogChannelId: modlogChannel?.id,
      },
      { upsert: true, new: true }
    );

    log.debug(
      `Moderation settings updated: ${JSON.stringify({
        guildId: result?.guildId,
        channelId: result?.channelId,
        isEnabled: result?.isEnabled,
        modlogChannelId: result?.modlogChannelId,
        categoriesCount: result?.moderationCategories?.length || 0,
      })}`
    );

    await interaction.editReply({
      content: `AI moderation for <#${channel.id}> has been ${enabled ? "enabled" : "disabled"}.${
        modlogChannel ? ` Moderation reports will be sent to <#${modlogChannel.id}>.` : ""
      }`,
    });
  } catch (error) {
    log.error("Error setting up moderation:", error);
    await interaction.editReply({
      content: "There was an error setting up moderation for this channel.",
    });
  }
}
