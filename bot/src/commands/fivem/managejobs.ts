import type { SlashCommandProps, CommandOptions, AutocompleteProps } from "commandkit";
import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, userCooldownKey } from "../../Bot";
import { initialReply } from "../../utils/initialReply";
import FetchEnvs, { DEFAULT_OPTIONAL_STRING, envExists } from "../../utils/FetchEnvs";
import Database from "../../utils/data/database";
import FivemJob from "../../models/FivemJob";

const env = FetchEnvs();
const db = new Database();

export function GetJobIdFromName(jobName: string) {
  return jobName.trim().toLowerCase().replace(/\s+/g, "_");
}

export function GetJobNameFromId(jobId: string) {
  return jobId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function GetJobAutocomplete(interaction: AutocompleteProps["interaction"]) {
  const focusedOption = interaction.options.getFocused(true);
  if (focusedOption.name == "job" || focusedOption.name == "jobname") {
    const focusedValue = interaction.options.getFocused().trim();

    const jobs = await db.find(FivemJob, {}, true);
    if (!jobs || jobs.length === 0) {
      await interaction.respond([]);
      return;
    }

    let filteredJobs;
    if (focusedValue === "") {
      filteredJobs = jobs.slice(0, 10);
    } else {
      filteredJobs = jobs.filter((job) =>
        job.name.toLowerCase().includes(focusedValue.toLowerCase())
      );
    }

    const choices = filteredJobs.map((job) => ({
      name: GetJobNameFromId(job.name),
      value: job.name,
    }));

    await interaction.respond(choices);
  }
}

// This command requires fivem systems and a fivem mysql uri to be defined in the env

export const data = new SlashCommandBuilder()
  .setName("managejobs")
  .setDescription("Manage the jobs that the bot knows about")
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("create")
      .setDescription("Register a job for the bot to use")
      .addStringOption((option) =>
        option
          .setName("jobname")
          .setDescription("The name of the job to create")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(50)
      )
      .addIntegerOption(
        (option) =>
          option
            .setName("maxgrade")
            .setDescription("The maximum grade for the job (default is 0)")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(30) // Assuming max grade is 10, adjust as needed
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("delete")
      .setDescription("Delete a job from the bot's knowledge")
      .addStringOption((option) =>
        option
          .setName("jobname")
          .setDescription("The name of the job to delete")
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand.setName("list").setDescription("List all jobs that the bot knows about")
  );
export const options: CommandOptions = {
  devOnly: true,
  deleted: false,
  userPermissions: ["ManageGuild"],
  botPermissions: ["ManageGuild", "ManageRoles"],
};

export async function run(props: SlashCommandProps) {
  if (!envExists(env.ENABLE_FIVEM_SYSTEMS) || !envExists(env.FIVEM_MYSQL_URI)) {
    return props.interaction.reply({
      content: "This command is not enabled on this bot.",
      ephemeral: true,
    });
  }

  const { interaction, client, handler } = props;

  await initialReply(interaction, true);

  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case "create": {
      const jobName = interaction.options.getString("jobname");
      const maxGrade = interaction.options.getInteger("maxgrade");

      if (!jobName || jobName.length < 1 || jobName.length > 50) {
        return interaction.editReply({
          content: "The job name must be between 1 and 50 characters long.",
        });
      }

      if (!maxGrade || maxGrade < 0 || maxGrade > 30) {
        return interaction.editReply({
          content: "The maximum grade must be between 0 and 30.",
        });
      }

      const jobId = GetJobIdFromName(jobName);
      const job = await db.findOne(FivemJob, { name: jobId });

      if (job) {
        return interaction.editReply({
          content: `The job ${jobName} (\`${jobId}\`) already exists.`,
        });
      }

      const newJob = new FivemJob({
        name: jobId,
        maxGrade: maxGrade || 0, // Default to 0, can be updated later
      });

      await db.findOneAndUpdate(FivemJob, { name: jobId }, newJob, {
        upsert: true,
        new: true,
      });
      await db.cleanCache(db.getCacheKeys(FivemJob, "undefined:undefined"));

      return interaction.editReply({
        content: `The job ${jobName} (\`${jobId}\`) has been created successfully.`,
      });
    }
    case "delete": {
      const jobName = interaction.options.getString("jobname", true);
      const jobId = GetJobIdFromName(jobName);
      const job = await db.findOne(FivemJob, { name: jobId }, true);
      if (!job) {
        return interaction.editReply({
          content: `The job ${jobName} (\`${jobId}\`) does not exist.`,
        });
      }
      await db.deleteOne(FivemJob, { name: jobId });
      await db.cleanCache(db.getCacheKeys(FivemJob, "undefined:undefined"));
      return interaction.editReply({
        content: `The job ${jobName} (\`${jobId}\`) has been deleted successfully.`,
      });
    }
    case "list": {
      const jobs = await db.find(FivemJob, {}, true);
      if (!jobs || jobs.length === 0) {
        return interaction.editReply({
          content: "No jobs are currently registered.",
        });
      }

      const jobList = jobs
        .map(
          (job) => `- ${GetJobNameFromId(job.name)} (\`${job.name}\`) (Max Grade: ${job.maxGrade})`
        )
        .join("\n");
      return interaction.editReply({
        content: `Registered jobs:\n${jobList}`,
      });
    }
  }
}
export async function autocomplete({ interaction, client, handler }: AutocompleteProps) {
  return GetJobAutocomplete(interaction);
}
