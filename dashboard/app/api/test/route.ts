import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message: "Dashboard API working",
    timestamp: new Date().toISOString(),
    route: "/api/test",
  });
}
