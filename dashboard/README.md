# Heimdall Dashboard

A modern web dashboard for managing the Heimdall Discord Bot's modmail system.

## 🚀 Features

- **Discord OAuth Authentication** - Secure login with Discord accounts
- **Guild Management** - Manage multiple Discord servers from one dashboard
- **Modmail Overview** - View all modmail threads with advanced filtering
- **Beautiful Transcripts** - Generate and share conversation transcripts
- **Real-time Analytics** - Monitor response times and activity metrics
- **Modern UI** - Built with Next.js 14, Tailwind CSS, and shadcn/ui
- **Lightning Fast** - Powered by Bun for faster installs and builds

## 🏗️ Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18
- **Styling**: Tailwind CSS, shadcn/ui components
- **Authentication**: NextAuth.js v5 with Discord OAuth
- **State Management**: TanStack Query (React Query)
- **TypeScript**: Full type safety throughout
- **API**: RESTful API with the main Heimdall bot

## 📋 Prerequisites

- Node.js 18+
- Bun (recommended) or npm
- Running Heimdall bot with API enabled
- Discord Application for OAuth

## 🔧 Installation

### Automatic Setup (Recommended)

```bash
# From the main Heimdall directory
./dashboard-dev.sh         # Linux/macOS
# or
./dashboard-dev.ps1        # Windows PowerShell
```

### Manual Setup

```bash
# Install dashboard dependencies
cd dashboard
bun install

# Copy environment file
cp .env.local.example .env.local
```

## ⚙️ Configuration

### 1. Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or use your existing bot application
3. Go to OAuth2 settings
4. Add redirect URI: `http://localhost:3000/api/auth/callback/discord`
5. Copy Client ID and Client Secret

### 2. Environment Variables

#### Development Environment

Edit `dashboard/.env` (for local development):

```env
# Authentication
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret

# Bot API Connection
BOT_API_URL=http://localhost:3001
INTERNAL_API_KEY=your-internal-api-key

# Trust the reverse proxy (for production)
AUTH_TRUST_HOST=true
```

#### Production Environment

For Docker/production deployment, set these environment variables:

```env
# Authentication
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=https://your-dashboard-domain.com
AUTH_TRUST_HOST=true

# Discord OAuth
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret

# Bot API Connection - Use your bot API domain
BOT_API_URL=https://your-bot-api-domain.com
INTERNAL_API_KEY=your-internal-api-key

# Database for session storage
DATABASE_URL=your-postgres-connection-string
```

### 3. Bot Configuration

Ensure your main bot has these environment variables:

```env
# API Configuration
API_PORT=3001
API_CORS_ORIGINS=http://localhost:3000
INTERNAL_API_KEY=your-internal-api-key
```

## 🚀 Development

### Start Both Bot and Dashboard

```bash
# From main directory
npm run dev:dashboard
```

This will start:

- Heimdall bot on `http://localhost:3001`
- Dashboard on `http://localhost:3000`

### Start Only Dashboard

```bash
cd dashboard
bun run dev
```

### Build for Production

```bash
cd dashboard
bun run build
bun run start
```

## 📁 Project Structure

```
dashboard/
├── app/                    # Next.js 14 App Router
│   ├── (auth)/            # Protected routes
│   │   ├── dashboard/     # Main dashboard
│   │   ├── modmail/       # Modmail management
│   │   └── transcripts/   # Transcript viewer
│   ├── api/               # API routes
│   │   └── auth/          # NextAuth handlers
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Landing page
├── components/            # React components
│   ├── ui/                # shadcn/ui components
│   ├── auth/              # Authentication components
│   └── dashboard/         # Dashboard-specific components
├── lib/                   # Utilities
│   ├── auth.ts            # NextAuth configuration
│   ├── api.ts             # Bot API client
│   └── utils.ts           # General utilities
└── types/                 # TypeScript types
```

## 🔐 Authentication Flow

1. User visits dashboard
2. Redirected to Discord OAuth
3. Discord returns user info
4. Dashboard validates user has staff role in guilds
5. User can access authorized guild data

## 🛡️ Security Features

- **Discord OAuth**: Secure authentication flow
- **Role-based Access**: Only staff members can access guild data
- **API Proxy Architecture**: Dashboard proxies requests to bot API (client never directly calls bot API)
- **API Key Protection**: Internal API calls secured with keys
- **CSRF Protection**: Built-in with NextAuth.js
- **Rate Limiting**: Prevents API abuse

## 🎨 UI Components

The dashboard uses shadcn/ui components with a Discord-inspired dark theme:

- **Colors**: Based on Discord's design language
- **Typography**: Inter font for readability
- **Icons**: Lucide React icon library
- **Responsive**: Mobile-friendly design

## 📊 API Integration

The dashboard uses a secure proxy architecture with proper authentication and authorization:

**Client → Dashboard API Routes (Auth + Validation) → Bot API**

- **Client-side**: Only makes requests to `/api/*` routes on same domain
- **Dashboard API Routes**: Validate user authentication and permissions before proxying to bot API
- **Bot API**: Internal API secured with API keys

### Authorization Logic

1. **Authentication**: All requests require valid NextAuth session
2. **User Data Access**: Users can view their own modmail tickets
3. **Staff Access**: Users with staff roles can view guild modmail data for authorized guilds
4. **Guild Validation**: Staff access verified via bot API for each guild

### API Routes

- **User Validation**: `/api/modmail/auth/validate-user/{userId}`
- **User Tickets**: `/api/modmail/user/{userId}/tickets` (own tickets or staff access)
- **Thread Management**: `/api/modmail/{guildId}/threads` (requires guild staff access)
- **Statistics**: `/api/modmail/{guildId}/stats` (requires guild staff access)
- **Search**: `/api/modmail/{guildId}/search` (requires guild staff access)
- **Transcripts**: `/api/modmail/{guildId}/threads/{threadId}/transcript` (requires guild staff access)

All routes validate user permissions before proxying to the bot API using `BOT_API_URL` and `INTERNAL_API_KEY`.

## 🐛 Troubleshooting

### Common Issues

1. **"Cannot connect to bot API"**

   - Ensure the bot is running on the configured port
   - Check `BOT_API_URL` in dashboard environment
   - For production: Verify your bot API is accessible at the configured URL

2. **API calls fail then try localhost**

   - This should no longer happen with the proxy architecture
   - Dashboard client-side only calls `/api/*` routes (same domain)
   - Dashboard API routes proxy to bot API using server-side `BOT_API_URL`
   - If you see direct calls to bot API domain, check that client is using updated API client

3. **Environment variables not loading in production**

   - Check if Docker container is receiving the environment variables
   - Verify no local `.env` file is overriding Docker environment
   - For Next.js: Server-side env vars should work automatically
   - **Debug**: Create an API route to check what environment variables are loaded:
     ```typescript
     // app/api/debug-env/route.ts (remove after debugging)
     export async function GET() {
       return Response.json({
         BOT_API_URL: process.env.BOT_API_URL,
         NEXTAUTH_URL: process.env.NEXTAUTH_URL,
         NODE_ENV: process.env.NODE_ENV,
       });
     }
     ```

4. **"Authentication failed"**

   - Verify Discord OAuth credentials
   - Check redirect URI in Discord application

5. **"No accessible guilds"**

   - User must have the staff role in at least one guild
   - Check modmail configuration in the bot

6. **TypeScript errors during development**
   - This is normal during initial setup
   - Install dependencies: `bun install`

### Development Tips

- Use browser DevTools to inspect API calls
- Check bot logs for API errors
- Enable TypeScript strict mode for better error catching
- Use React Query DevTools for debugging state

## 🚢 Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Configure environment variables
4. Deploy

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY dashboard/ .
RUN npm install && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### Traditional Hosting

```bash
bun run build
bun run start
```

## 📝 License

Same license as the main Heimdall project.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

For more information about the main Heimdall bot, see the [main README](../README.md).
