import { CommandInteraction, Interaction, User } from "discord.js";
import { FivemJobsType } from "../models/FivemJob";
import { FivemJob, getCharacterInfo } from "../subcommands/fivem/commons";
import FetchEnvs from "../utils/FetchEnvs";
import { fivemPool } from "../Bot";
import { tryCatch } from "../utils/trycatch";

const env = FetchEnvs();
export default async function (
  givenJob: FivemJobsType,
  rank: number,
  user: User,
  interaction: CommandInteraction
): Promise<{ success: boolean; message: string }> {
  const fivemUser = await getCharacterInfo(interaction, user, { includeJobInfo: true });
  if (!fivemUser) {
    return { success: false, message: "User not found in FiveM database." };
  }

  const newjob: FivemJob = {
    identifier: fivemUser.citizenId,
    name: givenJob.name,
    grade: rank,
    active: true,
    total: 0,
    week: 0,
  };

  // Check database connection
  env.DEBUG_LOG && (await interaction.editReply("Checking database connection..."));
  if (!fivemPool) {
    return { success: false, message: "Database connection is not available." };
  }

  // Get database connection from pool
  env.DEBUG_LOG &&
    (await interaction.editReply(
      "Database connection is available. Creating connection thread..."
    ));
  const { data: fivemDb, error: dbConnectionError } = await tryCatch(fivemPool.getConnection());
  if (dbConnectionError) {
    return {
      success: false,
      message: "Failed to connect to the database: " + dbConnectionError.message,
    };
  }

  env.DEBUG_LOG && (await interaction.editReply("Connection thread created successfully."));
  if (fivemUser.jobInfoParsed && fivemUser.jobInfoParsed?.length > 0) {
    const { error: updateError } = await tryCatch(
      fivemDb.query(
        "UPDATE lunar_multijob SET grade = ?, name = ? WHERE identifier = ? AND active = 1",
        [newjob.grade, newjob.name, newjob.identifier]
      )
    );
    if (updateError) {
      return {
        success: false,
        message: "Failed to update job in database: " + updateError.message,
      };
    }

    console.debug("Job updated in database successfully.", newjob, fivemUser);

    env.DEBUG_LOG && (await interaction.editReply("Job updated in database successfully."));
    return {
      success: true,
      message: `Successfully set ${user.username} to ${givenJob.name} rank ${rank}.`,
    };
  } else {
    const { error: insertError } = await tryCatch(
      fivemDb.query("INSERT INTO lunar_multijob VALUES (?, ?, ?, ?, ?, ?)", [
        newjob.identifier,
        newjob.name,
        newjob.grade,
        newjob.active,
        newjob.total,
        newjob.week,
      ])
    );

    if (insertError) {
      return {
        success: false,
        message: "Failed to insert job into database: " + insertError.message,
      };
    }

    console.debug("Job inserted into database successfully.", newjob, fivemUser);

    env.DEBUG_LOG && (await interaction.editReply("Job inserted into database successfully."));
    return {
      success: true,
      message: `Successfully set ${user.username} to ${givenJob.name} rank ${rank}.`,
    };
  }
}
