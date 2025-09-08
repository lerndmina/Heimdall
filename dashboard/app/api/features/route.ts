import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { useRequireGuild } from "../../../components/dashboard/use-require-guild";

const BOT_API_URL = process.env.BOT_API_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function GET(request: NextRequest) {
  try {
    // Check if Minecraft systems are enabled via environment variable
    const minecraftEnabled = process.env.ENABLE_MINECRAFT_SYSTEMS === "true";

    // Get the current guild from query params
    const url = new URL(request.url);
    const guildId = url.searchParams.get("guildId");

    let suggestionsEnabled = false;

    if (guildId && BOT_API_URL && INTERNAL_API_KEY) {
      try {
        // Check if suggestions are configured for this guild
        const response = await fetch(`${BOT_API_URL}/api/suggestions/${guildId}/config`, {
          headers: {
            Authorization: `Bearer ${INTERNAL_API_KEY}`,
          },
        });

        if (response.ok) {
          const config = await response.json();
          suggestionsEnabled = config.success && config.data?.enabled === true;
        }
      } catch (error) {
        console.error("Error checking suggestions config:", error);
        // Default to false if we can't check
      }
    }

    return NextResponse.json({
      minecraft: minecraftEnabled,
      suggestions: suggestionsEnabled,
    });
  } catch (error) {
    console.error("Error checking feature flags:", error);
    return NextResponse.json({ error: "Failed to check feature flags" }, { status: 500 });
  }
}
