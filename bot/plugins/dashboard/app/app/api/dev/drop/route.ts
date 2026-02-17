/**
 * Dev drop proxy — forwards drop requests to the bot API.
 * Only accessible to bot owners (checked on bot API side).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const API_PORT = process.env.API_PORT || "3001";
const API_BASE = `http://localhost:${API_PORT}`;
const API_KEY = process.env.INTERNAL_API_KEY!;
const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, { status: 401 });
  }

  // Defense-in-depth: verify bot owner on dashboard side before proxying
  if (!OWNER_IDS.includes(session.user.id)) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Only bot owners can drop data" } }, { status: 403 });
  }

  try {
    const res = await fetch(`${API_BASE}/api/dev/drop`, {
      method: "DELETE",
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
        "X-User-Id": session.user.id,
        "X-Confirm-Drop": req.headers.get("X-Confirm-Drop") || "",
      },
      cache: "no-store",
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const message = process.env.NODE_ENV === "production" ? "Drop failed" : error.message || "Drop failed";
    return NextResponse.json({ success: false, error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
  }
}
