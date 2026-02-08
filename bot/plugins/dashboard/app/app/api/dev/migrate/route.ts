/**
 * Dev migration proxy — forwards migration requests to the bot API as SSE stream.
 * Only accessible to bot owners (checked on bot API side).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const API_PORT = process.env.API_PORT || "3001";
const API_BASE = `http://localhost:${API_PORT}`;
const API_KEY = process.env.INTERNAL_API_KEY!;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } }, { status: 401 });
  }

  try {
    const body = await req.text();

    const res = await fetch(`${API_BASE}/api/dev/migrate`, {
      method: "POST",
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
        "X-User-Id": session.user.id,
      },
      body,
      cache: "no-store",
    });

    // If not SSE, forward as-is (error responses)
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      const data = await res.text();
      return new NextResponse(data, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Forward the SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const reader = res.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch {
          // Stream ended
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: { code: "API_ERROR", message: "Failed to connect to bot API" } }, { status: 502 });
  }
}
