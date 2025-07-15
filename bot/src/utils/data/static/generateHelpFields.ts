import path from "path";
import GetAllFiles from "../../GetAllFiles";
import { Client, EmbedField, Snowflake } from "discord.js";
import { debugMsg } from "../../TinyUtils";
import log from "../../log";

const COMMAND_HELP_MAX_LENGTH = 128;

export default async function (client: Client<true>) {
  const localCommands = GetAllFiles(path.join(__dirname, "../../../commands/"));

  const result = await client.application.commands.fetch();

  const commands = {} as {
    [category: string]: { id: Snowflake; name: string; description: string; subcommands: any }[];
  };

  debugMsg("Building command map");
  for (const command of localCommands) {
    debugMsg(command); // Logs the command object
    var commandCategory = command.category;
    const commandName = command.name;

    if (!commandCategory) {
      log.warn(
        `Command ${commandName.toUpperCase()} does not have a category! Spooky! Skipping...`
      );
      continue;
    }

    // if command category does not exist in commands object, create it
    if (!commands[command.category]) {
      commands[commandCategory] = [];
    }

    const resultCommand = result.find((cmd) => cmd.name === commandName);
    if (!resultCommand) continue;

    var commandDescription: string;

    if (resultCommand.description.length > COMMAND_HELP_MAX_LENGTH) {
      commandDescription = resultCommand.description.slice(0, COMMAND_HELP_MAX_LENGTH - 3) + "...";
    } else commandDescription = resultCommand.description;

    const commandObject = {
      id: resultCommand.id,
      name: commandName,
      description: commandDescription,
      subcommands: resultCommand.options,
    };

    commands[commandCategory].push(commandObject);
  }

  var fields: EmbedField[] = []; // {name: category, value: "command1: description\ncommand2: description"}

  // Clean up and make it pesentable
  for (const category in commands) {
    if (commands[category].length === 0) {
      delete commands[category];
    } else {
      commands[category] = commands[category].sort((a, b) => (a.name > b.name ? 1 : -1));

      var name = category.charAt(0).toUpperCase() + category.slice(1);

      var value = "";

      for (const command of commands[category]) {
        debugMsg(`Processing command: ${command.name}`);
        if (!command.subcommands || command.subcommands.length === 0) {
          value += standardHelpMsg(command);
          // This command has no subcommands, so we can skip the rest of the loop.
          continue;
        }
        for (const subcommand of command.subcommands) {
          if (subcommand.type == 1) {
            value += subcommandHelpMsg(subcommand, command);
          } else {
            // This is a standard command as a subcommand. Weird.
            value += standardHelpMsg(command);
            break;
          }
        }
      }

      if (!value || !name) {
        debugMsg(`Skipping category ${category} because it has no value or name`);
        continue;
      }

      var valueArray: string[] = [];
      const maxValueLength = 512;
      if (value.length > maxValueLength) {
        while (value.length > maxValueLength) {
          var lastBlankIndex = value.lastIndexOf(BLANK_CHARACTER, maxValueLength);
          if (lastBlankIndex === -1) {
            lastBlankIndex = maxValueLength;
          }

          // Slice the string from the start to the last blank character
          var splitValue = value.slice(0, lastBlankIndex);
          // Remove the sliced part from the value string
          value = value.slice(lastBlankIndex);

          // Add the split string to the array
          valueArray.push(splitValue);
        }

        // Add the remaining value string to the array
        valueArray.push(value);
      } else {
        valueArray.push(value);
      }

      let counter = 0;
      for (const val of valueArray) {
        const field = {
          name: name + `${counter > 0 ? " (cont.)" : ""}`,
          value: val,
          inline: true,
        };
        fields.push(field);
        counter++;
      }
    }
  }
  // Finally remove all blank characters, there's no need for them now
  fields = fields.map((field) => {
    field.value = field.value.replace(new RegExp(BLANK_CHARACTER, "g"), "");
    return field;
  });

  fields.sort((a, b) => {
    // Get the base names
    const baseNameA = a.name.replace(" (cont.)", "");
    const baseNameB = b.name.replace(" (cont.)", "");

    // Compare the base names
    if (baseNameA === baseNameB) {
      // If the base names are the same, prioritize the field without "(cont.)" in its name
      if (a.name.includes("(cont.)") && !b.name.includes("(cont.)")) {
        return 1;
      } else if (!a.name.includes("(cont.)") && b.name.includes("(cont.)")) {
        return -1;
      } else {
        // If both fields have the same inclusion status of "(cont.)", compare the lengths of the "value" properties in descending order
        return b.value.length - a.value.length;
      }
    } else {
      // If the base names are different, compare the total length of the "value" properties of all fields with the same base name in descending order
      const totalLengthA = fields
        .filter((field) => field.name.replace(" (cont.)", "") === baseNameA)
        .reduce((sum, field) => sum + field.value.length, 0);
      const totalLengthB = fields
        .filter((field) => field.name.replace(" (cont.)", "") === baseNameB)
        .reduce((sum, field) => sum + field.value.length, 0);
      return totalLengthB - totalLengthA;
    }
  });

  const maxFields = 3;
  if (fields.length < maxFields) return [fields];
  // Split into batches of 4
  let fieldBatches: EmbedField[][] = [];
  for (let i = 0; i < fields.length; i += maxFields) {
    fieldBatches.push(fields.slice(i, i + maxFields));
  }
  return fieldBatches;
}

const BLANK_CHARACTER = "⠀";

const endingNewline = "\n" + BLANK_CHARACTER;

function standardHelpMsg(command: any) {
  return `</${command.name}:${command.id}>\n${command.description}${endingNewline}`;
}

function subcommandHelpMsg(subcommand: any, command: any) {
  var commandDescription: string;

  if (subcommand.description.length > COMMAND_HELP_MAX_LENGTH) {
    commandDescription = subcommand.description.slice(0, COMMAND_HELP_MAX_LENGTH - 3) + "...";
  } else commandDescription = subcommand.description;

  return `</${command.name} ${subcommand.name}:${command.id}>\n${commandDescription}${endingNewline}`;
}
