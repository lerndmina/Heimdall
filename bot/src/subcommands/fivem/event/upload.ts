import { AttachmentBuilder } from "discord.js";
import BasicEmbed from "../../../utils/BasicEmbed";
import { SlashCommandProps } from "commandkit";
import {
  getDbConnection,
  hasEventPermission,
  getEventsWithParticipants,
  getEventParticipants,
} from "./commons";
import log from "../../../utils/log";

/**
 * Admin command: Uploads event participation data as a CSV
 */
export default async function eventUpload(props: SlashCommandProps) {
  const { interaction } = props;

  // Check permissions
  if (!(await hasEventPermission(props))) {
    return;
  }

  // Get database connection
  const { connection } = await getDbConnection(props);
  if (!connection) return;

  try {
    // Log the current time to help diagnose timestamp issues
    const currentTimeSecs = Math.floor(Date.now() / 1000);
    log.debug("[TawEvents Upload]", `Current timestamp (seconds): ${currentTimeSecs}`);

    // Get all events with participants first (without filtering for completed)
    const allEvents = await getEventsWithParticipants(connection, false);
    log.debug(
      "[TawEvents Upload]",
      `Found ${allEvents.length} events with participants (including uncompleted)`
    );

    // Debug info about all events
    if (allEvents.length > 0) {
      for (const event of allEvents) {
        log.debug(
          "[TawEvents Upload]",
          `Event ${event.event_id} (${event.event_name}) - ` +
            `scheduled_end: ${event.event_scheduled_end}, ` +
            `actual_end: ${event.event_actual_end}, ` +
            `is_running: ${event.is_running}`
        );
      }
    }

    // Try to use all events that have participation data first
    let eventsToUse = allEvents;
    let messagePrefix = "";

    // Get only completed events with participants if we have any
    const completedEvents = await getEventsWithParticipants(connection, true);
    log.debug(
      "[TawEvents Upload]",
      `Found ${completedEvents.length} completed events with participants`
    );

    // If we have completed events, use those instead
    if (completedEvents.length > 0) {
      eventsToUse = completedEvents;
    } else {
      messagePrefix =
        "Note: No completed events found. Including all events with participation data.\n\n";
    }

    if (eventsToUse.length === 0) {
      await interaction.editReply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "No Events to Upload",
            "There are no events with participation data to upload.\n\n" +
              `Current server time (seconds): ${currentTimeSecs}`
          ),
        ],
        content: null,
      });
      return;
    }

    // Generate CSV data for all events with participation data
    let csvContent =
      "Player_License,Name,Event_ID,Event_Name,Time_Joined,Time_Left,Time_Participated_Seconds,Time_Participated_Minutes,Taw_Callsign\n";
    let totalParticipants = 0;

    for (const event of eventsToUse) {
      // Get participants for each event
      const participants = await getEventParticipants(connection, event.event_id, {
        onlyTawUsers: true,
      });
      log.debug(
        "[TawEvents Upload]",
        `Event ${event.event_id} has ${participants.length} participants`
      );
      totalParticipants += participants.length;

      if (participants.length > 0) {
        for (const participant of participants) {
          // Calculate time participated in minutes (rounding to nearest minute)
          const timeParticipatedMinutes = participant.time_participated
            ? Math.round(participant.time_participated / 60)
            : 0;

          // Format CSV row
          csvContent += `${participant.player_license},`;
          csvContent += `${participant.player_name || "Unknown"},`;
          csvContent += `${participant.event_id},`;
          csvContent += `"${event.event_name.replace(/"/g, '""')}",`; // Escape quotes in CSV
          csvContent += `${participant.time_joined},`;
          csvContent += `${participant.time_left || ""},`;
          csvContent += `${participant.time_participated || ""},`;
          csvContent += `${timeParticipatedMinutes},`;
          // Add TAW Callsign if available
          if (participant.taw_callsign) {
            csvContent += `${participant.taw_callsign}\n`;
          } else {
            csvContent += `UNKNOWN\n`;
          }
        }
      }
    }

    // Create a timestamp for the filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    // Create file attachment with the CSV data
    const attachment = new AttachmentBuilder(Buffer.from(csvContent, "utf-8"), {
      name: `event-participation-${timestamp}.csv`,
    });

    // Send the CSV file
    await interaction.editReply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Event Participation Data",
          `${messagePrefix}Generated CSV file containing participation data for ${eventsToUse.length} event(s) with ${totalParticipants} total participant records.`
        ),
      ],
      files: [attachment],
      content: null,
    });
  } catch (error) {
    console.error("Error generating event participation data:", error);
    await interaction.editReply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Error",
          "Failed to generate event participation data. Please try again later."
        ),
      ],
      content: null,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
