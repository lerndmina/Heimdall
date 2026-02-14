import { NextResponse } from "next/server";
import { RuntimeConfigSchema, type RuntimeConfig } from "../../../lib/runtimeConfig";
import { parseEnabledPlugins } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export function GET() {
  const enabledPlugins = [...parseEnabledPlugins(process.env.DASHBOARD_ENABLED_PLUGINS)];

  const config: RuntimeConfig = {
    wsUrl: process.env.WS_PUBLIC_URL || process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002",
    enabledPlugins,
  };

  return NextResponse.json(RuntimeConfigSchema.parse(config));
}
