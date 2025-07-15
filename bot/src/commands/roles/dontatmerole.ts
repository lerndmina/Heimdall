import {
  SlashCommandBuilder,
  Client,
  BaseInteraction,
  Role,
  RepliableInteraction,
} from "discord.js";
import Database from "../../utils/data/database";
import DontAtMeRole from "../../models/DontAtMeRole";
import { waitingEmoji } from "../../Bot";
import BasicEmbed from "../../utils/BasicEmbed";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("dontatmerole")
  .setDescription("Set the Don't @ Me role for this server.")
  .setDMPermission(false)
  .addRoleOption((option) =>
    option
      .setName("role")
      .setDescription("The role to set as the Don't @ Me role")
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option.setName("remove").setDescription("Remove the Don't @ Me role").setRequired(false)
  );

export const options: CommandOptions = {
  devOnly: false,
  deleted: false,
  userPermissions: ["Administrator"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  const role = interaction.options.getRole("role") as Role;
  const remove = interaction.options.getBoolean("remove") as boolean;
  if (!role && !remove) {
    interaction.reply({
      content: "You must specify a role to set as the Don't @ Me role.",
      ephemeral: true,
    });
    return;
  }
  if (role && remove) {
    interaction.reply({
      content: "You can't specify both a role and remove.",
      ephemeral: true,
    });
    return;
  }

  await initialReply(interaction, true);

  if (remove) removeRole(client, interaction);
  else setDontAtMeRole(client, interaction, role);
}

async function setDontAtMeRole(
  client: Client<true>,
  interaction: RepliableInteraction,
  role: Role
) {
  const db = new Database();
  const roleId = role.id;
  const guildId = interaction.guild!.id;

  await db.findOneAndUpdate(
    DontAtMeRole,
    { guildId: guildId },
    { guildId: guildId, roleId: roleId }
  );
  done(client, interaction, role);
}

async function removeRole(client: Client<true>, interaction: RepliableInteraction) {
  const db = new Database();
  const guildId = interaction.guild!.id;

  await db.deleteOne(DontAtMeRole, { guildId: guildId });
  done(client, interaction);
}

async function done(client: Client<true>, interaction: RepliableInteraction, role?: Role) {
  await interaction.editReply({
    content: "",
    embeds: [
      BasicEmbed(
        client,
        "Don't @ Me Role",
        `Done! ${
          role ? `Set ${role.name} as the Don't @ Me role.` : "Removed the Don't @ Me role."
        }`
      ),
    ],
  });
}
