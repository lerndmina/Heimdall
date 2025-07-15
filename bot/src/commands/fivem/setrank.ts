import type { SlashCommandProps, CommandOptions, AutocompleteProps } from "commandkit";
import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, userCooldownKey } from "../../Bot";
import { initialReply } from "../../utils/initialReply";
import FetchEnvs, { DEFAULT_OPTIONAL_STRING, envExists } from "../../utils/FetchEnvs";
import { GetJobAutocomplete, GetJobIdFromName, GetJobNameFromId } from "./managejobs";
import Database from "../../utils/data/database";
import FivemJob from "../../models/FivemJob";
import FivemRankSetService from "../../services/FivemRankSetService";
import log from "../../utils/log";
import BasicEmbed from "../../utils/BasicEmbed";

const env = FetchEnvs();
const db = new Database();

// This command requires fivem systems and a fivem mysql uri to be defined in the env
if (envExists(env.ENABLE_FIVEM_SYSTEMS) && envExists(env.FIVEM_MYSQL_URI)) {
  module.exports = {
    data: new SlashCommandBuilder()
      .setName("setrank")
      .setDescription("Set a user's in-game Job Rank")
      .setContexts(InteractionContextType.Guild)
      .addUserOption((option) =>
        option.setName("user").setDescription("The user to set the rank for").setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("job")
          .setDescription("The job to set the rank for")
          .setRequired(true)
          .setAutocomplete(true)
          .setMinLength(1)
          .setMaxLength(50)
      )
      .addIntegerOption((option) =>
        option
          .setName("rank")
          .setDescription("The rank to set for the user")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(50)
      ),
    options: {
      devOnly: true,
      deleted: false,
      userPermissions: ["ManageGuild"],
      botPermissions: ["ManageGuild", "ManageMembers", "ManageRoles"],
    },

    async run(props: SlashCommandProps) {
      const { interaction, client, handler } = props;
      const user = interaction.options.getUser("user");
      const jobInput = interaction.options.getString("job");
      const rank = interaction.options.getInteger("rank");
      const guildId = interaction.guildId;

      if (!user || !jobInput || rank === null || rank === undefined || rank < 0) {
        return interaction.reply({
          content: "You must provide a user, job, and rank to set.",
          ephemeral: true,
        });
      }

      await initialReply(interaction, true);

      const jobId = GetJobIdFromName(jobInput);

      const userId = user.id;

      if (!guildId) {
        return interaction.editReply({
          content: "This command can only be used in a guild.",
        });
      }
      const job = await FivemJob.findOne({ name: jobId });
      if (!job) {
        return interaction.editReply({
          content: `Job ${GetJobNameFromId(
            jobId
          )} not setup for usage with this bot. If you think this is a mistake please ask a server admin to add it to my database.`,
        });
      }

      if (rank > job.maxGrade) {
        return interaction.editReply({
          content: `The rank you provided is higher than the maximum rank for this job (${job.maxGrade}). Please provide a valid rank.`,
        });
      }
      const result = await FivemRankSetService(job, rank, user, interaction);
      if (!result.success) {
        return interaction.editReply({
          content: `Failed to set rank: ${result.message}`,
        });
      }

      const embed = BasicEmbed(
        client,
        "Rank Set Successfully",
        `Successfully set ${user.username} to ${GetJobNameFromId(job.name)} (${
          job.name
        }) grade ${rank}.`
      );

      interaction.editReply({
        content: "",
        embeds: [embed],
      });
    },
    async autocomplete({ interaction, client, handler }: AutocompleteProps) {
      return GetJobAutocomplete(interaction);
    },
  };
} else {
  // Export an empty object or nothing at all when the feature is disabled
  module.exports = {};
}
