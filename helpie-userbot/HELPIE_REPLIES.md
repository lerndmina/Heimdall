# HelpieReplies Usage Examples

Quick reference for using the HelpieReplies system with animated emoji.

## Import

```typescript
import HelpieReplies from "../utils/HelpieReplies";
```

## Available Emoji

| Emoji | ID | Use Case |
|-------|----|----|
| <a:mandalorianhello:1422976992047005887> | `hello` | Success, greeting, completion |
| <a:mandalorianshocked:1422976972685836308> | `shocked` | User error, validation failure, warning |
| <a:mandalorianwhat:1422976946962174003> | `what` | Thinking, processing, question |
| <a:mandaloriansorry:1422976872324792371> | `sorry` | System error, apology, service failure |
| <a:mandalorianlooking:1422976818448699432> | `looking` | Searching, loading, database lookup |

## Basic Usage Patterns

### 1. Success Message
```typescript
await HelpieReplies.success(interaction, "Context saved successfully!");
```

### 2. Error Message (System Error)
```typescript
await HelpieReplies.error(interaction, "Failed to connect to database.");
```

### 3. Warning Message (User Error)
```typescript
await HelpieReplies.warning(interaction, "Invalid URL format!");
```

### 4. Info Message
```typescript
await HelpieReplies.info(interaction, "Here are your contexts...");
```

## Defer → Edit Pattern

### Thinking (for processing)
```typescript
// Show thinking emoji while processing
await HelpieReplies.deferThinking(interaction);

// ... do work ...

// Edit to success
await HelpieReplies.editSuccess(interaction, "All done!");
```

### Searching (for database lookups)
```typescript
// Show searching emoji while looking up data
await HelpieReplies.deferSearching(interaction, true); // true = ephemeral

// ... search database ...

// Edit to info
await HelpieReplies.editInfo(interaction, "Found 5 contexts.");
```

## Advanced Options

### Custom Formatting (No Emoji Prefix)
```typescript
await HelpieReplies.editReply(interaction, {
  type: "success",
  content: "**Custom message** with formatting",
  emoji: false, // Disable emoji prefix
});
```

### Direct Emoji Access
```typescript
const emoji = HelpieReplies.getEmoji("success");
await interaction.reply(`${emoji} Custom message with **formatting**`);
```

### Full Control with Options
```typescript
await HelpieReplies.reply(interaction, {
  type: "warning",
  content: "Please check your input.",
  ephemeral: true,
  emoji: true,
});
```

## Complete Example

```typescript
export async function run(interaction: ChatInputCommandInteraction, client: Client) {
  // Validate ownership
  if (!env.OWNER_IDS.includes(interaction.user.id)) {
    return HelpieReplies.warning(interaction, "This command is only available to bot owners.");
  }

  // Show searching emoji while fetching data
  await HelpieReplies.deferSearching(interaction, true);

  try {
    const data = await fetchDataFromDatabase();
    
    if (!data) {
      return HelpieReplies.editInfo(interaction, "No results found.");
    }

    await HelpieReplies.editSuccess(interaction, `Found ${data.length} results!`);
  } catch (error) {
    log.error("Error fetching data:", error);
    await HelpieReplies.editError(interaction, "An error occurred while fetching data.");
  }
}
```

## Reply Type to Emoji Mapping

| Reply Type | Emoji | Use For |
|------------|-------|---------|
| `success` | hello | Successful operations |
| `error` | sorry | System failures |
| `warning` | shocked | User mistakes |
| `info` | what | General information |
| `thinking` | what | Processing operations |
| `question` | what | Asking for input |
| `searching` | looking | Database/API lookups |

## Best Practices

1. **Use deferred replies** for operations that take >3 seconds
2. **Choose the right emoji**: 
   - `deferThinking()` for AI/processing
   - `deferSearching()` for database lookups
3. **Error types**:
   - `error()` for system failures (not user's fault)
   - `warning()` for validation failures (user's fault)
4. **Ephemeral by default** for owner-only commands
5. **Disable emoji** only when you need complex custom formatting

## Migration from Old Code

### Before
```typescript
await interaction.reply(`<a:mandalorianwhat:1422976946962174003>`);
// ... processing ...
await interaction.editReply({ content: "✅ Done!" });
```

### After
```typescript
await HelpieReplies.deferThinking(interaction);
// ... processing ...
await HelpieReplies.editSuccess(interaction, "Done!");
```
