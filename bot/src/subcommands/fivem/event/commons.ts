import { CommandInteraction, GuildMember } from "discord.js";
import { fivemPool } from "../../../Bot";
import BasicEmbed from "../../../utils/BasicEmbed";
import { tryCatch } from "../../../utils/trycatch";
import canRunCommand, { checkPerms } from "../../../utils/canRunCommand";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { PoolConnection } from "mariadb";
import log from "../../../utils/log";
import TawLinks from "../../../models/TawLinks";

/**
 * Interface for event data from the wild_events table
 *
 * All times are in seconds since epoch
 */
export interface EventInfo {
  event_id: number;
  event_name: string;
  event_description: string;
  event_scheduled_start: number;
  event_actual_start: number | null;
  event_scheduled_end: number;
  event_actual_end: number | null;
  is_running: boolean;
  is_paused: boolean;
  discord_event_id: string | null;
}

/**
 * Interface for event participation data
 *
 * All times are in seconds since epoch
 */
export interface EventParticipation {
  participation_id: number;
  player_license: string;
  event_id: number;
  time_joined: number;
  time_left: number | null;
  time_spent_paused: number;
  time_participated: number | null;
  player_name?: string; // Optional when joined with player data
  discord: string; // Discord ID of the player
  taw_callsign?: string; // TAW callsign of the player if onlyTawUsers is true
}

/**
 * Check if the user has event management permissions
 */
export async function hasEventPermission(
  props: SlashCommandProps,
  permissionMessage: string = "You do not have permission to manage events."
): Promise<boolean> {
  const { interaction, client, handler } = props;
  const options: CommandOptions = {
    userPermissions: ["ManageEvents"],
  };

  const member = interaction.member as GuildMember;
  if (!member) {
    await interaction.editReply({
      embeds: [BasicEmbed(client, "Permission Denied", permissionMessage)],
      content: null,
    });
    return false;
  }

  if (options.userPermissions && !checkPerms(member, options.userPermissions)) {
    await interaction.editReply({
      embeds: [BasicEmbed(client, "Permission Denied", permissionMessage)],
      content: null,
    });
    return false;
  } else {
    return true;
  }
}

/**
 * Get a database connection with error handling
 */
export async function getDbConnection(props: SlashCommandProps) {
  const { interaction } = props;

  if (!fivemPool) {
    await interaction.editReply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Database Connection Error",
          "The fivem pool is not connected. Please contact an admin."
        ),
      ],
      content: null,
    });
    return { connection: null };
  }

  const { data: connection, error: connectionError } = await tryCatch(fivemPool.getConnection());

  if (!connection) {
    await interaction.editReply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Database Connection Error",
          "Failed to connect to the database. Please try again later.\n```\n" +
            connectionError +
            "\n```"
        ),
      ],
      content: null,
    });
    return { connection: null };
  }

  return { connection };
}

/**
 * Get a player's FiveM license from their Discord ID
 */
export async function getPlayerLicenseFromDiscord(
  connection: PoolConnection,
  discordId: string
): Promise<string | null> {
  try {
    const licenseResults = await connection.query(
      `SELECT * FROM player_identifiers WHERE discord = ?`,
      [`discord:${discordId}`]
    );

    log.debug(
      `[TawEvents Commons]`,
      `Performing player lookup and found: ${licenseResults.length} result(s).`,
      { discordId, license: licenseResults[0].license }
    );

    if (!Array.isArray(licenseResults) || licenseResults.length === 0) {
      return null;
    }

    return licenseResults[0].license;
  } catch (error) {
    console.error("Error getting player license:", error);
    return null;
  }
}

/**
 * Get event by ID
 */
export async function getEventById(connection: any, eventId: number): Promise<EventInfo | null> {
  log.debug("[TawEvents Commons]", `Fetching event with ID: ${eventId}`);

  try {
    const events = await connection.query("SELECT * FROM wild_events WHERE event_id = ?", [
      eventId,
    ]);

    if (!Array.isArray(events) || events.length === 0) {
      log.debug("[TawEvents Commons]", `No event found with ID: ${eventId}`);
      return null;
    }

    log.debug("[TawEvents Commons]", `Found event with ID: ${eventId}`, events[0]);
    return events[0] as EventInfo;
  } catch (error) {
    log.debug("[TawEvents Commons]", `Error fetching event with ID: ${eventId}`, {
      eventId,
      error,
    });
    console.error("Error getting event:", error);
    return null;
  }
}

/**
 * Get upcoming events
 */
export async function getUpcomingEvents(connection: any): Promise<EventInfo[]> {
  log.debug("[TawEvents Commons]", `Fetching upcoming events`);

  const nowSeconds = Math.floor(Date.now() / 1000);

  try {
    const events = await connection.query(
      `SELECT * FROM wild_events 
       WHERE event_scheduled_end > ${nowSeconds} OR event_scheduled_end IS NULL OR is_running = 1
       ORDER BY event_scheduled_start ASC`
    );

    if (!Array.isArray(events) || events.length === 0) {
      log.debug("[TawEvents Commons]", `No upcoming events found`);
      return [];
    }

    // Filter out events that have already ended (based on actual_end if it exists)
    const filteredEvents = events.filter((event: EventInfo) => {
      if (event.is_running) {
        return true; // Event is currently running
      }

      const currentTime = Math.floor(Date.now() / 1000);
      log.debug(
        "[TawEvents Commons]",
        `Event ID: ${event.event_id}, Scheduled End: ${event.event_scheduled_end}, Actual End: ${event.event_actual_end} current seconds: ${currentTime}`,
        { event }
      );

      // If event has an actual end time, it has already ended
      if (event.event_actual_end !== null) {
        return false;
      }

      // Otherwise, check the scheduled end time
      return event.event_scheduled_end === null || event.event_scheduled_end > currentTime;
    });

    log.debug("[TawEvents Commons]", `Found ${filteredEvents.length} upcoming events`);
    return filteredEvents as EventInfo[];
  } catch (error) {
    log.debug("[TawEvents Commons]", `Error fetching upcoming events`, { error });
    console.error("Error getting upcoming events:", error);
    return [];
  }
}

/**
 * Get player's event participation history
 */
export async function getPlayerEventHistory(
  connection: any,
  playerLicense: string
): Promise<EventParticipation[]> {
  log.debug("[TawEvents Commons]", `Fetching event history for player license: ${playerLicense}`);

  try {
    const history = await connection.query(
      `SELECT 
        ep.participation_id,
        ep.event_id,
        ep.time_joined,
        ep.time_left,
        ep.time_spent_paused,
        ep.time_participated,
        e.event_name,
        e.event_description,
        e.event_scheduled_start,
        e.event_actual_start,
        e.event_scheduled_end,
        e.event_actual_end
      FROM 
        wild_events_players ep
      JOIN
        wild_events e ON ep.event_id = e.event_id
      WHERE 
        ep.player_license = ?
      ORDER BY 
        ep.time_joined DESC`,
      [playerLicense]
    );

    log.debug(
      "[TawEvents Commons]",
      `Found ${history?.length || 0} event participation records for player: ${playerLicense}`,
      history
    );

    if (!Array.isArray(history) || history.length === 0) {
      log.debug("[TawEvents Commons]", `No event history found for player: ${playerLicense}`);
      return [];
    }

    return history as EventParticipation[];
  } catch (error) {
    log.debug("[TawEvents Commons]", `Error fetching player event history: ${error}`, {
      playerLicense,
      error,
    });
    console.error("Error getting player event history:", error);
    return [];
  }
}

/**
 * Get all events with participants
 */
export async function getEventsWithParticipants(
  connection: any,
  onlyCompleted: boolean = true
): Promise<EventInfo[]> {
  try {
    // The timestamps are stored in seconds, not milliseconds
    const currentTime = Math.floor(Date.now() / 1000);

    // An event is completed if:
    // 1. It has an actual end time (event_actual_end IS NOT NULL), OR
    // 2. Its scheduled end time has passed (event_scheduled_end < current time in seconds)
    const whereClause = onlyCompleted
      ? `WHERE e.event_actual_end IS NOT NULL OR e.event_scheduled_end < ${currentTime}`
      : "";

    const events = await connection.query(`
      SELECT DISTINCT e.* 
      FROM wild_events e
      JOIN wild_events_players ep ON e.event_id = ep.event_id
      ${whereClause}
      ORDER BY e.event_id DESC
    `);

    if (!Array.isArray(events) || events.length === 0) {
      return [];
    }

    return events as EventInfo[];
  } catch (error) {
    console.error("Error getting events with participants:", error);
    return [];
  }
}

type getEventParticipantsExtraData = {
  onlyTawUsers?: boolean;
};

/**
 * Get participants for an event
 */
export async function getEventParticipants(
  connection: any,
  eventId: number,
  extraData: getEventParticipantsExtraData = {}
): Promise<EventParticipation[]> {
  log.debug("[TawEvents Commons]", `Fetching participants for event ID: ${eventId}`);

  try {
    const participants = await connection.query(
      `
      SELECT 
        ep.player_license, 
        u.name as player_name,
        ep.event_id,
        e.event_name,
        ep.time_joined,
        ep.time_left,
        ep.time_participated,
        pid.discord
      FROM 
        wild_events_players ep
      JOIN
        wild_events e ON ep.event_id = e.event_id
      JOIN
        players u ON ep.player_license = u.license
      JOIN 
        player_identifiers pid ON pid.license = ep.player_license
      WHERE 
        ep.event_id = ?
    `,
      [eventId]
    );

    if (!Array.isArray(participants) || participants.length === 0) {
      log.debug("[TawEvents Commons]", `No participants found for event ID: ${eventId}`);
      return [];
    }

    log.debug(
      "[TawEvents Commons]",
      `Found ${participants.length} participants for event ID: ${eventId}`,
      participants
    );

    // Filter out non-TAW users if requested
    if (extraData.onlyTawUsers) {
      for (const participant of participants) {
        if (!participant.discord) {
          log.debug(
            "[TawEvents Commons]",
            `Participant ${participant.player_license} has no Discord ID, skipping taw user check.`,
            participant
          );
          participants.splice(participants.indexOf(participant), 1);
        } else {
          const discordId = participant.discord.split(":")[1];
          const tawUser = await TawLinks.findOne({ discordUserId: discordId });
          if (!tawUser || tawUser.discordUserId !== discordId) {
            log.debug(
              "[TawEvents Commons]",
              `Participant ${participant.player_license} is not a TAW user, skipping.`,
              participant
            );
            participants.splice(participants.indexOf(participant), 1);
          } else {
            log.debug(
              "[TawEvents Commons]",
              `Participant ${participant.player_license} is a TAW user.`,
              { ...participant, callsign: tawUser.tawUserCallsign }
            );
            participant.taw_callsign = tawUser.tawUserCallsign;
          }
        }
      }
    }

    return participants as EventParticipation[];
  } catch (error) {
    log.debug("[TawEvents Commons]", `Error fetching participants for event ID: ${eventId}`, {
      eventId,
      error,
    });
    console.error("Error getting event participants:", error);
    return [];
  }
}

/**
 * Format event duration in seconds to a human-readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  let formattedTime = "";
  if (hours > 0) formattedTime += `${hours} hour${hours > 1 ? "s" : ""} `;
  if (minutes > 0) formattedTime += `${minutes} minute${minutes > 1 ? "s" : ""} `;
  if (remainingSeconds > 0 || formattedTime === "")
    formattedTime += `${remainingSeconds} second${remainingSeconds > 1 ? "s" : ""} `;

  return formattedTime.trim();
}

/**
 * Parse a date-time string in format DD/MM/YYYY HH:MM
 */
export function parseDateTime(dateTimeStr: string): Date | null {
  try {
    const match = dateTimeStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{1,2})$/);
    if (!match) return null;

    const [_, day, month, year, hours, minutes] = match;
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1, // JavaScript months are 0-indexed
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      0 // No seconds in the input format
    );

    if (isNaN(date.getTime())) return null;
    return date;
  } catch (error) {
    return null;
  }
}

/**
 * Parse a duration string like "3h 20m 30s" into seconds
 */
export function parseDuration(durationStr: string): number {
  let totalSeconds = 0;

  const hoursMatch = durationStr.match(/(\d+)h/);
  if (hoursMatch) totalSeconds += parseInt(hoursMatch[1]) * 3600;

  const minutesMatch = durationStr.match(/(\d+)m/);
  if (minutesMatch) totalSeconds += parseInt(minutesMatch[1]) * 60;

  const secondsMatch = durationStr.match(/(\d+)s/);
  if (secondsMatch) totalSeconds += parseInt(secondsMatch[1]);

  return totalSeconds;
}
