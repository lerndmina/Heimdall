# Copilot Instructions for Heimdall

This is a monorepo containing a Discord bot and web dashboard for modmail management and bot administration.

## Project Structure

### Bot (`./bot/`)

- **Discord Bot**: Built with Discord.js 14+ and CommandKit framework
- **API Server**: Express.js REST API for dashboard integration
- **Database**: MongoDB with Mongoose ODM, Redis for caching
- **Architecture**: Event-driven with modular command/event system

#### Bot Directory Structure

```
bot/src/
├── commands/           # Slash commands organized by category
│   ├── fivem/         # FiveM server integration commands
│   ├── modmail/       # Modmail system commands
│   ├── utilities/     # General utility commands
│   └── ...
├── events/            # Discord event handlers
│   ├── messageCreate/
│   ├── interactionCreate/
│   └── ...
├── models/            # Mongoose database schemas
├── services/          # Business logic services
├── utils/             # Shared utility functions
├── subcommands/       # Complex command logic
├── validations/       # Command validation logic
└── api/               # REST API server
    ├── controllers/
    ├── middleware/
    ├── routes/
    └── types/
```

### Dashboard (`./dashboard/`)

- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS + shadcn/ui components
- **Authentication**: NextAuth.js v5 with Discord OAuth
- **State Management**: TanStack Query (React Query)

#### Dashboard Directory Structure

```
dashboard/
├── app/               # Next.js App Router pages
│   ├── (auth)/       # Protected routes
│   │   ├── dashboard/
│   │   ├── modmail/
│   │   └── transcripts/
│   └── api/          # API route handlers
├── components/       # React components
│   ├── ui/          # shadcn/ui components
│   ├── auth/        # Authentication components
│   └── dashboard/   # Dashboard-specific components
└── lib/             # Utility libraries
    ├── auth.ts      # NextAuth configuration
    ├── api.ts       # Bot API client
    └── utils.ts     # General utilities
```

## Tech Stack

### Bot

- **Runtime**: Node.js/Bun
- **Framework**: Discord.js 14+, CommandKit
- **Database**: MongoDB (Mongoose), Redis
- **API**: Express.js with TypeScript
- **Additional**: FFmpeg, MariaDB (FiveM integration)

### Dashboard

- **Framework**: Next.js 14 (App Router), React 18
- **Styling**: Tailwind CSS, shadcn/ui
- **Auth**: NextAuth.js v5 (Discord OAuth)
- **State**: TanStack Query, React Context
- **Package Manager**: Bun

## Development Guidelines

### General

- **TypeScript First**: Use TypeScript for all new code with proper typing
- **Monorepo Structure**: Keep bot and dashboard concerns separate
- **Environment Variables**: Use consistent env var patterns across projects
- **Error Handling**: Implement comprehensive error handling with logging
- **Documentation**: Add JSDoc comments for complex functions

### Bot Development

- **CommandKit Patterns**: Follow CommandKit conventions for commands/events
- **Modular Architecture**: Organize code by feature (commands, events, services)
- **Database Operations**: Use the Database utility class for consistency
- **Logging**: Use the custom log utility instead of console.log
- **Error Handling**: Use tryCatch utility for async operations
- **Validation**: Implement proper input validation for all commands
- **Permissions**: Check user/bot permissions before command execution

### Dashboard Development

- **Next.js App Router**: Use new App Router conventions (not Pages Router)
- **shadcn/ui Components**: Prefer shadcn/ui over custom components
- **Authentication**: Protect routes with proper auth checks
- **API Integration**: Use the centralized API client in lib/api.ts
- **State Management**: Use TanStack Query for server state
- **Responsive Design**: Ensure mobile-friendly interfaces

### Code Organization Patterns

#### Bot Commands Structure

```typescript
// Export pattern for commands
export const data = new SlashCommandBuilder()...
export const options: CommandOptions = {...}
export async function run({ interaction, client, handler }: SlashCommandProps) {...}
export async function autocomplete({ interaction, client, handler }: AutocompleteProps) {...}
```

#### Dashboard Component Patterns

```typescript
// Use proper TypeScript interfaces
interface ComponentProps {
  prop: string;
}

// Prefer async server components when possible
export default async function ServerComponent() {
  // Server-side data fetching
}

// Use 'use client' only when necessary
("use client");
export default function ClientComponent() {
  // Client-side interactivity
}
```

## Code Style

### General

- **Async/Await**: Prefer async/await over Promises
- **Arrow Functions**: Use arrow functions for callbacks and short functions
- **TypeScript**: Properly type all functions, interfaces, and props
- **Destructuring**: Use object/array destructuring when appropriate
- **Error Handling**: Never silently fail - log errors appropriately

### Bot Specific

- **Command Structure**: Follow the established command export pattern
- **Logging**: Use `log.info()`, `log.error()`, `log.debug()` instead of console
- **Database**: Use the Database utility class for all DB operations
- **Utilities**: Leverage existing utilities in `utils/` before creating new ones
- **Constants**: Define reusable constants in appropriate locations

### Dashboard Specific

- **Components**: Keep components focused and single-responsibility
- **Hooks**: Use React Query hooks for data fetching
- **Styling**: Use Tailwind utility classes, avoid custom CSS when possible
- **Forms**: Use proper form validation with Zod schemas
- **Loading States**: Implement proper loading and error states

## File Conventions

### Naming Conventions

- **React Components**: PascalCase (`UserProfile.tsx`, `DashboardNav.tsx`)
- **Utilities/Functions**: camelCase (`formatDate.ts`, `validateUser.ts`)
- **Bot Commands**: kebab-case (`user-info.ts`, `modmail-setup.ts`)
- **Database Models**: PascalCase (`UserSchema.ts`, `ModmailConfig.ts`)
- **Next.js Pages**: lowercase with hyphens (`user-settings/page.tsx`)
- **Constants**: SCREAMING_SNAKE_CASE (`API_ENDPOINTS`, `ERROR_MESSAGES`)

### Bot File Organization

- **Commands**: Organize by category in `commands/` subdirectories
- **Events**: Organize by Discord event type in `events/`
- **Models**: One model per file in `models/`
- **Services**: Business logic services in `services/`
- **Utilities**: Shared functions in `utils/` with descriptive names

### Dashboard File Organization

- **Pages**: Use Next.js App Router structure in `app/`
- **Components**: Organize by feature/type in `components/`
- **Utilities**: Shared functions in `lib/`
- **Types**: TypeScript definitions in appropriate component files or shared types

## Error Handling & Logging

### Bot Error Handling

```typescript
// Use the tryCatch utility for async operations
const { data, error } = await tryCatch(asyncOperation());
if (error) {
  log.error("Operation failed:", error);
  return interaction.reply("An error occurred");
}

// Use proper error responses
return interaction.reply({
  embeds: [ModmailEmbeds.error(client, "Title", "Description")],
  ephemeral: true,
});
```

### Dashboard Error Handling

```typescript
// Use React Query error handling
const { data, error, isLoading } = useQuery({
  queryKey: ["data"],
  queryFn: fetchData,
  onError: (error) => {
    toast.error("Failed to load data");
  },
});

// Implement error boundaries for component errors
```

## Database & API Patterns

### Bot Database Operations

```typescript
// Use the Database utility class
const db = new Database();
const result = await db.findOne(ModelName, { query }, lean);
const updated = await db.updateOne(ModelName, { query }, { update }, options);
```

### API Development

```typescript
// Use proper middleware
router.use(authenticateApiKey);
router.use(requireScope("modmail:read"));

// Return consistent responses
return res.json(createSuccessResponse(data, req.requestId));
return res.status(400).json(createErrorResponse("Error message", 400, req.requestId));
```

## Testing & Validation

### Input Validation

- **Bot Commands**: Validate all user inputs before processing
- **API Endpoints**: Use proper request validation middleware
- **Dashboard Forms**: Use Zod schemas for form validation
- **Environment Variables**: Validate required env vars on startup

### Security Considerations

- **API Keys**: Proper authentication for all API endpoints
- **User Permissions**: Validate Discord permissions before command execution
- **Input Sanitization**: Sanitize user inputs to prevent injection attacks
- **Rate Limiting**: Implement rate limiting on API endpoints

## Common Utilities & Patterns

### Bot Utilities

- `log` - Use for all logging instead of console.log
- `tryCatch` - Wrap async operations for better error handling
- `Database` - Centralized database operations
- `BasicEmbed` - Consistent embed styling
- `ThingGetter` - Discord entity retrieval utilities

### Dashboard Utilities

- `cn()` - Tailwind class merging utility
- `api` - Centralized API client for bot communication
- `auth` - NextAuth configuration and helpers

This structure ensures maintainable, scalable code that follows established patterns and best practices for both Discord bot development and modern web application development.
