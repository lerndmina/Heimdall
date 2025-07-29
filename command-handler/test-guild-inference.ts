import { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";
import { isCommandGuildOnly, commandAllowsDM } from "./src/utils/commandUtils";

// Test cases for guild-only inference
console.log("Testing guild-only command inference...\n");

// Test 1: Command with setDMPermission(false) should be guild-only
const guildOnlyCommand = new SlashCommandBuilder().setName("test-guild-only").setDescription("Test guild only command").setDMPermission(false);

console.log("1. Command with setDMPermission(false):");
console.log(`   Guild-only: ${isCommandGuildOnly(guildOnlyCommand)}`);
console.log(`   Allows DM: ${commandAllowsDM(guildOnlyCommand)}`);
console.log();

// Test 2: Command with setDMPermission(true) should allow DMs
const dmAllowedCommand = new SlashCommandBuilder().setName("test-dm-allowed").setDescription("Test DM allowed command").setDMPermission(true);

console.log("2. Command with setDMPermission(true):");
console.log(`   Guild-only: ${isCommandGuildOnly(dmAllowedCommand)}`);
console.log(`   Allows DM: ${commandAllowsDM(dmAllowedCommand)}`);
console.log();

// Test 3: Command with no explicit DM permission (default behavior)
const defaultCommand = new SlashCommandBuilder().setName("test-default").setDescription("Test default command");

console.log("3. Command with default DM permissions:");
console.log(`   Guild-only: ${isCommandGuildOnly(defaultCommand)}`);
console.log(`   Allows DM: ${commandAllowsDM(defaultCommand)}`);
console.log();

// Test 4: Context menu command (should typically be guild-only)
const contextMenuCommand = new ContextMenuCommandBuilder().setName("test-context").setType(ApplicationCommandType.Message);

console.log("4. Context menu command (default):");
console.log(`   Guild-only: ${isCommandGuildOnly(contextMenuCommand)}`);
console.log(`   Allows DM: ${commandAllowsDM(contextMenuCommand)}`);
console.log();

console.log("✅ Guild-only inference test completed!");
