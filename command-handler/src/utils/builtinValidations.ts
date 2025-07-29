import { InteractionContextType, PermissionsBitField } from "discord.js";
import type { ValidationContext, ValidationResult } from "../types";

/**
 * Built-in validation for command options (permissions, context restrictions)
 * This runs before user-defined validations to enforce CommandOptions
 */
export async function validateCommandOptions({ interaction, command, handler }: ValidationContext): Promise<ValidationResult> {
  // 1. Check context restrictions based on SlashCommandBuilder configuration
  const contextValidation = validateCommandContext(interaction, command);
  if (!contextValidation.proceed) {
    return contextValidation;
  }

  // 2. Check user permissions
  if (command.config.userPermissions && command.config.userPermissions.length > 0) {
    const userPermissionValidation = validateUserPermissions(interaction, command);
    if (!userPermissionValidation.proceed) {
      return userPermissionValidation;
    }
  }

  // 3. Check bot permissions
  if (command.config.botPermissions && command.config.botPermissions.length > 0) {
    const botPermissionValidation = validateBotPermissions(interaction, command);
    if (!botPermissionValidation.proceed) {
      return botPermissionValidation;
    }
  }

  return { proceed: true };
}

/**
 * Validates command context restrictions based on SlashCommandBuilder contexts
 */
function validateCommandContext(interaction: any, command: any): ValidationResult {
  // Get the command's allowed contexts from the SlashCommandBuilder
  const commandData = command.data.toJSON();
  const allowedContexts = commandData.contexts;

  // If no contexts are specified, default Discord behavior applies
  if (!allowedContexts || allowedContexts.length === 0) {
    return { proceed: true };
  }

  const isInGuild = !!interaction.guild;
  const isInDM = !interaction.guild;

  // Check if current context is allowed
  const hasGuildContext = allowedContexts.includes(InteractionContextType.Guild);
  const hasBotDMContext = allowedContexts.includes(InteractionContextType.BotDM);
  const hasPrivateChannelContext = allowedContexts.includes(InteractionContextType.PrivateChannel);

  if (isInGuild && !hasGuildContext) {
    return {
      proceed: false,
      error: "❌ This command cannot be used in servers.",
      ephemeral: true,
    };
  }

  if (isInDM && !hasBotDMContext && !hasPrivateChannelContext) {
    return {
      proceed: false,
      error: "❌ This command cannot be used in direct messages.",
      ephemeral: true,
    };
  }

  return { proceed: true };
}

/**
 * Validates user permissions from CommandOptions
 */
function validateUserPermissions(interaction: any, command: any): ValidationResult {
  // User permissions only apply in guilds
  if (!interaction.guild || !interaction.member) {
    return {
      proceed: false,
      error: "❌ This command can only be used in servers.",
      ephemeral: true,
    };
  }

  const member = interaction.member;
  const requiredPermissions = command.config.userPermissions;

  // Check if member has all required permissions
  const memberPermissions = member.permissions;

  for (const permission of requiredPermissions) {
    if (!memberPermissions.has(permission)) {
      const permissionName =
        typeof permission === "string"
          ? permission
          : Object.keys(PermissionsBitField.Flags).find((key) => PermissionsBitField.Flags[key as keyof typeof PermissionsBitField.Flags] === permission) || permission.toString();
      return {
        proceed: false,
        error: `❌ You need the \`${permissionName}\` permission to use this command.`,
        ephemeral: true,
      };
    }
  }

  return { proceed: true };
}

/**
 * Validates bot permissions from CommandOptions
 */
function validateBotPermissions(interaction: any, command: any): ValidationResult {
  // Bot permissions only apply in guilds
  if (!interaction.guild) {
    return {
      proceed: false,
      error: "❌ This command can only be used in servers.",
      ephemeral: true,
    };
  }

  const botMember = interaction.guild.members.me;
  if (!botMember) {
    return {
      proceed: false,
      error: "❌ Bot member not found in this server.",
      ephemeral: true,
    };
  }

  const requiredPermissions = command.config.botPermissions;

  // Check if bot has all required permissions
  const botPermissions = botMember.permissions;

  for (const permission of requiredPermissions) {
    if (!botPermissions.has(permission)) {
      const permissionName =
        typeof permission === "string"
          ? permission
          : Object.keys(PermissionsBitField.Flags).find((key) => PermissionsBitField.Flags[key as keyof typeof PermissionsBitField.Flags] === permission) || permission.toString();
      return {
        proceed: false,
        error: `❌ I need the \`${permissionName}\` permission to run this command.`,
        ephemeral: true,
      };
    }
  }

  return { proceed: true };
}
