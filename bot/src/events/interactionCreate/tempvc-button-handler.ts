import {
  BaseInteraction,
  Client,
  InteractionType,
  User,
  Channel,
  ChannelType,
  PermissionFlagsBits,
  ComponentType,
  ButtonStyle,
  ButtonInteraction,
  MessageComponentInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  GuildChannel,
  ModalSubmitInteraction,
  BaseGuildVoiceChannel,
  Invite,
  UserSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import BasicEmbed from "../../utils/BasicEmbed";
import ms from "ms";
import log from "../../utils/log";

export const interactionBanUser = "tempvc-ban-user-menu";
export const interactionPostBanMenu = "tempvc-ban";
export const interactionLimitUsers = "tempvc-limit";
export const interactionSendInvite = "tempvc-invite";
export const interactionRenameVC = "tempvc-rename";
export const interactionDeleteVC_NO = "tempvc-delete-no";
export const interactionDeleteVC_YES = "tempvc-delete-yes";
export const interactionDeleteVC_REQUEST = "tempvc-delete-request";
export const interactionLockVC = "tempvc-lock";

export default async (interaction: MessageComponentInteraction, client: Client<true>) => {
  if (interaction.type != InteractionType.MessageComponent) return;
  if (!interaction.channel || interaction.channel.type != ChannelType.GuildVoice) return;
  if (!interaction.guild) return;

  log.debug(
    `Interaction with custom id ${interaction.customId} received from user ${interaction.user.tag} in channel ${interaction.channel.name}.`
  );
  if (
    !interaction.channel
      .permissionsFor(interaction.user)
      ?.has(PermissionFlagsBits.ManageChannels) &&
    interaction.customId.startsWith("tempvc-")
  ) {
    interaction.reply({
      embeds: [
        BasicEmbed(
          client,
          "Error!",
          `You do not have permission to use this button. You need the \`Manage Channels\` permission.`
        ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (!interaction.customId.startsWith("tempvc-")) return false; // We don't handle this interaction

  const channel = interaction.channel;
  const user = interaction.user;
  try {
    if (interaction.customId.startsWith(interactionDeleteVC_REQUEST)) {
      DeleteChannelButtons(interaction, channel, user);
    } else if (interaction.customId.startsWith(interactionDeleteVC_YES)) {
      /**
       * Kick all members from the channel, we delete it somewhere else
       * @file /src/events/voiceStatUpdate/leftTempVC.js
       */
      channel.members.forEach((member) => {
        member.voice.setChannel(null);
      });
    } else if (interaction.customId.startsWith(interactionDeleteVC_NO)) {
      interaction.message.delete();
    } else if (interaction.customId.startsWith(interactionRenameVC)) {
      await RenameVCModal(interaction, channel, user);
    } else if (interaction.customId.startsWith(interactionSendInvite)) {
      await SendInvite(interaction, channel, user);
    } else if (interaction.customId.startsWith(interactionPostBanMenu)) {
      await PostBanUserDropdown(interaction, channel, user);
    } else if (interaction.customId.startsWith(interactionBanUser)) {
      BanUserFromChannel(interaction as StringSelectMenuInteraction, channel, user);
    } else if (interaction.customId.startsWith(interactionLimitUsers)) {
      LimitUsers(interaction, channel, user);
    } else if (interaction.customId.startsWith(interactionLockVC)) {
      log.debug(`Lock/Unlock button clicked by ${interaction.user.tag} in channel ${channel.name}`);
      await LockUnlockVC(interaction, channel, user);
    }
  } catch (error) {
    log.error(`Error handling interaction: ${error}`);
  }
  return true;
};

function DeleteChannelButtons(
  interaction: MessageComponentInteraction,
  channel: Channel,
  user: User
) {
  // Ask for confirmation ephemeral message
  interaction.reply({
    content: `Are you sure you want to delete this channel?`,
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Danger,
            label: "Yes",
            customId: "tempvc-delete-yes",
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: "No",
            customId: "tempvc-delete-no",
          },
        ],
      },
    ],
  });
  return true; // Stops the event loop.
}

async function RenameVCModal(
  interaction: MessageComponentInteraction,
  channel: GuildChannel,
  user: User
) {
  // First check if bot has necessary permissions
  const botMember = channel.guild.members.me;
  if (!botMember) {
    await interaction.reply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Error!",
          "I couldn't find my own member data in this server.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
    return true;
  }

  const botPermissions = channel.permissionsFor(botMember);
  log.debug(
    `Bot permissions in channel ${channel.name}: Manage Channels: ${botPermissions?.has(
      PermissionFlagsBits.ManageChannels
    )}`
  );

  if (!botPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Missing Permissions!",
          "I need the **Manage Channels** permission to rename this channel.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
    return true;
  }

  const modalId = "tempvc-rename-modal";

  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Rename your channel");

  const nameInput = new TextInputBuilder()
    .setCustomId("tempvc-name-input")
    .setLabel("Enter the new name")
    .setMinLength(1)
    .setMaxLength(100)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("My Channel");

  const actionRow = new ActionRowBuilder().addComponents(nameInput);

  modal.addComponents(actionRow as any);

  await interaction.showModal(modal);

  const interactionFilter = (interaction: ModalSubmitInteraction) =>
    interaction.customId === modalId;

  interaction
    .awaitModalSubmit({ filter: interactionFilter, time: 120000 })
    .then(async (modalInteraction) => {
      try {
        const nameValue = modalInteraction.fields.getTextInputValue("tempvc-name-input");

        // Validate the name
        if (!nameValue || nameValue.trim().length === 0) {
          await modalInteraction.reply({
            embeds: [
              BasicEmbed(
                interaction.client,
                "Invalid Name!",
                "Channel name cannot be empty.",
                undefined,
                "Red"
              ),
            ],
            ephemeral: true,
          });
          return;
        }

        const trimmedName = nameValue.trim();

        // Respond immediately to prevent timeout
        await modalInteraction.reply({
          embeds: [
            BasicEmbed(
              interaction.client,
              "Renaming Channel...",
              `Please wait while I rename this channel to "${trimmedName}".`,
              undefined,
              "#ffaa00"
            ),
          ],
          ephemeral: true,
        });

        // Attempt to rename the channel with timeout
        let renameSuccessful = true;
        try {
          log.debug(`Renaming channel from "${channel.name}" to "${trimmedName}"`);
          await Promise.race([
            channel.setName(`${isChannelLocked(channel) ? "🔒 " : ""}${trimmedName}`),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Rename timeout")), 2500)),
          ]);
          log.debug(`Successfully renamed channel to "${trimmedName}"`);
        } catch (renameError: any) {
          log.error(`Failed to rename channel: ${renameError.message}`);
          renameSuccessful = false;
        }

        // Update the reply with the result
        if (renameSuccessful) {
          await modalInteraction.editReply({
            embeds: [
              BasicEmbed(
                interaction.client,
                "✅ Channel Renamed!",
                `Successfully renamed this channel to "${trimmedName}".`
              ),
            ],
          });
        } else {
          await modalInteraction.editReply({
            embeds: [
              BasicEmbed(
                interaction.client,
                "⚠️ Rename Failed",
                `Discord rate limits prevented the automatic rename. You can manually rename the channel by right-clicking it and selecting 'Edit Channel'.`,
                undefined,
                "Orange"
              ),
            ],
          });
        }
      } catch (error: any) {
        log.error(`Error in RenameVCModal: ${error}`);

        // Provide more specific error messages
        let errorMessage = "There was an error renaming the channel.";
        if (error.code === 50013) {
          errorMessage =
            "Missing Permissions: I don't have the required permissions to rename this channel. Please check my role hierarchy and permissions.";
        } else if (error.code === 50001) {
          errorMessage = "Missing Access: I don't have access to this channel.";
        } else if (error.message) {
          errorMessage = `Error: ${error.message}`;
        }

        try {
          // Try to respond with error message
          if (!modalInteraction.replied && !modalInteraction.deferred) {
            await modalInteraction.reply({
              embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
              ephemeral: true,
            });
          } else {
            await modalInteraction.editReply({
              embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
            });
          }
        } catch (replyError) {
          // If we can't reply at all, just log the error
          log.error(`Failed to respond to modal interaction: ${replyError}`);
        }
      }
    })
    .catch(async (timeoutError) => {
      // Handle modal timeout (user didn't submit within 2 minutes)
      log.debug(`Modal timeout for rename in channel ${channel.name}: ${timeoutError.message}`);
      // No need to respond here as the modal will automatically disappear
    });
  return true; // Stops the event loop.
}

async function SendInvite(
  interaction: MessageComponentInteraction,
  channel: BaseGuildVoiceChannel,
  user: User
) {
  try {
    // First check if bot has necessary permissions
    const botMember = channel.guild.members.me;
    if (!botMember) {
      await interaction.reply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "Error!",
            "I couldn't find my own member data in this server.",
            undefined,
            "Red"
          ),
        ],
        ephemeral: true,
      });
      return true;
    }

    const botPermissions = channel.permissionsFor(botMember);
    if (!botPermissions?.has(PermissionFlagsBits.CreateInstantInvite)) {
      await interaction.reply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "Missing Permissions!",
            "I need the **Create Instant Invite** permission to create invites for this channel.",
            undefined,
            "Red"
          ),
        ],
        ephemeral: true,
      });
      return true;
    }

    // Respond immediately to prevent timeout
    await interaction.reply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Creating Invite...",
          "Please wait while I create an invite for this channel.",
          undefined,
          "#ffaa00"
        ),
      ],
      ephemeral: true,
    });

    const tenMinutes = ms("10m") / 1000;
    const expiresAt = Math.floor(Date.now() / 1000 + tenMinutes);

    // Create invite with timeout
    let invite: Invite;
    try {
      invite = await Promise.race([
        channel.createInvite({
          maxAge: tenMinutes, // discord uses seconds
          maxUses: 10,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Invite creation timeout")), 2500)
        ),
      ]);
      log.debug(`Successfully created invite for channel ${channel.name}: ${invite.url}`);
    } catch (inviteError: any) {
      log.error(`Failed to create invite: ${inviteError.message}`);

      let errorMessage = "Failed to create an invite for this channel.";
      if (inviteError.code === 50013) {
        errorMessage =
          "Missing Permissions: I don't have the required permissions to create invites for this channel.";
      } else if (inviteError.code === 50001) {
        errorMessage = "Missing Access: I don't have access to this channel.";
      } else if (inviteError.message.includes("timeout")) {
        errorMessage =
          "Discord rate limits prevented creating the invite. Please try again in a moment.";
      }

      await interaction.editReply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "⚠️ Invite Creation Failed",
            errorMessage,
            undefined,
            "Red"
          ),
        ],
      });
      return true;
    }

    // Update the reply with the invite
    await interaction.editReply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "✅ Invite Created!",
          `Here is your invite: ${invite.url}\nShare it with your friends!`,
          [
            {
              name: "Invite Expires",
              value: `<t:${expiresAt}:R>`,
              inline: true,
            },
            { name: "Invite Max Uses", value: `\`${invite.maxUses}\``, inline: true },
          ]
        ),
      ],
    });

    // Send the invite link in the channel for easy copying
    if (interaction.channel && "send" in interaction.channel) {
      try {
        await interaction.channel.send({ content: `🔗 **Channel Invite:** ${invite.url}` });
      } catch (sendError) {
        log.error(`Failed to send invite link to channel: ${sendError}`);
        // Don't show error to user as the main functionality worked
      }
    }
  } catch (error: any) {
    log.error(`Error in SendInvite: ${error}`);

    // Provide more specific error messages
    let errorMessage = "There was an error creating the invite.";
    if (error.code === 50013) {
      errorMessage =
        "Missing Permissions: I don't have the required permissions to create invites. Please check my role hierarchy and permissions.";
    } else if (error.code === 50001) {
      errorMessage = "Missing Access: I don't have access to this channel.";
    } else if (error.message) {
      errorMessage = `Error: ${error.message}`;
    }

    try {
      // Try to respond with error message
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
        });
      }
    } catch (replyError) {
      // If we can't reply at all, just log the error
      log.error(`Failed to respond to interaction: ${replyError}`);
    }
  }

  return true; // Stops the event loop.
}

async function PostBanUserDropdown(
  interaction: MessageComponentInteraction,
  channel: BaseGuildVoiceChannel,
  user: User
) {
  if (channel.isDMBased() || !channel.members) return;
  const members = channel.members;

  const userMenu = new UserSelectMenuBuilder()
    .setCustomId(interactionBanUser)
    .setPlaceholder("Select a user to ban")
    .setMinValues(1)
    .setMaxValues(5);

  const row1 = new ActionRowBuilder().addComponents(userMenu);

  await interaction.reply({
    embeds: [
      BasicEmbed(interaction.client, "Ban a user", `Select a user to ban from this channel.`),
    ],
    components: [row1 as any],
    ephemeral: true,
  });
}

async function BanUserFromChannel(
  interaction: StringSelectMenuInteraction,
  channel: BaseGuildVoiceChannel,
  user: User
) {
  try {
    // First check if bot has necessary permissions
    const botMember = channel.guild.members.me;
    if (!botMember) {
      await interaction.reply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "Error!",
            "I couldn't find my own member data in this server.",
            undefined,
            "Red"
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    const botPermissions = channel.permissionsFor(botMember);
    if (!botPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "Missing Permissions!",
            "I need the **Manage Roles** permission to ban users from this channel.",
            undefined,
            "Red"
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    const users = interaction.values;
    if (users.length === 0) {
      await interaction.reply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "No Users Selected!",
            "Please select at least one user to ban.",
            undefined,
            "Red"
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    // Respond immediately to prevent timeout
    await interaction.reply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Banning Users...",
          `Please wait while I ban ${users.length} user(s) from this channel.`,
          undefined,
          "#ffaa00"
        ),
      ],
      ephemeral: true,
    });

    let successCount = 0;
    let failedUsers: string[] = [];

    for (const userId of users) {
      // Check if the user is not the interaction user
      if (userId === user.id) {
        failedUsers.push("yourself (cannot ban channel owner)");
        continue;
      }

      const member = channel.guild.members.cache.get(userId);
      if (!member) {
        failedUsers.push("unknown user");
        continue;
      }

      try {
        // Check if the user is in the channel and disconnect them
        if (member.voice.channelId === channel.id) {
          await member.voice.setChannel(null);
        }

        // Set channel permissions to deny the user from joining with timeout
        await Promise.race([
          channel.permissionOverwrites.edit(member, {
            Connect: false,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Ban timeout")), 2500)),
        ]);

        successCount++;
        log.debug(`Successfully banned user ${member.user.tag} from channel ${channel.name}`);
      } catch (banError: any) {
        log.error(`Failed to ban user ${member.user.tag}: ${banError.message}`);
        failedUsers.push(member.user.tag);
      }
    }

    // Update the reply with results
    let description = "";
    if (successCount > 0) {
      description = `Successfully banned ${successCount} user(s) from this channel.`;
    }
    if (failedUsers.length > 0) {
      if (description) description += "\n\n";
      description += `⚠️ **Failed to ban:** ${failedUsers.join(", ")}`;
      if (failedUsers.some((user) => user.includes("timeout") || user.includes("rate limit"))) {
        description +=
          "\n\n💡 **Tip:** You can manually ban users by going to channel permissions and denying them the 'Connect' permission.";
      }
    }

    const title =
      successCount > 0
        ? failedUsers.length > 0
          ? "✅ Partially Completed"
          : "✅ Users Banned!"
        : "⚠️ Ban Failed";

    const color = successCount > 0 ? (failedUsers.length > 0 ? "Orange" : undefined) : "Red";

    await interaction.editReply({
      embeds: [BasicEmbed(interaction.client, title, description, undefined, color)],
    });
  } catch (error: any) {
    log.error(`Error in BanUserFromChannel: ${error}`);

    // Provide more specific error messages
    let errorMessage = "There was an error banning users from the channel.";
    if (error.code === 50013) {
      errorMessage =
        "Missing Permissions: I don't have the required permissions to ban users from this channel. Please check my role hierarchy and permissions.";
    } else if (error.code === 50001) {
      errorMessage = "Missing Access: I don't have access to this channel.";
    } else if (error.message) {
      errorMessage = `Error: ${error.message}`;
    }

    try {
      // Try to respond with error message
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
        });
      }
    } catch (replyError) {
      // If we can't reply at all, just log the error
      log.error(`Failed to respond to interaction: ${replyError}`);
    }
  }
}

function LimitUsers(
  interaction: MessageComponentInteraction,
  channel: BaseGuildVoiceChannel,
  user: User
) {
  // First check if bot has necessary permissions
  const botMember = channel.guild.members.me;
  if (!botMember) {
    interaction.reply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Error!",
          "I couldn't find my own member data in this server.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
    return true;
  }

  const botPermissions = channel.permissionsFor(botMember);
  log.debug(
    `Bot permissions in channel ${channel.name}: Manage Channels: ${botPermissions?.has(
      PermissionFlagsBits.ManageChannels
    )}`
  );

  if (!botPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    interaction.reply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Missing Permissions!",
          "I need the **Manage Channels** permission to set user limits for this channel.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
    return true;
  }

  const modalId = "tempvc-limit-modal";

  const modal = new ModalBuilder().setCustomId(modalId).setTitle("Limit your max users");

  const limitInput = new TextInputBuilder()
    .setCustomId("tempvc-limit-input")
    .setLabel("Enter the new limit")
    .setMinLength(1)
    .setMaxLength(2)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("1");

  const actionRow = new ActionRowBuilder().addComponents(limitInput);

  modal.addComponents(actionRow as any);

  interaction.showModal(modal);

  const interactionFilter = (interaction: ModalSubmitInteraction) =>
    interaction.customId === modalId;

  interaction
    .awaitModalSubmit({ filter: interactionFilter, time: 120000 })
    .then(async (modalInteraction) => {
      try {
        const limitValueStr = modalInteraction.fields.getTextInputValue("tempvc-limit-input");
        const limitValue = parseInt(limitValueStr);

        // Check if the limit is a number
        if (isNaN(limitValue)) {
          await modalInteraction.reply({
            embeds: [
              BasicEmbed(
                interaction.client,
                "Invalid Input!",
                "The limit value must be a number!",
                undefined,
                "Red"
              ),
            ],
            ephemeral: true,
          });
          return;
        }

        if (limitValue <= 0) {
          await modalInteraction.reply({
            embeds: [
              BasicEmbed(
                interaction.client,
                "Invalid Limit!",
                "The limit value must be greater than `0`!",
                undefined,
                "Red"
              ),
            ],
            ephemeral: true,
          });
          return;
        }

        if (limitValue > 99) {
          await modalInteraction.reply({
            embeds: [
              BasicEmbed(
                interaction.client,
                "Invalid Limit!",
                "The limit value cannot be greater than `99`!",
                undefined,
                "Red"
              ),
            ],
            ephemeral: true,
          });
          return;
        }

        // Respond immediately to prevent timeout
        await modalInteraction.reply({
          embeds: [
            BasicEmbed(
              interaction.client,
              "Setting User Limit...",
              `Please wait while I set the user limit to ${limitValue}.`,
              undefined,
              "#ffaa00"
            ),
          ],
          ephemeral: true,
        });

        // Attempt to set user limit with timeout
        let limitSetSuccessful = true;
        try {
          log.debug(`Setting user limit for channel ${channel.name} to ${limitValue}`);
          await Promise.race([
            channel.setUserLimit(limitValue),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("User limit timeout")), 2500)
            ),
          ]);
          log.debug(`Successfully set user limit for channel ${channel.name} to ${limitValue}`);
        } catch (limitError: any) {
          log.error(`Failed to set user limit: ${limitError.message}`);
          limitSetSuccessful = false;
        }

        // Update the reply with the result
        if (limitSetSuccessful) {
          await modalInteraction.editReply({
            embeds: [
              BasicEmbed(
                interaction.client,
                "✅ User Limit Set!",
                `Successfully set the user limit of this channel to \`${limitValue}\`.`
              ),
            ],
          });
        } else {
          await modalInteraction.editReply({
            embeds: [
              BasicEmbed(
                interaction.client,
                "⚠️ Limit Failed",
                `Discord rate limits prevented setting the user limit automatically. You can manually set the limit by right-clicking the channel, selecting 'Edit Channel', and changing the user limit.`,
                undefined,
                "Orange"
              ),
            ],
          });
        }
      } catch (error: any) {
        log.error(`Error in LimitUsers: ${error}`);

        // Provide more specific error messages
        let errorMessage = "There was an error setting the user limit.";
        if (error.code === 50013) {
          errorMessage =
            "Missing Permissions: I don't have the required permissions to modify this channel. Please check my role hierarchy and permissions.";
        } else if (error.code === 50001) {
          errorMessage = "Missing Access: I don't have access to this channel.";
        } else if (error.message) {
          errorMessage = `Error: ${error.message}`;
        }

        try {
          // Try to respond with error message
          if (!modalInteraction.replied && !modalInteraction.deferred) {
            await modalInteraction.reply({
              embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
              ephemeral: true,
            });
          } else {
            await modalInteraction.editReply({
              embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
            });
          }
        } catch (replyError) {
          // If we can't reply at all, just log the error
          log.error(`Failed to respond to modal interaction: ${replyError}`);
        }
      }
    })
    .catch(async (timeoutError) => {
      // Handle modal timeout (user didn't submit within 2 minutes)
      log.debug(`Modal timeout for user limit in channel ${channel.name}: ${timeoutError.message}`);
      // No need to respond here as the modal will automatically disappear
    });

  return true; // Stops the event loop.
}

async function LockUnlockVC(
  interaction: MessageComponentInteraction,
  channel: BaseGuildVoiceChannel,
  user: User
) {
  log.debug(`LockUnlockVC function called for user ${user.tag} in channel ${channel.name}`);

  // Check bot permissions first
  const botMember = channel.guild.members.me;
  if (!botMember) {
    await interaction.reply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Error!",
          "I couldn't find my own member object in this server.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
    return true;
  }
  const botPermissions = channel.permissionsFor(botMember);
  log.debug(
    `Bot permissions in channel ${channel.name}: Manage Channels: ${botPermissions?.has(
      PermissionFlagsBits.ManageChannels
    )}, Manage Roles: ${botPermissions?.has(PermissionFlagsBits.ManageRoles)}`
  );

  if (!botPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Missing Permissions!",
          "I need the **Manage Channels** permission to lock/unlock this channel.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
    return true;
  }

  if (!botPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Missing Permissions!",
          "I need the **Manage Roles** permission to edit channel permissions.",
          undefined,
          "Red"
        ),
      ],
      ephemeral: true,
    });
    return true;
  }
  const isLocked = isChannelLocked(channel);

  log.debug(`Channel ${channel.name} current lock state: ${isLocked ? "LOCKED" : "UNLOCKED"}`);
  log.debug(`Channel permission overwrites count: ${channel.permissionOverwrites.cache.size}`);
  channel.permissionOverwrites.cache.forEach((overwrite) => {
    log.debug(
      `Permission overwrite for ${overwrite.id}: Allow: ${overwrite.allow.bitfield}, Deny: ${overwrite.deny.bitfield}`
    );
  });

  try {
    // Check if interaction has already been replied to or deferred
    if (!interaction.replied && !interaction.deferred) {
      // Respond to interaction immediately to prevent timeout
      await interaction.reply({
        embeds: [
          BasicEmbed(
            interaction.client,
            isLocked ? "Unlocking Channel..." : "Locking Channel...",
            "Please wait while I update the name and permissions of this channel.",
            undefined,
            "#ffaa00"
          ),
        ],
        ephemeral: true,
      });
    }
    if (isLocked) {
      // Unlock the channel
      log.debug(`Unlocking channel ${channel.name} - removing Connect permission denial`);
      let permissionChangeSuccessful = true;
      try {
        await Promise.race([
          channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            Connect: null,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Permission timeout")), 2500)
          ),
        ]);
        log.debug(`Successfully unlocked channel ${channel.name}`);
      } catch (permError: any) {
        log.error(`Failed to change channel permissions: ${permError.message}`);
        permissionChangeSuccessful = false;
      }

      // Rename to indicate it's unlocked (if it has the lock prefix)
      let renameSuccessful = true;
      if (channel.name.startsWith("🔒 ")) {
        const newName = channel.name.replace(/^🔒 /, "");
        log.debug(`Renaming unlocked channel from "${channel.name}" to "${newName}"`);
        try {
          await Promise.race([
            channel.setName(newName),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Rename timeout")), 2500)),
          ]);
          log.debug(`Successfully renamed channel to "${newName}"`);
        } catch (renameError: any) {
          log.error(`Failed to rename channel: ${renameError.message}`);
          renameSuccessful = false;
        }
      }

      // Update the reply with success message
      if (interaction.replied || interaction.deferred) {
        let description = "";

        if (permissionChangeSuccessful && renameSuccessful) {
          description = "This voice channel is now unlocked and everyone can join.";
        } else if (permissionChangeSuccessful && !renameSuccessful) {
          description =
            "This voice channel is now unlocked and everyone can join.\n\n💡 **Note:** The channel name couldn't be updated automatically, but you can rename it manually by right-clicking the channel and selecting 'Edit Channel'.\n-# Don't use the buttons to rename when you see this error.";
        } else if (!permissionChangeSuccessful) {
          description =
            "⚠️ **Permission Change Failed:** Discord rate limits prevented the automatic unlock. You can manually unlock the channel by going to channel settings and allowing @everyone to 'Connect'.";
        }
        await interaction.editReply({
          embeds: [
            BasicEmbed(
              interaction.client,
              permissionChangeSuccessful ? "🔓 Channel Unlocked!" : "⚠️ Unlock Failed",
              description
            ),
          ],
        });
      }
    } else {
      // Lock the channel
      log.debug(`Locking channel ${channel.name} - denying Connect permission for @everyone`);
      let permissionChangeSuccessful = true;
      try {
        await Promise.race([
          channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
            Connect: false,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Permission timeout")), 2500)
          ),
        ]);
        log.debug(`Successfully locked channel ${channel.name}`);
      } catch (permError: any) {
        log.error(`Failed to change channel permissions: ${permError.message}`);
        permissionChangeSuccessful = false;
      }

      // Rename to indicate it's locked (only if it doesn't already have the prefix)
      let renameSuccessful = true;
      if (!channel.name.startsWith("🔒 ")) {
        const newName = `🔒 ${channel.name}`;
        log.debug(`Renaming locked channel from "${channel.name}" to "${newName}"`);
        try {
          await Promise.race([
            channel.setName(newName),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Rename timeout")), 2500)),
          ]);
          log.debug(`Successfully renamed channel to "${newName}"`);
        } catch (renameError: any) {
          log.error(`Failed to rename channel: ${renameError.message}`);
          renameSuccessful = false;
        }
      }

      // Update the reply with success message
      if (interaction.replied || interaction.deferred) {
        let description = "";

        if (permissionChangeSuccessful && renameSuccessful) {
          description = "This voice channel is now locked. Only users with permission can join.";
        } else if (permissionChangeSuccessful && !renameSuccessful) {
          description =
            "This voice channel is now locked. Only users with permission can join.\n\n💡 **Note:** The channel name couldn't be updated automatically, but you can rename it manually if you'd like.";
        } else if (!permissionChangeSuccessful) {
          description =
            "⚠️ **Permission Change Failed:** Discord rate limits prevented the automatic lock. You can manually lock the channel by going to channel settings and denying @everyone the 'Connect' permission.";
        }
        await interaction.editReply({
          embeds: [
            BasicEmbed(
              interaction.client,
              permissionChangeSuccessful ? "🔒 Channel Locked!" : "⚠️ Lock Failed",
              description
            ),
          ],
        });
      }
    }
  } catch (error: any) {
    log.error(`Error in LockUnlockVC: ${error}`);

    // Provide more specific error messages
    let errorMessage = "There was an error locking/unlocking the channel.";
    if (error.code === 50013) {
      errorMessage =
        "Missing Permissions: I don't have the required permissions to edit this channel. Please check my role hierarchy and permissions.";
    } else if (error.code === 50001) {
      errorMessage = "Missing Access: I don't have access to this channel.";
    } else if (error.message) {
      errorMessage = `Error: ${error.message}`;
    }

    try {
      // Try to respond with error message
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
          ephemeral: true,
        });
      } else {
        await interaction.editReply({
          embeds: [BasicEmbed(interaction.client, "Error!", errorMessage, undefined, "Red")],
        });
      }
    } catch (replyError) {
      // If we can't reply at all, just log the error
      log.error(`Failed to respond to interaction: ${replyError}`);
    }
  }
  return true; // Stops the event loop.
}

function isChannelLocked(channel: GuildChannel): boolean {
  // Check if the channel has a permission overwrite that denies Connect for @everyone
  return channel.permissionOverwrites.cache.some(
    (overwrite) =>
      overwrite.id === channel.guild.roles.everyone.id &&
      overwrite.deny.has(PermissionFlagsBits.Connect)
  );
}
