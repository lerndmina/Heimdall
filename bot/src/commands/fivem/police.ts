import type { SlashCommandProps, CommandOptions, AutocompleteProps } from "commandkit";
import { InteractionContextType, SlashCommandBuilder, ChannelType, GuildMember } from "discord.js";
import { globalCooldownKey, setCommandCooldown, userCooldownKey } from "../../Bot";
import { initialReply } from "../../utils/initialReply";
import FetchEnvs, { DEFAULT_OPTIONAL_STRING, envExists } from "../../utils/FetchEnvs";
import { GetJobAutocomplete, GetJobIdFromName, GetJobNameFromId } from "./managejobs";
import Database from "../../utils/data/database";
import FivemJob from "../../models/FivemJob";
import FivemRankSetService from "../../services/FivemRankSetService";
import log from "../../utils/log";
import BasicEmbed from "../../utils/BasicEmbed";
import { ChecklistService } from "../../services/ChecklistService";
import ChecklistGuildConfig from "../../models/ChecklistGuildConfig";

const env = FetchEnvs();
const db = new Database();

// This command requires fivem systems and a fivem mysql uri to be defined in the env
if (envExists(env.ENABLE_FIVEM_SYSTEMS) && envExists(env.FIVEM_MYSQL_URI)) {
  module.exports = {
    data: new SlashCommandBuilder()
      .setName("police")
      .setDescription("Fivem Police Commands")
      .addSubcommand((subcommand) =>
        subcommand
          .setName("checklist-enable")
          .setDescription("Enable checklists in this guild")
          .addRoleOption((option) =>
            option
              .setName("staff-role")
              .setDescription("Staff role that can manage checklists")
              .setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("checklist-create").setDescription("Create a new checklist template")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("checklist-start")
          .setDescription("Start a checklist instance for a user")
          .addStringOption((option) =>
            option
              .setName("checklist")
              .setDescription("The checklist to start")
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to start the checklist for")
              .setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("checklist-list").setDescription("List all available checklists")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("checklist-delete")
          .setDescription("Delete a checklist template")
          .addStringOption((option) =>
            option
              .setName("checklist")
              .setDescription("The checklist to delete")
              .setRequired(true)
              .setAutocomplete(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("checklist-config")
          .setDescription("View or modify checklist configuration")
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("checklist-migrate")
          .setDescription("Migrate existing checklist instances to new URL format (Admin only)")
      ),
    options: {
      devOnly: false,
      deleted: false,
    },

    async run(props: SlashCommandProps) {
      const { interaction } = props;

      if (!interaction.guild) {
        return interaction.reply({
          content: "This command can only be used in servers.",
          ephemeral: true,
        });
      }

      const subcommand = interaction.options.getSubcommand();

      try {
        switch (subcommand) {
          case "checklist-enable":
            return await handleChecklistEnable(props);
          case "checklist-create":
            return await handleChecklistCreate(props);
          case "checklist-start":
            return await handleChecklistStart(props);
          case "checklist-list":
            return await handleChecklistList(props);
          case "checklist-delete":
            return await handleChecklistDelete(props);
          case "checklist-config":
            return await handleChecklistConfig(props);
          case "checklist-migrate":
            return await handleChecklistMigrate(props);
          default:
            return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
        }
      } catch (error) {
        log(`Error in police command: ${error}`, "ERROR");
        return interaction.reply({
          content: "An error occurred while processing your request.",
          ephemeral: true,
        });
      }
    },

    async autocomplete({ interaction, client, handler }: AutocompleteProps) {
      if (!interaction.guild) return;

      const focusedOption = interaction.options.getFocused(true);

      if (focusedOption.name === "checklist") {
        try {
          const checklistNames = await ChecklistService.getChecklistNames(interaction.guild.id);
          const filtered = checklistNames
            .filter((name) => name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25);

          await interaction.respond(filtered.map((name) => ({ name, value: name })));
        } catch (error) {
          log(`Error in police autocomplete: ${error}`, "ERROR");
          await interaction.respond([]);
        }
      }
    },
  };
} else {
  // Export an empty object or nothing at all when the feature is disabled
  module.exports = {};
}

async function preFlightCheck(interaction: any) {
  // Existing preFlightCheck function - keep as is
}

// Checklist command handlers
async function handleChecklistEnable(props: SlashCommandProps) {
  const { interaction } = props;

  if (!interaction.guild) return;

  // Check if user has administrator permission
  if (!interaction.memberPermissions?.has("Administrator")) {
    return interaction.reply({
      content: "You need administrator permissions to enable checklists.",
      ephemeral: true,
    });
  }

  const staffRole = interaction.options.getRole("staff-role");

  try {
    // Find or create guild config
    let guildConfig = await ChecklistGuildConfig.findOne({ guildId: interaction.guild.id });

    if (!guildConfig) {
      guildConfig = new ChecklistGuildConfig({
        guildId: interaction.guild.id,
        enabled: true,
        staffRoleIds: staffRole ? [staffRole.id] : [],
      });
    } else {
      guildConfig.enabled = true;
      if (staffRole && !guildConfig.staffRoleIds.includes(staffRole.id)) {
        guildConfig.staffRoleIds.push(staffRole.id);
      }
    }

    await guildConfig.save();
    const embed = BasicEmbed(
      interaction.client,
      "✅ Checklists Enabled",
      "Checklists have been enabled for this server.",
      [
        {
          name: "Staff Roles",
          value:
            guildConfig.staffRoleIds.length > 0
              ? guildConfig.staffRoleIds.map((id) => `<@&${id}>`).join(", ")
              : "None set (only administrators can manage checklists)",
          inline: false,
        },
      ],
      "#00FF00"
    );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    log(`Error enabling checklists: ${error}`, "ERROR");
    return interaction.reply({
      content: "An error occurred while enabling checklists.",
      ephemeral: true,
    });
  }
}

async function handleChecklistCreate(props: SlashCommandProps) {
  const { interaction } = props;

  if (!interaction.guild) return;

  if (!interaction.memberPermissions?.has("ManageChannels")) {
    return interaction.reply({
      content: "You need the Manage Channels permission to create checklists.",
      ephemeral: true,
    });
  }

  try {
    await ChecklistService.startChecklistCreation(interaction);
  } catch (error) {
    log(`Error creating checklist: ${error}`, "ERROR");
    return interaction.reply({
      content: "An error occurred while starting checklist creation.",
      ephemeral: true,
    });
  }
}

async function handleChecklistStart(props: SlashCommandProps) {
  const { interaction } = props;

  if (!interaction.guild) return;

  const checklistName = interaction.options.getString("checklist", true);
  const targetUser = interaction.options.getUser("user", true);

  // Check for ban/kick permissions
  if (!interaction.memberPermissions?.has("KickMembers")) {
    return interaction.reply({
      content: "You need to be a moderator to start a checklist.",
      ephemeral: true,
    });
  }

  try {
    await ChecklistService.createChecklistInstance(interaction, checklistName, targetUser);
  } catch (error) {
    log(`Error starting checklist instance: ${error}`, "ERROR");
    return interaction.reply({
      content: "An error occurred while starting the checklist instance.",
      ephemeral: true,
    });
  }
}

async function handleChecklistList(props: SlashCommandProps) {
  const { interaction } = props;

  if (!interaction.guild) return;

  try {
    const checklists = await ChecklistService.listChecklists(interaction.guild.id);

    if (checklists.length === 0) {
      return interaction.reply({
        content:
          "No checklists found for this server. Use `/police checklist-create` to create one.",
        ephemeral: true,
      });
    }
    const embedFields = checklists.map((checklist, index) => ({
      name: `${index + 1}. ${checklist.name}`,
      value: `${checklist.description}\n**Items:** ${
        checklist.items.length
      }\n**Created:** <t:${Math.floor(checklist.createdAt.getTime() / 1000)}:R>`,
      inline: false,
    }));

    const embed = BasicEmbed(
      interaction.client,
      "📋 Available Checklists",
      "*",
      embedFields,
      "#00AE86"
    );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    log(`Error listing checklists: ${error}`, "ERROR");
    return interaction.reply({
      content: "An error occurred while listing checklists.",
      ephemeral: true,
    });
  }
}

async function handleChecklistDelete(props: SlashCommandProps) {
  const { interaction } = props;

  if (!interaction.guild) return;

  const checklistName = interaction.options.getString("checklist", true);
  // Check permissions
  const guildConfig = await ChecklistGuildConfig.findOne({ guildId: interaction.guild.id });
  const member = interaction.member as any;
  const hasPermission =
    interaction.memberPermissions?.has("Administrator") ||
    (guildConfig?.staffRoleIds.some((roleId) => member?.roles?.cache?.has(roleId)) ?? false);

  if (!hasPermission) {
    return interaction.reply({
      content: "You don't have permission to delete checklists.",
      ephemeral: true,
    });
  }

  try {
    const deleted = await ChecklistService.deleteChecklist(interaction.guild.id, checklistName);

    if (deleted) {
      const embed = BasicEmbed(
        interaction.client,
        "🗑️ Checklist Deleted",
        `The checklist "${checklistName}" has been deleted.`,
        [],
        "#FF0000"
      );

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      return interaction.reply({
        content: `Checklist "${checklistName}" not found.`,
        ephemeral: true,
      });
    }
  } catch (error) {
    log(`Error deleting checklist: ${error}`, "ERROR");
    return interaction.reply({
      content: "An error occurred while deleting the checklist.",
      ephemeral: true,
    });
  }
}

async function handleChecklistConfig(props: SlashCommandProps) {
  const { interaction } = props;

  if (!interaction.guild) return;

  // Check if user has administrator permission
  if (!interaction.memberPermissions?.has("Administrator")) {
    return interaction.reply({
      content: "You need administrator permissions to view checklist configuration.",
      ephemeral: true,
    });
  }

  try {
    const guildConfig = await ChecklistGuildConfig.findOne({ guildId: interaction.guild.id });
    const checklistCount = await ChecklistService.listChecklists(interaction.guild.id);
    const configFields = [
      {
        name: "Status",
        value: guildConfig?.enabled ? "✅ Enabled" : "❌ Disabled",
        inline: true,
      },
      {
        name: "Total Checklists",
        value: checklistCount.length.toString(),
        inline: true,
      },
      {
        name: "Staff Roles",
        value: guildConfig?.staffRoleIds.length
          ? guildConfig.staffRoleIds.map((id) => `<@&${id}>`).join(", ")
          : "None set (only administrators)",
        inline: false,
      },
    ];

    if (!guildConfig?.enabled) {
      configFields.push({
        name: "Enable Checklists",
        value: "Use `/police checklist-enable` to enable checklists for this server.",
        inline: false,
      });
    }

    const embed = BasicEmbed(
      interaction.client,
      "⚙️ Checklist Configuration",
      "*",
      configFields,
      "#00AE86"
    );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    log(`Error viewing checklist config: ${error}`, "ERROR");
    return interaction.reply({
      content: "An error occurred while viewing the configuration.",
      ephemeral: true,
    });
  }
}

async function handleChecklistMigrate(props: SlashCommandProps) {
  const { interaction, client } = props;

  // Check if user is administrator
  const member = interaction.member as GuildMember;
  if (!member.permissions.has("Administrator")) {
    return interaction.reply({
      content: "❌ Only administrators can run the migration.",
      ephemeral: true,
    });
  }

  try {
    await interaction.deferReply({ ephemeral: true });

    await ChecklistService.migrateMessageUrls(client);

    return interaction.editReply({
      content: "✅ Checklist message URL migration completed! Check the console logs for details.",
    });
  } catch (error) {
    log(`Error running checklist migration: ${error}`, "ERROR");
    return interaction.editReply({
      content:
        "❌ An error occurred while running the migration. Check the console logs for details.",
    });
  }
}
