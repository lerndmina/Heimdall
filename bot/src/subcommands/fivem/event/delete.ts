import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction } from "discord.js";
import BasicEmbed from "../../../utils/BasicEmbed";
import { SlashCommandProps } from "commandkit";
import { getDbConnection, hasEventPermission, getEventById } from "./commons";
import { tryCatch } from "../../../utils/trycatch";

/**
 * Admin command: Deletes an event with the given ID after confirmation
 */
export default async function eventDelete(props: SlashCommandProps, eventId: number | null) {
  const { interaction } = props;

  // Check permissions
  if (!(await hasEventPermission(props))) {
    return;
  }

  // Check that the event ID is valid
  if (!eventId || eventId <= 0) {
    await interaction.editReply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Invalid Event ID",
          "Please provide a valid event ID to delete."
        ),
      ],
      content: null,
    });
    return;
  }

  // Get database connection
  const { connection } = await getDbConnection(props);
  if (!connection) return;

  try {
    // Get event details
    const event = await getEventById(connection, eventId);

    if (!event) {
      await interaction.editReply({
        embeds: [
          BasicEmbed(interaction.client, "Event Not Found", `No event found with ID ${eventId}.`),
        ],
      });
      return;
    }

    // Create confirmation buttons
    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm-delete-${eventId}`)
      .setLabel("Yes, Delete Event")
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel-delete-${eventId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

    // Format dates for display
    const startTimeFormatted = event.event_scheduled_start
      ? `<t:${event.event_scheduled_start}:F>`
      : "Not scheduled";

    const endTimeFormatted = event.event_scheduled_end
      ? `<t:${event.event_scheduled_end}:F>`
      : "Not scheduled";

    // Send confirmation message
    const reply = await interaction.editReply({
      embeds: [
        BasicEmbed(
          interaction.client,
          "Confirm Event Deletion",
          `Are you sure you want to delete this event?\n\n` +
            `**Name:** ${event.event_name}\n` +
            `**ID:** ${event.event_id}\n` +
            `**Description:** ${event.event_description}\n` +
            `**Start Time:** ${startTimeFormatted}\n` +
            `**End Time:** ${endTimeFormatted}\n` +
            `**Status:** ${event.is_running ? "🟢 Running" : "⏱️ Scheduled"}\n\n` +
            `⚠️ **Warning:** This action cannot be undone. All event participation data will be permanently deleted.\n\n` +
            `-# Please note. This will time out after 1 minute if no action is taken. At that time the buttons will be removed.`
        ),
      ],
      components: [row],
      content: null,
    });

    // Wait for button interaction
    try {
      // Create collector for button interactions
      const filter = (i: any) =>
        i.user.id === interaction.user.id &&
        (i.customId === `confirm-delete-${eventId}` || i.customId === `cancel-delete-${eventId}`);

      const collector = reply.createMessageComponentCollector({
        filter,
        time: 60000, // 1 minute timeout
        max: 1,
      });

      collector.on("collect", async (buttonInteraction) => {
        if (buttonInteraction.customId === `confirm-delete-${eventId}`) {
          await buttonInteraction.deferUpdate();

          try {
            // First delete the participation records
            await connection.query("DELETE FROM wild_events_players WHERE event_id = ?", [eventId]);

            // Then delete the event itself
            await connection.query("DELETE FROM wild_events WHERE event_id = ?", [eventId]);

            // Then end the discord event
            const discordEvents = await interaction.guild?.scheduledEvents.fetch();
            const discordEvent = discordEvents?.find((e) => e.id === event.discord_event_id);
            let discordEventDeleteError = null;
            if (discordEvent) {
              const { data: _, error: deleteError } = await tryCatch(discordEvent.delete());
            }

            // Confirm deletion
            await buttonInteraction.editReply({
              embeds: [
                BasicEmbed(
                  buttonInteraction.client,
                  "Event Deleted",
                  `Event "${
                    event.event_name
                  }" (ID: ${eventId}) has been successfully deleted.\n-# You monster! 😱${
                    discordEventDeleteError
                      ? `\n\nI was unable to delete the discord event.\nError: ${discordEventDeleteError}`
                      : ""
                  }`
                ),
              ],
              components: [], // Remove buttons
            });
          } catch (error) {
            console.error("Error deleting event:", error);
            await buttonInteraction.editReply({
              embeds: [
                BasicEmbed(
                  buttonInteraction.client,
                  "Error",
                  "An error occurred while deleting the event. Please try again."
                ),
              ],
              components: [], // Remove buttons
            });
          }
        } else {
          // User cancelled
          await buttonInteraction.update({
            embeds: [
              BasicEmbed(
                buttonInteraction.client,
                "Deletion Cancelled",
                `Event "${event.event_name}" (ID: ${eventId}) was not deleted.`
              ),
            ],
            components: [], // Remove buttons
          });
        }
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "time" && collected.size === 0) {
          // Timeout - no button was pressed
          await interaction.editReply({
            embeds: [
              BasicEmbed(
                interaction.client,
                "Deletion Cancelled",
                "Event deletion was cancelled due to timeout."
              ),
            ],
            components: [], // Remove buttons
          });
        }
      });
    } catch (error) {
      console.error("Error with button collector:", error);
      await interaction.editReply({
        embeds: [
          BasicEmbed(
            interaction.client,
            "Error",
            "An error occurred while waiting for confirmation."
          ),
        ],
        components: [], // Remove buttons
      });
    }
  } catch (error) {
    console.error("Error in event deletion:", error);
    await interaction.editReply({
      embeds: [
        BasicEmbed(interaction.client, "Error", "Failed to delete event. Please try again later."),
      ],
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
