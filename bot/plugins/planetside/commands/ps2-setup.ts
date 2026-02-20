/**
 * /ps2-setup — Configure PlanetSide 2 integration (admin)
 */

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type { CommandContext } from "../../../src/core/CommandManager.js";
import type { PlanetSidePluginAPI } from "../index.js";
import PlanetSideConfig from "../models/PlanetSideConfig.js";
import { createLogger } from "../../../src/core/Logger.js";

const log = createLogger("planetside:setup");

export const data = new SlashCommandBuilder()
  .setName("ps2-setup")
  .setDescription("Configure PlanetSide 2 integration for this server")
  .addSubcommand((sub) =>
    sub
      .setName("enable")
      .setDescription("Enable PlanetSide 2 integration")
      .addStringOption((opt) => opt.setName("outfit-tag").setDescription("Your outfit tag (e.g. KOTV)").setRequired(false))
      .addRoleOption((opt) => opt.setName("member-role").setDescription("Role to assign to outfit members").setRequired(false))
      .addRoleOption((opt) => opt.setName("guest-role").setDescription("Role to assign to non-outfit members").setRequired(false)),
  )
  .addSubcommand((sub) => sub.setName("disable").setDescription("Disable PlanetSide 2 integration"))
  .addSubcommand((sub) => sub.setName("config").setDescription("View current configuration"))
  .addSubcommand((sub) =>
    sub
      .setName("panel")
      .setDescription("Send the PS2 linking panel to a channel")
      .addChannelOption((opt) => opt.setName("channel").setDescription("Channel to post the linking panel in").setRequired(true))
      .addStringOption((opt) => opt.setName("title").setDescription("Custom embed title (default: 'Get your role!')").setRequired(false))
      .addStringOption((opt) => opt.setName("description").setDescription("Custom description — use {memberRole}, {guestRole}, {outfitTag}, {outfitName}").setRequired(false))
      .addStringOption((opt) => opt.setName("color").setDescription("Embed color as hex (e.g. #de3b79)").setRequired(false))
      .addStringOption((opt) => opt.setName("footer").setDescription("Custom footer text").setRequired(false))
      .addBooleanOption((opt) => opt.setName("show-author").setDescription("Show bot as embed author (default: true)").setRequired(false))
      .addBooleanOption((opt) => opt.setName("show-timestamp").setDescription("Show timestamp on embed (default: true)").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("roles")
      .setDescription("Configure role assignments")
      .addRoleOption((opt) => opt.setName("member-role").setDescription("Role for outfit members").setRequired(false))
      .addRoleOption((opt) => opt.setName("guest-role").setDescription("Role for non-outfit members").setRequired(false))
      .addRoleOption((opt) => opt.setName("promotion-role").setDescription("Role for members needing promotion").setRequired(false)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("outfit")
      .setDescription("Set the outfit to track")
      .addStringOption((opt) => opt.setName("tag").setDescription("Outfit tag (e.g. KOTV)").setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName("channels")
      .setDescription("Configure log and status channels")
      .addChannelOption((opt) => opt.setName("log").setDescription("Channel for link/unlink logs").setRequired(false))
      .addChannelOption((opt) => opt.setName("census-status").setDescription("Channel for Census API status").setRequired(false)),
  );

export const config = { allowInDMs: false };

export const permissions = {
  label: "PS2 Setup",
  description: "Configure PlanetSide 2 integration",
  defaultAllow: false,
};

export async function execute(context: CommandContext): Promise<void> {
  const { interaction, getPluginAPI } = context;
  await interaction.deferReply({ ephemeral: true });

  const pluginAPI = getPluginAPI<PlanetSidePluginAPI>("planetside");
  if (!pluginAPI) {
    await interaction.editReply("❌ PlanetSide plugin not loaded.");
    return;
  }

  const guildId = interaction.guildId!;
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "enable") {
    const outfitTag = interaction.options.getString("outfit-tag");
    const memberRole = interaction.options.getRole("member-role");
    const guestRole = interaction.options.getRole("guest-role");

    // If outfit tag provided, resolve it
    let outfitId: string | undefined;
    let outfitName: string | undefined;

    if (outfitTag) {
      const ps2Config = await PlanetSideConfig.findOne({ guildId }).lean();
      const outfits = await pluginAPI.apiService.getOutfitByTag(outfitTag, ps2Config?.honuBaseUrl);
      if (outfits && outfits.length > 0) {
        outfitId = outfits[0]!.id;
        outfitName = outfits[0]!.name;
      }
    }

    const update: Record<string, any> = {
      guildId,
      enabled: true,
    };

    if (outfitTag) update.outfitTag = outfitTag.toUpperCase();
    if (outfitId) update.outfitId = outfitId;
    if (outfitName) update.outfitName = outfitName;
    if (memberRole) update["roles.member"] = memberRole.id;
    if (guestRole) update["roles.guest"] = guestRole.id;

    await PlanetSideConfig.findOneAndUpdate({ guildId }, { $set: update }, { upsert: true, new: true });

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ PlanetSide 2 Enabled")
      .setDescription(
        `**PlanetSide 2 integration has been enabled!**\n\n` +
          (outfitTag ? `**Outfit:** [${outfitTag.toUpperCase()}] ${outfitName || "(could not resolve)"}\n` : "") +
          (memberRole ? `**Member Role:** ${memberRole}\n` : "") +
          (guestRole ? `**Guest Role:** ${guestRole}\n` : "") +
          `\nUsers can now use \`/ps2-link\` to link their accounts.`,
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "disable") {
    await PlanetSideConfig.findOneAndUpdate({ guildId }, { enabled: false });
    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ PlanetSide 2 Disabled").setDescription("PlanetSide 2 integration has been disabled.");
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "config") {
    const ps2Config = await PlanetSideConfig.findOne({ guildId }).lean();
    if (!ps2Config) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Not Configured").setDescription("Use `/ps2-setup enable` first.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const memberRole = ps2Config.roles?.member ? interaction.guild?.roles.cache.get(ps2Config.roles.member) : null;
    const guestRole = ps2Config.roles?.guest ? interaction.guild?.roles.cache.get(ps2Config.roles.guest) : null;
    const promoRole = ps2Config.roles?.promotion ? interaction.guild?.roles.cache.get(ps2Config.roles.promotion) : null;

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setTitle("⚙️ PlanetSide 2 Configuration")
      .setColor(ps2Config.enabled ? 0x00ff00 : 0xff0000)
      .addFields(
        { name: "Status", value: ps2Config.enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
        { name: "Outfit", value: ps2Config.outfitTag ? `[${ps2Config.outfitTag}] ${ps2Config.outfitName || ""}` : "Not set", inline: true },
        { name: "Verification", value: ps2Config.verificationMethod || "online_now", inline: true },
        { name: "Member Role", value: memberRole?.toString() || "Not set", inline: true },
        { name: "Guest Role", value: guestRole?.toString() || "Not set", inline: true },
        { name: "Promotion Role", value: promoRole?.toString() || "Not set", inline: true },
        { name: "Log Channel", value: ps2Config.channels?.log ? `<#${ps2Config.channels.log}>` : "Not set", inline: true },
        { name: "Census Status", value: ps2Config.channels?.censusStatus ? `<#${ps2Config.channels.censusStatus}>` : "Not set", inline: true },
        { name: "Population Source", value: ps2Config.populationSource || "honu", inline: true },
        { name: "Self-Unlink", value: ps2Config.allowSelfUnlink !== false ? "Allowed" : "Disabled", inline: true },
        { name: "Leave Revocation", value: ps2Config.leaveRevocation?.enabled ? "Enabled" : "Disabled", inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "panel") {
    const channel = interaction.options.getChannel("channel", true);
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const color = interaction.options.getString("color");
    const footer = interaction.options.getString("footer");
    const showAuthor = interaction.options.getBoolean("show-author");
    const showTimestamp = interaction.options.getBoolean("show-timestamp");

    // Save any provided panel customization to config
    const panelUpdate: Record<string, any> = {};
    if (title !== null) panelUpdate["panel.title"] = title;
    if (description !== null) panelUpdate["panel.description"] = description;
    if (color !== null) panelUpdate["panel.color"] = color.startsWith("#") ? color : `#${color}`;
    if (footer !== null) panelUpdate["panel.footerText"] = footer;
    if (showAuthor !== null) panelUpdate["panel.showAuthor"] = showAuthor;
    if (showTimestamp !== null) panelUpdate["panel.showTimestamp"] = showTimestamp;

    if (Object.keys(panelUpdate).length > 0) {
      await PlanetSideConfig.findOneAndUpdate({ guildId }, { $set: panelUpdate }, { upsert: true });
    }

    const result = await pluginAPI.panelService.sendPanel(channel.id, guildId);

    if (result.success) {
      const embed = pluginAPI.lib
        .createEmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("✅ Panel Sent")
        .setDescription(`The PlanetSide 2 linking panel has been posted to <#${channel.id}>.\n\n[Jump to panel](${result.messageUrl})`);
      await interaction.editReply({ embeds: [embed] });
    } else {
      const embed = pluginAPI.lib
        .createEmbedBuilder()
        .setColor(0xff0000)
        .setTitle("❌ Failed to Send Panel")
        .setDescription(result.error || "An error occurred.");
      await interaction.editReply({ embeds: [embed] });
    }
    return;
  }

  if (subcommand === "roles") {
    const memberRole = interaction.options.getRole("member-role");
    const guestRole = interaction.options.getRole("guest-role");
    const promotionRole = interaction.options.getRole("promotion-role");

    const update: Record<string, any> = {};
    if (memberRole) update["roles.member"] = memberRole.id;
    if (guestRole) update["roles.guest"] = guestRole.id;
    if (promotionRole) update["roles.promotion"] = promotionRole.id;

    if (Object.keys(update).length === 0) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ No Changes").setDescription("Provide at least one role to update.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    await PlanetSideConfig.findOneAndUpdate({ guildId }, { $set: update }, { upsert: true });

    const lines: string[] = [];
    if (memberRole) lines.push(`**Member Role:** ${memberRole}`);
    if (guestRole) lines.push(`**Guest Role:** ${guestRole}`);
    if (promotionRole) lines.push(`**Promotion Role:** ${promotionRole}`);

    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Roles Updated").setDescription(lines.join("\n"));
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "outfit") {
    const tag = interaction.options.getString("tag", true).trim().toUpperCase();

    const ps2Config = await PlanetSideConfig.findOne({ guildId }).lean();
    const outfits = await pluginAPI.apiService.getOutfitByTag(tag, ps2Config?.honuBaseUrl);

    if (!outfits || outfits.length === 0) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ Outfit Not Found").setDescription(`Could not find an outfit with tag **[${tag}]**.`);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const outfit = outfits[0]!;

    await PlanetSideConfig.findOneAndUpdate({ guildId }, { $set: { outfitId: outfit.id, outfitTag: outfit.tag, outfitName: outfit.name } }, { upsert: true });

    const embed = pluginAPI.lib
      .createEmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("✅ Outfit Set")
      .setDescription(`**Outfit:** [${outfit.tag}] ${outfit.name}\n` + `**Members:** ${outfit.memberCount ?? "Unknown"}\n` + `**Faction ID:** ${outfit.factionID}`);
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  if (subcommand === "channels") {
    const logChannel = interaction.options.getChannel("log");
    const censusChannel = interaction.options.getChannel("census-status");

    const update: Record<string, any> = {};
    if (logChannel) update["channels.log"] = logChannel.id;
    if (censusChannel) update["channels.censusStatus"] = censusChannel.id;

    if (Object.keys(update).length === 0) {
      const embed = pluginAPI.lib.createEmbedBuilder().setColor(0xff0000).setTitle("❌ No Changes").setDescription("Provide at least one channel to update.");
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    await PlanetSideConfig.findOneAndUpdate({ guildId }, { $set: update }, { upsert: true });

    // If census status channel was set, start monitoring
    if (censusChannel) {
      pluginAPI.censusMonitorService.startForGuild(guildId);
    }

    const lines: string[] = [];
    if (logChannel) lines.push(`**Log Channel:** <#${logChannel.id}>`);
    if (censusChannel) lines.push(`**Census Status:** <#${censusChannel.id}>`);

    const embed = pluginAPI.lib.createEmbedBuilder().setColor(0x00ff00).setTitle("✅ Channels Updated").setDescription(lines.join("\n"));
    await interaction.editReply({ embeds: [embed] });
  }
}
