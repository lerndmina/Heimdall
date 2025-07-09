# Modmail System Utilities

This directory contains modularized utilities for the Heimdall modmail system, designed to improve code organization, maintainability, and consistency.

## Overview

The modmail utilities are organized into several focused modules:

### `ModmailEmbeds.ts`

Provides standardized, beautiful embed messages for all modmail operations.

**Features:**

- Consistent styling and branding across all modmail messages
- Type-safe embed creation with proper Discord color handling
- Support for success, error, warning, and info message types
- Reusable field and description formatting

**Usage:**

```typescript
import { ModmailEmbeds } from "../../utils/modmail/ModmailEmbeds";

// Error message
const errorEmbed = ModmailEmbeds.error(client, "Title", "Description");

// Success message with fields
const successEmbed = ModmailEmbeds.success(client, "Title", "Description", [
  { name: "Field", value: "Value", inline: false },
]);
```

### `ModmailValidation.ts`

Centralized validation logic for common modmail operations.

**Features:**

- Consistent validation patterns across all modmail commands
- Enhanced error handling with structured results
- Reusable validation functions for users, configs, and channels
- Type-safe validation results with clear error messages

**Usage:**

```typescript
import { validateModmailSetup } from "../../utils/modmail/ModmailValidation";

const validation = await validateModmailSetup(user, { guild, client, db });
if (!validation.success) {
  // Handle error with validation.error
  return;
}

const { member, config, channel } = validation.data;
```

### `ModmailThreads.ts`

Safe wrappers for modmail thread operations with enhanced error handling.

**Features:**

- Safe thread creation with automatic cleanup on failure
- Activity tracking and timestamp management
- Centralized thread cleanup utilities
- Enhanced logging and error reporting

**Usage:**

```typescript
import { createModmailThreadSafe, cleanupModmailThread } from "../../utils/modmail/ModmailThreads";

// Create thread safely
const result = await createModmailThreadSafe(client, options);
if (!result.success) {
  // Handle error
  return;
}

// Clean up on failure
await cleanupModmailThread({
  thread: result.thread,
  modmail: result.modmail,
  reason: "DM failure cleanup",
});
```

## Design Principles

### 1. Consistent Error Handling

All utilities use the `tryCatch` utility for consistent async error handling:

- Structured error results
- Proper logging at appropriate levels
- User-friendly error messages
- Graceful degradation

### 2. Type Safety

Full TypeScript support with:

- Proper type definitions for all parameters and return values
- Generic validation result types
- Clear interface definitions
- Compile-time error detection

### 3. Modularity

Each utility focuses on a specific concern:

- **Embeds**: Message formatting and presentation
- **Validation**: Input validation and requirement checking
- **Threads**: Thread lifecycle management
- **Operations**: Complex business logic

### 4. Reusability

Common patterns are extracted into reusable functions:

- Validation logic shared across commands
- Embed formatting standardized
- Error handling patterns consistent
- Database operations centralized

## Integration with Existing Code

The utilities are designed to integrate seamlessly with existing modmail commands:

### Before (Traditional Pattern)

```typescript
export default async function ({ interaction, client }: SlashCommandProps) {
  try {
    const user = interaction.options.getUser("user");
    if (!user) {
      return interaction.reply("Please provide a user");
    }

    if (user.bot) {
      return interaction.reply("Cannot open thread for bot");
    }

    const member = await getter.getMember(guild, user.id);
    if (!member) {
      return interaction.reply("User not in server");
    }

    // ... more validation and operations
  } catch (error) {
    log.error("Error:", error);
    return interaction.reply("An error occurred");
  }
}
```

### After (Utility Pattern)

```typescript
export default async function ({ interaction, client }: SlashCommandProps) {
  const user = interaction.options.getUser("user");
  if (!user) {
    return interaction.reply({
      embeds: [ModmailEmbeds.error(client, "Missing User", "Please provide a user")],
    });
  }

  const validation = await validateModmailSetup(user, { guild, client, db });
  if (!validation.success) {
    return interaction.reply({
      embeds: [ModmailEmbeds.error(client, "Validation Failed", validation.error)],
    });
  }

  const result = await createModmailThreadSafe(client, options);
  if (!result.success) {
    return interaction.reply({
      embeds: [ModmailEmbeds.error(client, "Creation Failed", result.error)],
    });
  }

  // Success handling...
}
```

## Benefits

### For Developers

- **Reduced Boilerplate**: Common patterns extracted into utilities
- **Consistent Patterns**: Same validation and error handling everywhere
- **Better Testing**: Modular functions easier to unit test
- **Clear Separation**: Business logic separated from presentation

### For Users

- **Consistent Experience**: All modmail messages look and feel the same
- **Better Error Messages**: Clear, actionable error descriptions
- **Improved Reliability**: Enhanced error handling prevents crashes
- **Professional Appearance**: Beautiful, branded embed messages

### For Maintainers

- **Single Source of Truth**: Validation logic centralized
- **Easier Updates**: Change embed styling in one place
- **Better Debugging**: Comprehensive logging and error tracking
- **Future-Proof**: Modular design supports new features

## Migration Guide

To migrate existing modmail commands to use these utilities:

1. **Replace BasicEmbed with ModmailEmbeds**:

   ```typescript
   // Old
   BasicEmbed(client, "Error", "Message", undefined, "Red");

   // New
   ModmailEmbeds.error(client, "Error", "Message");
   ```

2. **Add Validation Utilities**:

   ```typescript
   // Add imports
   import { validateModmailSetup } from "../../utils/modmail/ModmailValidation";

   // Replace manual validation
   const validation = await validateModmailSetup(user, { guild, client, db });
   ```

3. **Use Safe Thread Operations**:

   ```typescript
   // Add imports
   import { createModmailThreadSafe } from "../../utils/modmail/ModmailThreads";

   // Replace direct thread creation
   const result = await createModmailThreadSafe(client, options);
   ```

4. **Update Error Handling**:
   ```typescript
   // Replace try-catch with tryCatch utility
   const { data, error } = await tryCatch(asyncOperation());
   ```

## Future Enhancements

Potential areas for continued improvement:

- **Activity Tracking**: Enhanced user/staff activity monitoring
- **Template System**: Predefined response templates for common issues
- **Analytics**: Thread metrics and reporting
- **Automation**: Smart routing and auto-responses
- **Integration**: Webhooks and external system notifications
