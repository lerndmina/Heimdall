import {
  ButtonBuilder,
  ButtonStyle,
  GuildTextBasedChannel,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { CommandOptions, SlashCommandProps } from "commandkit";
import AttachmentBlocker, {
  AttachmentType,
  AttachmentBlockerType,
} from "../../models/AttachmentBlocker";
import Database from "../../utils/data/database";
import { waitingEmoji } from "../../Bot";
import BasicEmbed from "../../utils/BasicEmbed";
import ButtonWrapper from "../../utils/ButtonWrapper";
import { DELETEME_BUTTON_PREFIX } from "../../events/interactionCreate/deleteMeButton";
import { tryCatch } from "../../utils/trycatch";
import log from "../../utils/log";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("attachmentblocker")
  .setDescription("block or allow certain attachment types in a channel")
  .addChannelOption((option) =>
    option
      .setName("channel")
      .setDescription("The channel to block attachments in")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("type")
      .setDescription("The type of attachment to allow (whitelist)")
      .setRequired(true)
      .addChoices(
        { name: "image", value: "image" },
        { name: "video", value: "video" },
        { name: "audio", value: "audio" },
        { name: "all", value: "all" },
        { name: "none", value: "none" } // Used to block all attachments
      )
  )
  .addBooleanOption((option) =>
    option.setName("clear").setDescription("Clear all attachment blocks in the channel")
  )
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  botPermissions: ["ManageMessages"],
  userPermissions: ["ManageChannels", "ManageMessages"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const interactionMessage = await initialReply(interaction, false);

  try {
    const channel = (interaction.options.getChannel("channel") ||
      interaction.channel) as TextChannel;

    const db = new Database();

    // Deleteme button component
    const buttons = ButtonWrapper([
      new ButtonBuilder()
        .setCustomId(DELETEME_BUTTON_PREFIX + interactionMessage.id)
        .setLabel("Delete")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️"),
    ]);

    // Handle clear option first
    if (interaction.options.getBoolean("clear")) {
      await db.findOneAndDelete(AttachmentBlocker, { channelId: channel.id });
      tryCatch(setOrRemovePerms(channel, false));
      return interaction.editReply({
        content: "",
        embeds: [
          BasicEmbed(
            client,
            "Attachment Blocker",
            `Successfully cleared all attachment blocks in ${channel}`
          ),
        ],
        components: buttons,
      });
    }

    // Get attachment type and validate
    const type = interaction.options.getString("type") as AttachmentType;
    if (!Object.values(AttachmentType).includes(type as AttachmentType)) {
      return interaction.editReply({
        content: `Invalid attachment type: ${type}. Must be one of: ${Object.values(
          AttachmentType
        ).join(", ")}`,
      });
    }

    // Check if config exists for this channel
    const existingConfig = await db.findOne<AttachmentBlockerType>(AttachmentBlocker, {
      channelId: channel.id,
    });

    let result: AttachmentBlockerType | null;
    if (existingConfig) {
      // Update existing configuration
      let attachmentTypes = [...existingConfig.attachmentTypes];

      // Check if type already exists
      if (attachmentTypes.includes(type)) {
        return interaction.editReply({
          content: "",
          embeds: [
            BasicEmbed(
              client,
              "Attachment Blocker",
              `${type} is already ${"whitelisted"} in ${channel}`
            ),
          ],
          components: buttons,
        });
      }

      // Add new type
      attachmentTypes.push(type);

      result = await db.findOneAndUpdate<AttachmentBlockerType>(
        AttachmentBlocker,
        { channelId: channel.id },
        {
          attachmentTypes,
          createdBy: interaction.user.id,
        }
      );
    } else {
      // Create new configuration
      result = await db.findOneAndUpdate<AttachmentBlockerType>(
        AttachmentBlocker,
        { channelId: channel.id },
        {
          channelId: channel.id,
          attachmentTypes: [type],
          createdBy: interaction.user.id,
        },
        { upsert: true, new: true }
      );
    }

    const { data: _, error: permError } = await tryCatch(setOrRemovePerms(channel, true));
    if (permError) {
      log.error("Error setting permissions for attachment blocker:");
      log.error(permError);
    }

    return interaction.editReply({
      content: "",
      embeds: [
        BasicEmbed(
          client,
          "Attachment Blocker",
          `Successfully ${"whitelisted"} ${type} attachments in ${channel}`,
          [
            {
              name: "Configuration",
              value: `**Mode:** Whitelist\n**Types:** ${result?.attachmentTypes.join(", ")}`,
              inline: false,
            },
          ]
        ),
      ],
      components: buttons,
    });
  } catch (error) {
    console.error("Error in attachmentblocker command:", error);
    return interaction.editReply({
      content: "An error occurred while configuring attachment blocking. Please try again.",
    });
  }
}

/**
 *
 * @param channel The TextChannel to set or remove permissions for
 * @param allow Whether to allow or remove permissions
 */
async function setOrRemovePerms(channel: TextChannel, allow: boolean) {
  channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    AttachFiles: allow,
  });
}
