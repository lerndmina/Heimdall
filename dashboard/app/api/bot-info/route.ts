import { NextResponse } from "next/server";

export async function GET() {
  try {
    // First try to get bot info from our bot's API
    const botApiUrl = process.env.BOT_API_URL;
    const internalApiKey = process.env.INTERNAL_API_KEY;

    if (botApiUrl && internalApiKey) {
      try {
        const botApiResponse = await fetch(`${botApiUrl}/bot-info`, {
          headers: {
            Authorization: `Bearer ${internalApiKey}`,
          },
          // Add timeout to avoid hanging
          signal: AbortSignal.timeout(3000),
        });

        if (botApiResponse.ok) {
          const botData = await botApiResponse.json();
          const response = NextResponse.json(botData);
          response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
          return response;
        }
      } catch (error) {
        console.warn("Bot API not available, falling back to Discord API");
      }
    }

    // Fallback: Use Discord API directly with bot token
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      return NextResponse.json({
        name: "Heimdall",
        description: "Discord Bot Dashboard",
        id: process.env.DISCORD_CLIENT_ID || "unknown",
      });
    }

    // Get bot information using the bot token
    const botResponse = await fetch("https://discord.com/api/v10/applications/@me", {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      // Add timeout to avoid hanging during build
      signal: AbortSignal.timeout(5000),
    });

    if (!botResponse.ok) {
      throw new Error(`Discord bot API error: ${botResponse.status}`);
    }

    const botData = await botResponse.json();

    // Cache the response for 1 hour
    const response = NextResponse.json({
      id: botData.id,
      name: botData.name,
      description: botData.description,
      icon: botData.icon,
    });

    response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

    return response;
  } catch (error) {
    console.error("Error fetching bot info:", error);
    return NextResponse.json({ error: "Failed to fetch bot information" }, { status: 500 });
  }
}
