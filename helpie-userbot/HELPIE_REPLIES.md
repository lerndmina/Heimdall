# HelpieReplies Usage Examples

Quick reference for using the HelpieReplies system with animated emoji.

## Import

```typescript
import HelpieReplies from "../utils/HelpieReplies";
```

## Available Emoji

| Emoji                                      | ID        | Use Case                                           |
| ------------------------------------------ | --------- | -------------------------------------------------- |
| <a:mandalorianhello:1422976992047005887>   | `hello`   | Success, greeting, completion                      |
| <a:mandalorianshocked:1422976972685836308> | `shocked` | User error, validation failure, warning            |
| <a:mandalorianwhat:1422976946962174003>    | `what`    | Thinking, processing, question                     |
| <a:mandaloriansorry:1422976872324792371>   | `sorry`   | System error, apology, service failure             |
| <a:mandalorianlooking:1422976818448699432> | `looking` | Searching, loading, database lookup, loading state |

## Basic Usage Patterns

**All replies are sent as embeds with color-coded titles and descriptions.**

### 1. Simple String (Uses Default Title)

```typescript
// Uses default "Success" title
await HelpieReplies.success(interaction, "Context saved successfully!");

// Uses default "Error" title
await HelpieReplies.error(interaction, "Failed to connect to database.");

// Uses default "Warning" title
await HelpieReplies.warning(interaction, "Invalid URL format!");

// Uses default "Information" title
await HelpieReplies.info(interaction, "Here are your contexts...");
```

### 2. Custom Title with Message

```typescript
// Custom title and message
await HelpieReplies.success(interaction, {
  title: "Context Saved",
  message: "Your context has been saved successfully!",
});

// Error with custom title
await HelpieReplies.error(interaction, {
  title: "Database Connection Failed",
  message: "Could not connect to MongoDB. Please check your connection string.",
});
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

````typescript
### Searching/Loading (for database lookups or any loading state)
```typescript
// Show loading emoji while loading data
await HelpieReplies.deferSearching(interaction, true); // true = ephemeral

// ... search database or load data ...

// Edit to info
await HelpieReplies.editInfo(interaction, "Found 5 contexts.");
````

````

## Advanced Options

### Custom Formatting (No Emoji Prefix)

```typescript
await HelpieReplies.editReply(interaction, {
  type: "success",
  content: "**Custom message** with formatting",
  emoji: false, // Disable emoji prefix
});
````

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

````typescript
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

    // Simple string response
    await HelpieReplies.editSuccess(interaction, `Found ${data.length} results!`);

    // OR with custom title
    await HelpieReplies.editSuccess(interaction, {
      title: "Search Complete",
      message: `Found ${data.length} results!`,
    });
  } catch (error) {
    log.error("Error fetching data:", error);
    await HelpieReplies.editError(interaction, "An error occurred while fetching data.");
  }
}
```## Embed Colors and Emoji Mapping

All replies use color-coded embeds with timestamps:

| Reply Type | Emoji    | Color          | Use For                                   |
| ---------- | -------- | -------------- | ----------------------------------------- |
| `success`  | hello    | 🟢 Green       | Successful operations                     |
| `error`    | sorry    | 🔴 Red         | System failures                           |
| `warning`  | shocked  | 🟡 Orange      | User mistakes, validation errors          |
| `info`     | what     | 🔵 Blurple     | General information                       |
| `thinking` | what     | 🔵 Blurple     | Processing operations                     |
| `question` | what     | 🔵 Blurple     | Asking for input                          |
| `searching`| looking  | 🔵 Blurple     | Database/API lookups, any loading state   |

**Default Titles:**
- Success → "Success"
- Error → "Error"
- Warning → "Warning"
- Info → "Information"
- Thinking/Question → "Processing"
- Searching → "Searching"

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
````

### After

```typescript
await HelpieReplies.deferThinking(interaction);
// ... processing ...
await HelpieReplies.editSuccess(interaction, "Done!");
```
