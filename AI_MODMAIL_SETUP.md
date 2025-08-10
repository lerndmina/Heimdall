# AI Modmail Setup Examples

This document shows how to set up AI responses for your modmail system using the hooks architecture.

## Overview

The AI response system integrates with your existing modmail hooks to provide intelligent responses before creating support tickets. You can configure AI responses at two levels:

1. **Global Level** - Applies to all categories unless overridden
2. **Category Level** - Specific configuration for individual categories

## Quick Setup

### 1. Enable AI Globally

```bash
# Enable AI for all categories in your server
/modmail-ai enable scope:global

# Check current status
/modmail-ai status
```

### 2. Enable AI for Specific Category

```bash
# Enable AI for a specific category
/modmail-ai enable scope:category category:billing

# Disable AI for a specific category
/modmail-ai disable scope:category category:billing
```

## Advanced Configuration

### Database Configuration

The AI settings are stored in your MongoDB `ModmailConfig` collection. Here's the structure:

```json
{
  "guildId": "your_guild_id",

  // Global AI configuration (applies to all categories)
  "globalAIConfig": {
    "enabled": true,
    "fallbackToGlobal": true,
    "systemPrompt": "You are a helpful support assistant...",
    "preventModmailCreation": false,
    "includeFormData": true,
    "responseStyle": "helpful",
    "maxTokens": 500
  },

  // Default category with AI config
  "defaultCategory": {
    "id": "general",
    "name": "General Support",
    "aiConfig": {
      "enabled": true,
      "systemPrompt": "You are helping with general support questions...",
      "preventModmailCreation": false,
      "responseStyle": "helpful",
      "maxTokens": 300
    }
  },

  // Additional categories
  "categories": [
    {
      "id": "billing",
      "name": "Billing Support",
      "aiConfig": {
        "enabled": true,
        "systemPrompt": "You are a billing support specialist...",
        "preventModmailCreation": false,
        "responseStyle": "formal",
        "maxTokens": 400
      }
    }
  ]
}
```

### Manual Database Updates

If you need to manually configure AI settings:

```javascript
// Enable AI globally for a server
db.modmailconfigs.updateOne(
  { guildId: "YOUR_GUILD_ID" },
  {
    $set: {
      "globalAIConfig.enabled": true,
      "globalAIConfig.systemPrompt":
        "You are a helpful AI assistant for our Discord server. Provide helpful responses to user inquiries. If you can fully resolve their question, say so clearly. If they need human assistance, encourage them to proceed with creating a support ticket.",
    },
  }
);

// Enable AI for a specific category
db.modmailconfigs.updateOne(
  { guildId: "YOUR_GUILD_ID" },
  {
    $set: {
      "defaultCategory.aiConfig.enabled": true,
      "defaultCategory.aiConfig.systemPrompt": "You are a support assistant for general inquiries...",
    },
  }
);

// Enable AI for additional categories
db.modmailconfigs.updateOne(
  {
    guildId: "YOUR_GUILD_ID",
    "categories.id": "billing",
  },
  {
    $set: {
      "categories.$.aiConfig.enabled": true,
      "categories.$.aiConfig.systemPrompt": "You are a billing support specialist...",
      "categories.$.aiConfig.responseStyle": "formal",
    },
  }
);
```

## Configuration Options

### System Prompt Examples

**General Support:**

```
You are a helpful AI assistant for [Server Name]. You help users with general questions about our community and services.

Server Context: [Add your server description here]

Provide clear, helpful responses. If you can fully resolve their question, let them know. If they need human assistance, encourage them to proceed with creating a support ticket.
```

**Billing Support:**

```
You are a billing support specialist for [Company Name]. You help users with account questions, subscription issues, and payment problems.

Company Context: [Add your company description]

Be professional and empathetic. For account-specific issues, always recommend they create a support ticket for personalized assistance. For general billing questions, provide helpful information but remind them that support staff can access their specific account details.
```

**Technical Support:**

```
You are a technical support assistant for [Product Name]. You help users troubleshoot common issues and provide technical guidance.

Product Context: [Add your product description]

Provide step-by-step troubleshooting when possible. For complex issues or bugs, recommend creating a support ticket for detailed investigation..
```

### Response Styles

- **helpful** (default) - Friendly and informative
- **formal** - Professional and structured
- **casual** - Relaxed and conversational

### Advanced Options

- **preventModmailCreation**: When set to `true`, the AI provides an answer first, then shows a "Continue with Support Ticket" button if the user still needs help
- **includeFormData**: Include form responses in AI context for better answers
- **maxTokens**: Control response length (50-2000)

## Prevent Modmail Creation Feature

When `preventModmailCreation` is enabled, the system works as follows:

1. User sends a message to create modmail
2. Server/Category selection hooks run (if multiple options)
3. AI Response Hook runs and generates an answer
4. User sees AI response with a "📧 Continue with Support Ticket" button
5. If the AI resolved their issue, they can stop here
6. If they still need help, they click the button **once** to continue creating the modmail
7. The system remembers their original request and creates the ticket without running AI again

This reduces unnecessary support tickets while ensuring users can always reach human support when needed.

## Environment Variables

Make sure you have these environment variables set:

```env
OPENAI_API_KEY=your_openai_api_key
```

## How It Works

### Standard Flow (preventModmailCreation: false)

1. User sends a message to create modmail
2. Server/Category selection hooks run (if multiple options)
3. **AI Response Hook runs** (if enabled for selected category)
4. AI analyzes the message and provides a helpful response
5. Modmail creation continues as normal
6. User gets both AI assistance and human support

### Gated Flow (preventModmailCreation: true)

1. User sends a message to create modmail
2. Server/Category selection hooks run (if multiple options)
3. **AI Response Hook runs** and provides an answer
4. User sees AI response with "📧 Continue with Support Ticket" button
5. **Two outcomes:**
   - User is satisfied with AI answer → Process ends, no ticket created
   - User needs more help → Clicks button to create support ticket
6. If button is clicked, original context is restored and modmail is created

## Testing

To test your AI configuration:

1. Send a DM to your bot
2. Go through server/category selection
3. Check if AI response appears
4. Verify modmail creation behavior

## Priority Order

The system checks for AI configuration in this order:

1. **Category-specific AI config** (if enabled)
2. **Global AI config** (if enabled and fallback allowed)
3. **No AI response** (if no configuration found)

This allows you to have global defaults with category-specific overrides.
