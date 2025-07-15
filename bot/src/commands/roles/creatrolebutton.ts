import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  ButtonBuilder,
  ButtonStyle,
  Role,
  Emoji,
  EmojiResolvable,
  ComponentEmojiResolvable,
  RoleResolvable,
  Message,
} from "discord.js";

import { json } from "stream/consumers";
import BasicEmbed from "../../utils/BasicEmbed";
import { debuglog } from "util";
import ButtonWrapper from "../../utils/ButtonWrapper";
import { randomUUID } from "crypto";
import RoleButtons from "../../models/RoleButtons";
import { ROLE_BUTTON_PREFIX, globalCooldownKey, setCommandCooldown, waitingEmoji } from "../../Bot";
import Database from "../../utils/data/database";
import { CommandOptions, SlashCommandProps } from "commandkit";
import { ThingGetter, getValidUrl, pastebinUrlToJson } from "../../utils/TinyUtils";
import { initialReply } from "../../utils/initialReply";

export const data = new SlashCommandBuilder()
  .setName("createrolebutton")
  .setDescription("Creates a button that gives a role when clicked")
  .addStringOption((option) =>
    option.setName("url").setDescription("The URL to grab the styling from").setRequired(false)
  )
  .setDMPermission(false);

export const options: CommandOptions = {
  devOnly: true,
  deleted: false,
  userPermissions: ["ManageRoles", "ManageMessages"],
  botPermissions: ["ManageRoles", "ManageMessages"],
};

export async function run({ interaction, client, handler }: SlashCommandProps) {
  if (!interaction.channel)
    interaction.reply({ content: "This command can only be used in a server", ephemeral: true });
  setCommandCooldown(globalCooldownKey(interaction.commandName), 120);

  try {
    const urlString = interaction.options.getString("url");

    if (urlString) {
      const url = getValidUrl(urlString);
      if (!url) {
        return interaction.reply({
          content: "",
          embeds: [
            BasicEmbed(
              client,
              "Invalid Url",
              "You entered an invalid url. Please try again.",
              undefined,
              "Red"
            ),
          ],
          ephemeral: true,
        });
      }

      const messageJson = await pastebinUrlToJson(url);
      if (!messageJson) {
        return interaction.reply({
          content: "",
          embeds: [
            BasicEmbed(
              client,
              "Invalid Url",
              "The url you entered does not contain valid JSON. Please try again.",
              undefined,
              "Red"
            ),
          ],
          ephemeral: true,
        });
      }
      const db = new Database();
      await db.cacheStore(
        `${interaction.commandName}:${interaction.id}`,
        JSON.stringify(messageJson),
        10 * 60
      );
    }

    const modalId = `modal-${interaction.id}`;
    const inputId = `input-${interaction.id}`;

    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Enter the role details");
    const input = new TextInputBuilder()
      .setCustomId(inputId)
      // Each field splits by | each line splits by \n
      .setPlaceholder("ROLE_NAME|ROLE_ID|EMOJI(OPTIONAL)|BUTTON_TYPE(OPTIONAL)")
      .setLabel("Role Name|Role ID|Emoji|Button Type")
      .setStyle(TextInputStyle.Paragraph);

    const modalActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    modal.addComponents(modalActionRow);

    await interaction.showModal(modal);
    const filter = (i: ModalSubmitInteraction) => i.customId === modalId;
    interaction
      .awaitModalSubmit({ filter, time: 5 * 60 * 1000 })
      .then(async (i: ModalSubmitInteraction) => {
        await initialReply(i, true);

        const raw = i.fields.getTextInputValue(inputId) as string;
        type ButtonData = {
          roleName: string;
          roleId: string;
          emoji: ComponentEmojiResolvable;
          buttonType: ButtonStyle;
        };

        const rawArr = raw.split("\n");

        var invalidLines: string[] = [];

        var buttonData: ButtonData[] = [];

        for (const line of rawArr) {
          const array = splitValidLines(line);

          if (!array) {
            invalidLines.push(`Button syntax error on line: ${line}`);
            continue;
          }

          if (array.length > 4 || array.length < 2) {
            invalidLines.push(`Invalid array length: ${array.length} for line: ${line}`);
            continue;
          }

          var [roleName, roleId, emoji, buttonTypeStr] = array;

          buttonTypeStr = buttonTypeStr?.toUpperCase();

          var buttonType: ButtonStyle = ButtonStyle.Primary;

          if (buttonTypeStr && buttonTypeStr !== "PRIMARY" && buttonTypeStr !== "SECONDARY") {
            invalidLines.push(`Invalid button type: ${buttonTypeStr} for line: ${line}`);
            continue;
          } else if (buttonTypeStr) {
            if (buttonTypeStr === "PRIMARY") {
              buttonType = ButtonStyle.Primary;
            } else {
              buttonType = ButtonStyle.Secondary;
            }
          }

          buttonData.push({
            roleName,
            roleId,
            emoji,
            buttonType,
          });
        }

        if (invalidLines.length > 0) {
          return i.editReply({
            content: "",
            embeds: [
              BasicEmbed(
                client,
                "Error",
                `There were ${
                  invalidLines.length
                } invalid line(s) in your input. Please make sure you follow the format.\n\n\`\`\`${invalidLines.join(
                  "\n"
                )}\`\`\``
              ),
            ],
          });
        }

        const buttons: ButtonBuilder[] = [];
        const db = new Database();
        const getter = new ThingGetter(client);

        for (const data of buttonData) {
          const uuid = randomUUID();
          const button = new ButtonBuilder()
            .setCustomId(`${ROLE_BUTTON_PREFIX}${uuid}`)
            .setLabel(data.roleName)
            .setStyle(data.buttonType);

          if (data.emoji) button.setEmoji(data.emoji);

          buttons.push(button);

          const role = await getter.getRole(interaction.guild!, data.roleId);

          if (!role) {
            return i.editReply({
              content: "",
              embeds: [BasicEmbed(client, "Error", `Role with id: ${data.roleId} does not exist.`)],
            });
          }

          const dbData = {
            guildId: interaction.guild!.id,
            roleId: role.id,
            buttonId: uuid,
          };

          await db.findOneAndUpdate(RoleButtons, { buttonId: uuid }, data);
        }

        ButtonWrapper(buttons);

        const messageJsonString = await db.cacheFetch(
          `${interaction.commandName}:${interaction.id}`
        );
        if (messageJsonString) {
          var messageJson = JSON.parse(messageJsonString);

          messageJson.components = ButtonWrapper(buttons);

          await interaction.channel!.send(messageJson);
        } else {
          interaction.channel?.send({
            content:
              "Because you didn't provide me with any messageJSON I'm gonna make this as ugly as possible\n\nWant buttons? Here Buttons. Click them idc man do what ever you want.",
            components: ButtonWrapper(buttons),
          });
        }

        i.editReply({
          content: "Done!",
          embeds: [
            BasicEmbed(
              client,
              "Role Button Creation",
              `Created ${buttonData.length} button(s)`,
              undefined,
              "Green"
            ),
          ],
        });
      })
      .catch();
  } catch (error) {
    console.error(error);

    interaction.channel?.send({
      content: "",
      embeds: [
        BasicEmbed(
          client,
          "Error",
          "We just fell back to the final trycatch for this command. Something has gone horribly wrong.\n```" +
            error +
            "```"
        ),
      ],
    });
  }
}

function splitValidLines(line: string) {
  const pattern = /^[^\|]+\|[^\|]+(\|[^\|]*){0,2}$/;

  if (!pattern.test(line)) {
    return [];
  }

  return line.split("|").filter(Boolean);
}
