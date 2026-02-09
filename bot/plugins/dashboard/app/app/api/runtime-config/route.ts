import { NextResponse } from "next/server";
import { RuntimeConfigSchema, type RuntimeConfig } from "../../../lib/runtimeConfig";

export const dynamic = "force-dynamic";

export function GET() {
  const config: RuntimeConfig = {
    wsUrl: process.env.WS_PUBLIC_URL || process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002",
  };

  return NextResponse.json(RuntimeConfigSchema.parse(config));
}
