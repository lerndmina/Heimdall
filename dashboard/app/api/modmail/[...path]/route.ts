import { NextRequest, NextResponse } from "next/server";

const BOT_API_URL = process.env.BOT_API_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleModmailRequest(request, params.path, "GET");
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleModmailRequest(request, params.path, "POST");
}

export async function PUT(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleModmailRequest(request, params.path, "PUT");
}

export async function DELETE(request: NextRequest, { params }: { params: { path: string[] } }) {
  return handleModmailRequest(request, params.path, "DELETE");
}

async function handleModmailRequest(request: NextRequest, pathSegments: string[], method: string) {
  try {
    if (!BOT_API_URL || !INTERNAL_API_KEY) {
      return NextResponse.json({ error: "Bot API configuration missing" }, { status: 500 });
    }

    // Reconstruct the path for the bot API
    const botApiPath = `/api/modmail/${pathSegments.join("/")}`;
    const searchParams = request.nextUrl.searchParams.toString();
    const botApiUrl = `${BOT_API_URL}${botApiPath}${searchParams ? `?${searchParams}` : ""}`;

    // Prepare headers for bot API request
    const headers: HeadersInit = {
      Authorization: `Bearer ${INTERNAL_API_KEY}`,
      "Content-Type": "application/json",
    };

    // Prepare request options
    const requestOptions: RequestInit = {
      method,
      headers,
    };

    // Include body for POST, PUT requests
    if (method === "POST" || method === "PUT") {
      const body = await request.text();
      if (body) {
        requestOptions.body = body;
      }
    }

    // Make request to bot API
    const response = await fetch(botApiUrl, requestOptions);

    // Get response data
    const responseData = await response.text();

    // Try to parse as JSON, fallback to text
    let parsedData;
    try {
      parsedData = JSON.parse(responseData);
    } catch {
      parsedData = responseData;
    }

    // Return response with same status code
    if (response.ok) {
      return NextResponse.json(parsedData, { status: response.status });
    } else {
      return NextResponse.json(parsedData || { error: `Bot API returned ${response.status}` }, { status: response.status });
    }
  } catch (error) {
    console.error("Error proxying to bot API:", error);
    return NextResponse.json({ error: "Failed to communicate with bot API" }, { status: 500 });
  }
}
