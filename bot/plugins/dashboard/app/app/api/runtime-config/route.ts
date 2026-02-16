import { NextResponse } from "next/server";
import { RuntimeConfigSchema, type RuntimeConfig } from "../../../lib/runtimeConfig";
import { parseEnabledPlugins } from "@/lib/integrations";

export const dynamic = "force-dynamic";

function normalizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^['\"]|['\"]$/g, "");
}

export function GET() {
  const enabledPlugins = [...parseEnabledPlugins(process.env.DASHBOARD_ENABLED_PLUGINS)];
  const wsUrl = normalizeEnvValue(process.env.WS_PUBLIC_URL) || normalizeEnvValue(process.env.NEXT_PUBLIC_WS_URL) || "ws://localhost:3002";

  const config: RuntimeConfig = {
    wsUrl,
    enabledPlugins,
  };

  return NextResponse.json(RuntimeConfigSchema.parse(config));
}
