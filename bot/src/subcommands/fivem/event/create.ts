import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  MessageComponentInteraction,
  GuildScheduledEvent,
  MessageFlags,
} from "discord.js";
import BasicEmbed from "../../../utils/BasicEmbed";
import { SlashCommandProps } from "commandkit";
import {
  getDbConnection,
  hasEventPermission,
  parseDateTime,
  parseDuration,
  formatDuration,
} from "./commons";

/**
 * Admin command: Creates a new event with a wizard interface
 */
export default async function eventCreate(props: SlashCommandProps) {
  const { interaction } = props;

  // Check permissions
  if (!(await hasEventPermission(props))) {
    return;
  }

  const buttoneventId = interaction.user.id + "-start-event-creation" + interaction.id;

  // Create a button to start the event creation process
  const createEventButton = new ButtonBuilder()
    .setCustomId(interaction.user.id + "-start-event-creation-" + interaction.id)
    .setLabel("Create New Event")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(createEventButton);

  // Send the initial message with button
  const reply = await interaction.editReply({
    embeds: [
      BasicEmbed(
        interaction.client,
        "Event Creation",
        "Click the button below to start creating a new event. You will have 10 mins to fill out the form."
      ),
    ],
    components: [row],
    content: null,
  });

  // Create a collector for the button interaction
  const collectorFilter = (i: MessageComponentInteraction) => i.user.id === interaction.user.id;
  const collector = reply.createMessageComponentCollector({
    filter: collectorFilter,
    time: 5 * 60 * 1000,
  });

  collector?.on("collect", async (interaction) => {
    // Assert the interaction as ButtonInteraction
    await showEventCreationModal(interaction as ButtonInteraction, props);
  });

  collector?.on("end", (collected) => {
    if (collected.size === 0) {
      interaction
        .editReply({
          embeds: [
            BasicEmbed(
              interaction.client,
              "Event Creation Timeout",
              "The event creation process timed out. Please try again if you still want to create an event."
            ),
          ],
          components: [], // Remove the button since it's no longer active
          content: null,
        })
        .catch(console.error);
    }
  });
}

/**
 * Shows the event creation modal when the button is clicked
 */
async function showEventCreationModal(
  buttonInteraction: ButtonInteraction,
  props: SlashCommandProps
) {
  // Create the modal for event creation
  const modal = new ModalBuilder()
    .setCustomId("event-create-modal-" + buttonInteraction.id)
    .setTitle("Create New Event");

  // Add inputs for event details
  const nameInput = new TextInputBuilder()
    .setCustomId("event-name")
    .setLabel("Event Name")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Enter event name")
    .setRequired(true)
    .setMaxLength(100);

  const descriptionInput = new TextInputBuilder()
    .setCustomId("event-description")
    .setLabel("Event Description")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Enter event description")
    .setRequired(true)
    .setMaxLength(1000);

  const startTimeInput = new TextInputBuilder()
    .setCustomId("event-start-time")
    .setLabel("Start Time (DD/MM/YYYY HH:MM)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. DD/MM/YYYY HH:MM")
    .setRequired(true);

  const durationInput = new TextInputBuilder()
    .setCustomId("event-duration")
    .setLabel("Duration (e.g. 3h 20m 30s)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. 2h 30m")
    .setRequired(true);

  // Add inputs to action rows (required for modals)
  const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
  const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
  const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(startTimeInput);
  const fourthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput);

  // Add rows to the modal
  modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

  // Show the modal to the user
  await buttonInteraction.showModal(modal);

  try {
    // Wait for modal submission
    const filter = (i: any) => i.customId === "event-create-modal-" + buttonInteraction.id;
    const modalResponse = await buttonInteraction.awaitModalSubmit({ filter, time: 600000 }); // 5 minute timeout

    // Process form submission
    await handleModalSubmit(modalResponse, props);
  } catch (error) {
    console.error("Modal submission error or timeout:", error);
    // We don't need to notify the user if they simply closed the modal without submitting
  }
}

/**
 * Handles the modal submission for event creation
 */
async function handleModalSubmit(modalSubmit: ModalSubmitInteraction, props: SlashCommandProps) {
  await modalSubmit.deferReply({ flags: [MessageFlags.Ephemeral] });

  // Get database connection
  const { connection } = await getDbConnection({
    interaction: modalSubmit as any,
    client: props.client,
    handler: props.handler,
  } as SlashCommandProps);

  if (!connection) return;

  try {
    // Extract form values
    const eventName = modalSubmit.fields.getTextInputValue("event-name");
    const eventDescription = modalSubmit.fields.getTextInputValue("event-description");
    const startTimeString = modalSubmit.fields.getTextInputValue("event-start-time");
    const durationString = modalSubmit.fields.getTextInputValue("event-duration");

    // Parse start time
    let startTime = parseDateTime(startTimeString);
    if (!startTime) {
      await modalSubmit.editReply({
        embeds: [
          BasicEmbed(
            modalSubmit.client,
            "Invalid Date Format",
            "Please use the format DD/MM/YYYY HH:MM\n\n" +
              "Your inputs were:\n" +
              "**Event Name:**\n```" +
              eventName +
              "```\n" +
              "**Event Description:**\n```" +
              eventDescription +
              "```\n" +
              "**Start Time:**\n```" +
              startTimeString +
              "```\n" +
              "**Duration:**\n```" +
              durationString +
              "```"
          ),
        ],
        content: null,
      });
      return;
    }

    // Check if the start time is in the past
    const now = new Date();
    let pastTimeAdjusted = false;
    if (startTime < now) {
      // If start time is in the past, set it to now (plus a minute to be safe)
      startTime = new Date(now.getTime() + 60000); // Add 1 minute to current time
      pastTimeAdjusted = true;
    }

    // Parse duration
    const durationSeconds = parseDuration(durationString);
    if (durationSeconds <= 0) {
      await modalSubmit.editReply({
        embeds: [
          BasicEmbed(
            modalSubmit.client,
            "Invalid Duration Format",
            "Please use a format like '3h 20m 30s'\n\n" +
              "Your inputs were:\n" +
              "**Event Name:**\n```" +
              eventName +
              "```\n" +
              "**Event Description:**\n```" +
              eventDescription +
              "```\n" +
              "**Start Time:**\n```" +
              startTimeString +
              "```\n" +
              "**Duration:**\n```" +
              durationString +
              "```"
          ),
        ],
        content: null,
      });
      return;
    }

    // Calculate end time
    const startTimeUnix = Math.floor(startTime.getTime() / 1000);
    const endTimeUnix = startTimeUnix + durationSeconds;
    const endTime = new Date(endTimeUnix * 1000);

    // Get guild from interaction for creating Discord event
    const guild = modalSubmit.guild;
    if (!guild) {
      await modalSubmit.editReply({
        embeds: [
          BasicEmbed(modalSubmit.client, "Error", "This command can only be used in a guild."),
        ],
        content: null,
      });
      return;
    }

    // Create Discord scheduled event
    // Define interface for Discord event
    let discordEvent: GuildScheduledEvent | null = null;
    try {
      discordEvent = await guild.scheduledEvents.create({
        name: eventName,
        description: eventDescription,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: {
          location: "In-Game Event",
        },
      });
    } catch (error) {
      console.error("Failed to create Discord event:", error);
      await modalSubmit.editReply({
        embeds: [
          BasicEmbed(
            modalSubmit.client,
            "Discord Event Creation Failed",
            "Failed to create Discord event. Please check if your inputs are valid and try again.\n\n" +
              "Your inputs were:\n" +
              "**Event Name:**\n```" +
              eventName +
              "```\n" +
              "**Event Description:**\n```" +
              eventDescription +
              "```\n" +
              "**Start Time:**\n```" +
              startTimeString +
              "```\n" +
              "**Duration:**\n```" +
              durationString +
              "```"
          ),
        ],
        content: null,
      });
      return;
    }

    // Insert event into database
    try {
      // Log the query parameters for debugging
      console.log("Event database insertion parameters:", {
        eventName,
        eventDescription,
        startTimeUnix,
        endTimeUnix,
      });

      const result = await connection.query(
        `INSERT INTO wild_events (
          event_name,
          event_description,
          event_scheduled_start,
          event_scheduled_end,
          discord_event_id
        ) VALUES (?, ?, ?, ?, ?)`,
        [eventName, eventDescription, startTimeUnix, endTimeUnix, discordEvent.id]
      );

      // Debug log the result
      console.log("Database insertion result:", result);

      // Check if we have a valid result with an insertId
      let eventId = null;
      if (result && typeof result === "object") {
        if ("insertId" in result) {
          eventId = result.insertId;
        } else if (Array.isArray(result) && result[0] && "insertId" in result[0]) {
          eventId = result[0].insertId;
        }
      }

      // If we have an eventId, the insertion was successful
      if (eventId !== null && eventId !== undefined) {
        // Construct the success message
        let successMessage =
          `Your event "${eventName}" has been created!\n\n` +
          `**Event ID:** ${eventId}\n` +
          `**Start Time:** <t:${startTimeUnix}:F>\n` +
          `**End Time:** <t:${endTimeUnix}:F>\n` +
          `**Duration:** ${formatDuration(durationSeconds)}\n` +
          `**Discord Event:** ${discordEvent ? discordEvent.url : "Failed"}`;

        // Add a note if the start time was adjusted
        if (pastTimeAdjusted) {
          successMessage += `\n\n**Note:** Your original start time was in the past. The event has been scheduled to start now.`;
        }

        // Confirm successful creation
        await modalSubmit.editReply({
          embeds: [BasicEmbed(modalSubmit.client, "Event Created Successfully", successMessage)],
          content: null,
        });
        return;
      } else {
        throw new Error("Database insertion did not return a valid ID");
      }
    } catch (error) {
      console.error("Failed to insert event into database:", error);

      // Try to delete the Discord event if we failed to save to the database
      if (discordEvent) {
        try {
          await discordEvent.delete();
        } catch (deleteError) {
          console.error("Failed to delete Discord event after database error:", deleteError);
        }
      }

      await modalSubmit.editReply({
        embeds: [
          BasicEmbed(
            modalSubmit.client,
            "Database Error",
            "Failed to save the event to the database. The Discord event has been removed.\n\n" +
              "Your inputs were:\n" +
              "**Event Name:**\n```" +
              eventName +
              "```\n" +
              "**Event Description:**\n```" +
              eventDescription +
              "```\n" +
              "**Start Time:**\n```" +
              startTimeString +
              "```\n" +
              "**Duration:**\n```" +
              durationString +
              "```"
          ),
        ],
        content: null,
      });
    }
  } catch (error) {
    console.error("Error processing modal submission:", error);
    await modalSubmit.editReply({
      embeds: [
        BasicEmbed(modalSubmit.client, "Error", "An error occurred while creating the event."),
      ],
      content: null,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
