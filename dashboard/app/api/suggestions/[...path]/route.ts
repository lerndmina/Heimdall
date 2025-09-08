import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const BOT_API_URL = process.env.BOT_API_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

type RouteContext = {
  params: { path: string[] };
};

async function handleSuggestionsRequest(request: NextRequest, context: RouteContext) {
  const { path } = context.params;
  const method = request.method;

  if (!BOT_API_URL || !INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Bot API configuration missing" }, { status: 500 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const botApiPath = `/api/suggestions/${path.join("/")}`;
  const searchParams = request.nextUrl.searchParams.toString();
  const botApiUrl = `${BOT_API_URL}${botApiPath}${searchParams ? `?${searchParams}` : ""}`;

  const headers: HeadersInit = {
    Authorization: `Bearer ${INTERNAL_API_KEY}`,
    "Content-Type": "application/json",
    "X-User-ID": session.user.id,
  };

  const requestOptions: RequestInit = {
    method,
    headers,
  };

  if (method === "POST" || method === "PATCH") {
    requestOptions.body = await request.text();
  }

  try {
    const response = await fetch(botApiUrl, requestOptions);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[SUGGESTIONS_PROXY]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export { handleSuggestionsRequest as GET, handleSuggestionsRequest as POST, handleSuggestionsRequest as PATCH, handleSuggestionsRequest as DELETE };
