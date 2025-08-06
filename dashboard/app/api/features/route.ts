import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Check if Minecraft systems are enabled via environment variable
    const minecraftEnabled = process.env.ENABLE_MINECRAFT_SYSTEMS === "true";

    return NextResponse.json({
      minecraft: minecraftEnabled,
    });
  } catch (error) {
    console.error("Error checking feature flags:", error);
    return NextResponse.json({ error: "Failed to check feature flags" }, { status: 500 });
  }
}
