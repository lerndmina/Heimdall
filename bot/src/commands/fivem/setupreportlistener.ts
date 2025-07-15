import { ChannelType, SlashCommandBuilder } from "discord.js";
import FetchEnvs from "../../utils/FetchEnvs";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { report } from "process";
import Database from "../../utils/data/database";
import FivemReportListener from "../../models/FivemReportListener";

const env = FetchEnvs();
const db = new Database();

if (env.ENABLE_FIVEM_SYSTEMS) {
  module.exports = {
    data: new SlashCommandBuilder()
      .setName("setupreportlistener")
      .setDescription("Setup the report listener for FiveM servers")
      .addChannelOption((option) =>
        option
          .setName("listenchannel")
          .setDescription("The channel to listen to reports from")
          .setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName("reportchannel")
          .setDescription("The channel to send reports to if different from the listening channel")
          .setRequired(false)
      )
      .addStringOption((option) =>
        option
          .setName("prefix")
          .setDescription(
            "The prefix to look for in the listning channel, defaults to 'ZeroBugReportSystem:'"
          )
          .setRequired(false)
      )
      .addRoleOption((option) =>
        option
          .setName("role")
          .setDescription("The role to ping when a report is made")
          .setRequired(false)
      ),
    options: {
      devOnly: true,
      deleted: false,
      userPermissions: ["Administrator"],
    } as CommandOptions,
    async run({ interaction, client, handler }: SlashCommandProps) {
      const listenChannel = interaction.options.getChannel("listenchannel");
      let reportChannel = interaction.options.getChannel("reportchannel") || listenChannel;
      const prefix = interaction.options.getString("prefix") || "ZeroBugReportSystem:";
      const role = interaction.options.getRole("role");

      if (!listenChannel) {
        await interaction.reply({
          content: "Please provide a valid channel to listen to",
          ephemeral: true,
        });
        return;
      }

      if (!reportChannel) {
        reportChannel = listenChannel;
      }

      if (listenChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "The listening channel must be a text channel",
          ephemeral: true,
        });
        return;
      }

      if (reportChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "The report channel must be a text channel",
          ephemeral: true,
        });
        return;
      }

      await db.findOneAndUpdate(
        FivemReportListener,
        { reportChannelId: reportChannel.id, listenChannelId: listenChannel.id },
        {
          reportChannelId: reportChannel.id,
          listenChannelId: listenChannel.id,
          prefix: prefix,
          roleId: role ? role.id : null,
        },
        { upsert: true, new: true }
      );

      await interaction.reply({
        content: `Report listener setup successfully! Listening to ${listenChannel} and sending reports to ${reportChannel}`,
        ephemeral: true,
      });
    },
  };
}
