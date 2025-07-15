import type { SlashCommandProps, CommandOptions } from "commandkit";
import { InteractionContextType, SlashCommandBuilder } from "discord.js";
import { globalCooldownKey, setCommandCooldown, userCooldownKey } from "../../Bot";
import { initialReply } from "../../utils/initialReply";
import FetchEnvs, { DEFAULT_OPTIONAL_STRING, envExists } from "../../utils/FetchEnvs";

// Import subcommands
import changeTags from "../../subcommands/fivem/tags";
import lookup from "../../subcommands/fivem/lookup";
import setCharacterName from "../../subcommands/fivem/name";
import playtimeLeaderboard from "../../subcommands/fivem/playtimeleaderboard";
import activityHistory from "../../subcommands/fivem/activity";
// Import event subcommands
import eventInfo from "../../subcommands/fivem/event/info";
import eventHistory from "../../subcommands/fivem/event/history";
import eventCreate from "../../subcommands/fivem/event/create";
import eventDelete from "../../subcommands/fivem/event/delete";
import eventUpload from "../../subcommands/fivem/event/upload";
import tawLink from "../../subcommands/fivem/link";
import { tryCatch } from "../../utils/trycatch";

const env = FetchEnvs();

// This command requires fivem systems, the taw command and a fivem mysql uri to be defined in the env
if (
  envExists(env.ENABLE_FIVEM_SYSTEMS) &&
  envExists(env.ENABLE_TAW_COMMAND) &&
  envExists(env.FIVEM_MYSQL_URI)
) {
  module.exports = {
    data: new SlashCommandBuilder()
      .setName("fivem")
      .setDescription("This is a template command.")
      .setContexts(InteractionContextType.Guild)
      .addSubcommand((subcommand) =>
        subcommand
          .setName("tags")
          .setDescription("Set your tags.")
          .addStringOption((option) =>
            option.setName("tags").setDescription("Your tags.").setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("location")
              .setDescription("The location of the tags (default: suffix)")
              .setRequired(false)
              .setChoices({ name: "Prefix", value: "prefix" }, { name: "Suffix", value: "suffix" })
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("lookup")
          .setDescription("Look up character information")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("User to look up (defaults to yourself)")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option.setName("public").setDescription("Show bot responses").setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("name")
          .setDescription("Set your Discord name to your character name")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("User to set name for (defaults to yourself)")
              .setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("name")
              .setDescription("Set your Discord name to this instead of your character name")
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option.setName("public").setDescription("Show bot responses").setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("playtime")
          .setDescription("Show the playtime leaderboard")
          .addIntegerOption((option) =>
            option
              .setName("limit")
              .setDescription("Number of players to show (default: 10, max: 25)")
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(25)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName("activity")
          .setDescription("View player activity history")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("User to check activity for (defaults to yourself)")
              .setRequired(false)
          )
          .addIntegerOption((option) =>
            option
              .setName("limit")
              .setDescription("Number of activity records to show (default: 10, max: 20)")
              .setRequired(false)
              .setMinValue(1)
              .setMaxValue(20)
          )
      )
      // .addSubcommand((subcommand) =>
      //   subcommand
      //     .setName("link")
      //     .setDescription("Link your TAW account to your Discord account")
      //     .addStringOption((option) =>
      //       option.setName("callsign").setDescription("Your TAW callsign").setRequired(true)
      //     )
      //     .addUserOption((option) =>
      //       option
      //         .setName("discorduser")
      //         .setDescription("User to link (defaults to yourself)")
      //         .setRequired(false)
      //     )
      // )
      // Add event subcommand group
      .addSubcommandGroup((group) =>
        group
          .setName("event")
          .setDescription("Manage in-game events")
          .addSubcommand((subcommand) =>
            subcommand.setName("info").setDescription("Lists all planned in-game events")
          )
          .addSubcommand((subcommand) =>
            subcommand.setName("history").setDescription("Lists your event participation history")
          )
          .addSubcommand((subcommand) =>
            subcommand.setName("create").setDescription("Create a new in-game event (Admin only)")
          )
          .addSubcommand((subcommand) =>
            subcommand
              .setName("delete")
              .setDescription("Delete an in-game event (Admin only)")
              .addIntegerOption((option) =>
                option
                  .setName("event_id")
                  .setDescription("The ID of the event to delete")
                  .setRequired(true)
              )
          )
          .addSubcommand((subcommand) =>
            subcommand.setName("upload").setDescription("Upload event timesheet data (Admin only)")
          )
      ),
    options: {
      devOnly: false,
      deleted: false,
    },

    async run(props: SlashCommandProps) {
      const { interaction, client, handler } = props;

      // Default to private responses
      let publicResponse = interaction.options.getBoolean("public") || false;

      const subcommand = interaction.options.getSubcommand(true);
      const subcommandGroup = interaction.options.getSubcommandGroup();
      const tags = interaction.options.getString("tags");
      const lookupUser = interaction.options.getUser("user");
      const limit = interaction.options.getInteger("limit") || 10;
      const name = interaction.options.getString("name");
      const eventId = interaction.options.getInteger("event_id");
      const tawUser = interaction.options.getString("callsign");
      const tawUserDiscord = interaction.options.getUser("discorduser");

      if (subcommand === "playtime") publicResponse = true;

      await initialReply(interaction, !publicResponse);

      let commandResult: { error: any; data: any } = { error: null, data: null };

      // Handle event subcommands
      if (subcommandGroup === "event") {
        if (subcommand === "info") {
          commandResult = await tryCatch(eventInfo(props));
        } else if (subcommand === "history") {
          commandResult = await tryCatch(eventHistory(props));
        } else if (subcommand === "create") {
          commandResult = await tryCatch(eventCreate(props));
        } else if (subcommand === "delete") {
          commandResult = await tryCatch(eventDelete(props, eventId));
        } else if (subcommand === "upload") {
          commandResult = await tryCatch(eventUpload(props));
        } else {
          await interaction.editReply("Unknown event subcommand.");
        }

        if (commandResult.error) {
          console.error("Error in event subcommand:", commandResult.error);
          await interaction.editReply(
            "An uncaught error occured while processing the event subcommand.\nDetails: " +
              commandResult.error
          );
        }
      } else {
        // Handle existing subcommands
        if (subcommand === "tags") {
          changeTags(tags, interaction);
        } else if (subcommand === "lookup") {
          setCommandCooldown(
            userCooldownKey(interaction.user.id, interaction.commandName),
            publicResponse ? 60 : 15
          );
          lookup(interaction, lookupUser);
        } else if (subcommand === "name") {
          setCommandCooldown(
            userCooldownKey(interaction.user.id, interaction.commandName),
            publicResponse ? 120 : 60
          );
          setCharacterName(interaction, lookupUser, name);
        } else if (subcommand === "playtime") {
          setCommandCooldown(globalCooldownKey(interaction.commandName), publicResponse ? 120 : 60);
          playtimeLeaderboard(interaction, limit);
        } else if (subcommand === "activity") {
          setCommandCooldown(
            globalCooldownKey(interaction.commandName),
            publicResponse ? 300 : 120
          );
          activityHistory(interaction, lookupUser, limit);
        } else if (subcommand === "link") {
          if (!envExists(env.TAW_API_KEY) || !envExists(env.TAW_API_URL)) {
            await interaction.editReply(
              "This function is not enabled. Please contact the server owner if you think this is a mistake."
            );
            return;
          }

          tryCatch(tawLink(interaction, tawUser, tawUserDiscord, env.TAW_API_KEY, env.TAW_API_URL));
        } else {
          await interaction.editReply("Unknown subcommand.");
        }
      }
    },
  };
} else {
  // Export an empty object or nothing at all when the feature is disabled
  module.exports = {};
}
