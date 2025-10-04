# Privacy Policy for Helpie

**Last Updated:** October 4, 2025

## Overview

Helpie ("the Bot") is a user-installable Discord bot designed to assist support personnel. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your data.

## Data We Collect

Helpie only stores data that you directly provide through bot commands. We do not collect, store, or process any data automatically or passively.

### Data You Provide

When you use Helpie commands, we may temporarily or permanently store:

1. **AI Context Data**

   - GitHub URLs you provide via `/helpie context set`
   - Cached content from those URLs (temporary, 10-minute cache)
   - Context metadata (scope, target IDs, timestamps)

2. **Temporary Message Context**

   - Message content you choose to add via "AI -> Add Context"
   - Stored temporarily in Redis with 5-minute expiration
   - Automatically deleted after use or expiration

3. **Tags**

   - Tag names and content you create via `/helpie tags add`
   - Usage statistics (count, timestamps) for your own tags
   - User ID associated with your tags

4. **Usage Data**
   - Discord User IDs (for associating your data with your account)
   - Timestamps of when data was created or modified

### Data We Do NOT Collect

- We do not collect or store message content unless you explicitly use a command to do so
- We do not track your activity, browsing habits, or behavior
- We do not collect personal information beyond Discord User IDs
- We do not access messages you don't explicitly interact with
- We do not share, sell, or distribute any data to third parties

## How We Use Your Data

Data you provide is used solely for:

1. **AI Question Processing**: Context you provide is used to give more accurate AI responses
2. **Tag Management**: Storing and retrieving your custom quick-reply tags
3. **Feature Functionality**: Enabling the features you choose to use

## Data Storage

- **Database**: MongoDB for permanent data (contexts, tags)
- **Cache**: Redis for temporary data (5-10 minute expiration)
- **Location**: Data is stored on servers operated by the bot owner

## Third-Party Services

Helpie uses the following third-party services:

1. **OpenAI API**: Your questions sent to `/helpie ask` are processed by OpenAI's GPT-4o-mini model

   - Subject to [OpenAI's Privacy Policy](https://openai.com/policies/privacy-policy)
   - We do not control OpenAI's data handling practices

2. **DeepL API** (optional): Messages you choose to translate are processed by DeepL
   - Subject to [DeepL's Privacy Policy](https://www.deepl.com/privacy)
   - Only used when you explicitly use the translate feature

## Your Rights

You have the right to:

1. **Access Your Data**: View all contexts and tags you've created using bot commands
2. **Delete Your Data**:
   - Use `/helpie context remove` to delete contexts, contexts are also deleted after 5 mins from our cache. And also removed when you use any of the `ask` commands.
   - Use `/helpie tags remove` to delete tags
   - We do not store any other data about you beond what you provide.
3. **Data Portability**: Export your data by using the list commands or contacting the bot owner

## Data Retention

- **Permanent Data** (contexts, tags): Stored until you delete it or request deletion
- **Temporary Data** (message context): Automatically deleted after 5 minutes
- **Cached Data**: Automatically deleted after 10 minutes

## Security

We implement reasonable security measures to protect your data:

- Secure database connections
- Access controls and authentication
- Regular security updates
- Data encryption in transit

However, no system is 100% secure. Use the bot at your own risk.

## Children's Privacy

Helpie is not intended for users under 13 years of age (or the minimum age required by Discord's Terms of Service in your jurisdiction). We do not knowingly collect data from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. The "Last Updated" date will be revised when changes are made. Continued use of the Bot after changes constitutes acceptance of the updated policy.

## Contact

If you have questions or concerns about this Privacy Policy or wish to request data deletion, please contact the bot owner through Discord or the repository: https://github.com/lerndmina/Heimdall

## Discord's Privacy Policy

As a Discord bot, Helpie is also subject to [Discord's Privacy Policy](https://discord.com/privacy). Please review Discord's policies for information about how Discord handles your data.

---

By using Helpie, you agree to this Privacy Policy.
