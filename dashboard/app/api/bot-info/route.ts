import { NextResponse } from "next/server";

export async function GET() {
  try {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Discord credentials not configured" }, { status: 500 });
    }

    // Get access token using client credentials
    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "identify",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Discord token API error: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();

    // Get bot information using the access token
    const botResponse = await fetch("https://discord.com/api/v10/oauth2/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!botResponse.ok) {
      throw new Error(`Discord bot API error: ${botResponse.status}`);
    }

    const botData = await botResponse.json();

    // Cache the response for 1 hour
    const response = NextResponse.json({
      id: botData.application.id,
      name: botData.application.name,
      description: botData.application.description,
      icon: botData.application.icon,
    });

    response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

    return response;
  } catch (error) {
    console.error("Error fetching bot info:", error);
    return NextResponse.json({ error: "Failed to fetch bot information" }, { status: 500 });
  }
}
