import { CommandInteraction, User } from "discord.js";
import { fivemPool } from "../../Bot";
import { tryCatch } from "../../utils/trycatch";
import FetchEnvs from "../../utils/FetchEnvs";
import log from "../../utils/log";
import { GetJobNameFromId } from "../../commands/fivem/managejobs";
const env = FetchEnvs();
// Character info from the players table
export interface CharacterInfo {
  birthdate: string;
  iban: number;
  firstname: string;
  lastname: string;
  nationality: string;
  account: string;
  gender: number;
  backstory: string;
  phone: string;
}

// Player identifiers from the player_identifiers table
export interface PlayerIdentifiers {
  license: string; // Now the primary key
  citizenid: string | null; // No longer the primary key, can be null
  discord: string | null;
  steam: string | null;
  fivem: string | null;
  ip: string | null;
  is_online: number;
  last_seen: number; // Timestamp as milliseconds since epoch
  last_updated: number; // Timestamp as milliseconds since epoch
  playtime_minutes: number; // Playtime in minutes
  last_active_data: string; // JSON string of activity data
}

// Represents a single activity record (join/leave event)
export interface ActivityRecord {
  type: "join" | "leave";
  time: number; // Unix timestamp
}

export interface FivemJob {
  identifier: string;
  name: string;
  grade: number;
  active: boolean;
  total: number; // Playtime mins
  week: number; // Playtime this week.
}

// Combined data for character processing
export interface CharacterData {
  citizenId: string;
  charInfoParsed: CharacterInfo;
  jobInfoParsed?: FivemJob[]; // Optional, only if includeJobInfo is true
  userToProcess: User;
  playerIdentifiers: PlayerIdentifiers;
}

/**
 * Represents a player entry for the playtime leaderboard
 */
export interface PlaytimeLeaderboardEntry {
  citizenid: string;
  firstname: string;
  lastname: string;
  playtime_minutes: number;
  discord_id: string | null;
}

/**
 * Format minutes into a readable time format (days, hours, minutes)
 */
export function formatPlaytime(minutes: number): string {
  const days = Math.floor(minutes / 1440); // 1440 minutes in a day
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
  if (remainingMinutes > 0 || parts.length === 0)
    parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`);

  return parts.join(", ");
}

/**
 * Parse the last_active_data JSON string into ActivityRecord array
 * @param jsonString The JSON string from the database
 * @returns Array of ActivityRecord objects sorted by time (newest first)
 */
export function parseActivityData(jsonString: string): ActivityRecord[] {
  try {
    if (!jsonString || jsonString === "[]") {
      return [];
    }

    const activityRecords = JSON.parse(jsonString) as ActivityRecord[];

    // Sort by time, newest first
    return activityRecords.sort((a, b) => b.time - a.time);
  } catch (error) {
    console.error("Error parsing activity data:", error);
    return [];
  }
}

/**
 * Format a timestamp to a readable date string
 * @param timestamp Unix timestamp, in seconds
 * @returns Formatted date string
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Get recent activity history for a player
 * @param activityRecords Array of activity records
 * @param limit Maximum number of records to return
 * @returns Formatted activity history
 */
export function getRecentActivityHistory(
  activityRecords: ActivityRecord[],
  limit: number = 5
): string {
  if (!activityRecords.length) {
    return "No activity records found.";
  }

  // Take only the most recent records up to the limit
  const recentRecords = activityRecords.slice(0, limit);

  return recentRecords
    .map((record) => {
      const action = record.type === "join" ? "🟢 Joined" : "🔴 Left";
      const time = formatTimestamp(record.time);
      return `${action} at ${time}`;
    })
    .join("\n");
}

/**
 * Get the top players by playtime
 * @param interaction The command interaction
 * @param limit The number of players to retrieve (default: 10)
 * @returns Array of PlaytimeLeaderboardEntry or null if error
 */
export async function getPlaytimeLeaderboard(
  interaction: CommandInteraction,
  limit: number = 10
): Promise<PlaytimeLeaderboardEntry[] | null> {
  env.DEBUG_LOG && (await interaction.editReply("Checking database connection..."));

  if (!fivemPool) {
    await interaction.editReply(
      "Database connection is not available. Please contact the server admin."
    );
    return null;
  }

  env.DEBUG_LOG &&
    interaction.editReply("Database connection is available. Creating connection thread...");

  const { data: fivemDb, error: dbConnectionError } = await tryCatch(fivemPool.getConnection());
  if (dbConnectionError) {
    await interaction.editReply(`Failed to connect to the database: ${dbConnectionError.message}`);
    return null;
  }

  try {
    // Query for top players by playtime
    env.DEBUG_LOG && (await interaction.editReply("Fetching playtime leaderboard data..."));

    // Join player_identifiers with players to get character names
    // Matching on citizenid which might now be null in player_identifiers
    const query = `
      SELECT pi.citizenid, pi.license, pi.playtime_minutes, pi.discord, 
             JSON_EXTRACT(p.charinfo, '$.firstname') AS firstname, 
             JSON_EXTRACT(p.charinfo, '$.lastname') AS lastname
      FROM player_identifiers pi
      JOIN players p ON pi.citizenid = p.citizenid
      WHERE pi.citizenid IS NOT NULL
      ORDER BY pi.playtime_minutes DESC
      LIMIT ?
    `;

    const { data: rows, error: queryError } = await tryCatch(fivemDb.query(query, [limit]));

    if (queryError) {
      await interaction.editReply(`Failed to execute query: ${queryError.message}`);
      return null;
    }

    env.DEBUG_LOG &&
      (await interaction.editReply(
        `Leaderboard data fetched. Processing ${rows?.length || 0} entries...`
      ));

    if (!rows?.length) {
      await interaction.editReply("No playtime data found.");
      return [];
    }

    // Process the results to clean up the data
    const leaderboard: PlaytimeLeaderboardEntry[] = rows.map((row: any) => {
      // Extract discord ID from the discord field (format: 'discord:123456789')
      const discordId = row.discord?.startsWith("discord:") ? row.discord.substring(8) : null;

      // Clean up the JSON extracted fields (they come with quotes)
      const firstname = row.firstname?.replace(/"/g, "") || "Unknown";
      const lastname = row.lastname?.replace(/"/g, "") || "Unknown";

      return {
        citizenid: row.citizenid,
        firstname,
        lastname,
        playtime_minutes: row.playtime_minutes || 0,
        discord_id: discordId,
      };
    });

    env.DEBUG_LOG && (await interaction.editReply("Leaderboard data processed successfully."));
    return leaderboard;
  } catch (error) {
    await interaction.editReply(`An unexpected error occurred: ${(error as Error).message}`);
    return null;
  } finally {
    // Always release the connection back to the pool
    fivemDb.release();
  }
}

interface CharacterFetchOptions {
  includeJobInfo?: boolean; // Whether to include job info in the response
}

/**
 * Get character information for a Discord user
 * @param interaction The command interaction
 * @param userToLookup The Discord user to lookup
 * @returns CharacterData object or null if not found/error
 */
export async function getCharacterInfo(
  interaction: CommandInteraction,
  userToLookup: User,
  options?: CharacterFetchOptions
): Promise<CharacterData | null> {
  // Check database connection
  env.DEBUG_LOG && (await interaction.editReply("Checking database connection..."));
  if (!fivemPool) {
    await interaction.editReply(
      "Database connection is not available. Please contact the server admin."
    );
    return null;
  }

  // Get database connection from pool
  env.DEBUG_LOG &&
    (await interaction.editReply(
      "Database connection is available. Creating connection thread..."
    ));
  const { data: fivemDb, error: dbConnectionError } = await tryCatch(fivemPool.getConnection());
  if (dbConnectionError) {
    await interaction.editReply(`Failed to connect to the database: ${dbConnectionError.message}`);
    return null;
  }

  try {
    // Query player_identifiers table to find the character by Discord ID
    // Using the discord index for faster search
    env.DEBUG_LOG &&
      (await interaction.editReply(`Executing query for user: ${userToLookup.username}...`));
    const discordIdentifier = `discord:${userToLookup.id}`;
    const { data: identifierRows, error: identifierQueryError } = await tryCatch(
      fivemDb.query(`SELECT * FROM player_identifiers WHERE discord = ?`, [discordIdentifier])
    );

    if (identifierQueryError) {
      await interaction.editReply(`Failed to execute query: ${identifierQueryError.message}`);
      return null;
    }

    env.DEBUG_LOG &&
      (await interaction.editReply(`Query executed. Found ${identifierRows?.length || 0} rows.`));

    // Check if user has a character
    const identifierRow = identifierRows?.[0] as PlayerIdentifiers | undefined;
    if (!identifierRow) {
      await interaction.editReply(
        `Character for ${userToLookup.username} was not found in the database. Please make sure they have logged into the server at least once and have created a character.`
      );
      return null;
    }

    // Get citizenId - now might be null in the schema
    const citizenId = identifierRow.citizenid;
    if (!citizenId) {
      await interaction.editReply(
        "Citizen ID was not found in the database. This is required to fetch character details. Please contact the server admin."
      );
      return null;
    }

    // Query players table to get character details
    env.DEBUG_LOG && (await interaction.editReply("Fetching character details..."));
    const { data: playerRows, error: playerError } = await tryCatch(
      fivemDb.query(`SELECT * FROM players WHERE citizenid = ?`, [citizenId])
    );

    if (playerError) {
      await interaction.editReply(`Failed to execute query: ${playerError.message}`);
      return null;
    }

    env.DEBUG_LOG &&
      (await interaction.editReply(`Query executed. Found ${playerRows?.length || 0} rows.`));
    const playerRow = playerRows?.[0];
    const charInfo = playerRow?.charinfo;

    if (!charInfo) {
      await interaction.editReply(
        "Character information was not found in the database. This should not happen. Please contact the server admin."
      );
      return null;
    }

    // Parse character info JSON
    const charInfoParsed = JSON.parse(charInfo) as CharacterInfo;
    env.DEBUG_LOG && (await interaction.editReply("Character information parsed."));

    let jobInfoParsed: FivemJob[] | [] = [];

    if (options?.includeJobInfo) {
      // Query fivem_jobs table to get job information
      env.DEBUG_LOG && (await interaction.editReply("Fetching job information..."));
      const { data: jobRows, error: jobError } = await tryCatch(
        fivemDb.query(`SELECT * FROM lunar_multijob WHERE identifier = ?`, [citizenId])
      );

      if (jobError) {
        await interaction.editReply(`Failed to execute job query: ${jobError.message}`);
        return null;
      }
      env.DEBUG_LOG &&
        (await interaction.editReply(`Job query executed. Found ${jobRows?.length || 0} rows.`));
      if (jobRows?.length > 0) {
        // Parse job info
        jobInfoParsed = jobRows.map((row: any) => ({
          identifier: row.identifier,
          name: GetJobNameFromId(row.name),
          grade: row.grade,
          active: row.active === 1, // Convert to boolean
          total: row.total || 0, // Default to 0 if null
          week: row.week || 0, // Default to 0 if null
        }));
      }
    }

    env.DEBUG_LOG && (await interaction.editReply("Job information processed."));

    // Return complete character data
    return {
      citizenId,
      charInfoParsed,
      jobInfoParsed,
      userToProcess: userToLookup,
      playerIdentifiers: identifierRow,
    };
  } catch (error) {
    await interaction.editReply(`An unexpected error occurred: ${(error as Error).message}`);
    return null;
  } finally {
    // Always release the connection back to the pool
    fivemDb.release();
  }
}

export type TawMemberData = TawMemberDataFound;

interface TawMemberDataFound {
  callsign: string;
  steamId?: string;
  rank?: string;
  rankDuration?: string;
  units?: string[];
  status?: string;
  location?: string;
  timeInTaw?: string;
  daysInTaw?: string;
  joinDate?: string;
  bio?: string;
  avatarUrl?: string;
}

export interface TawMemberFetchResponse {
  username: string;
  memberData: TawMemberData;
  rawHtml: string;
}
