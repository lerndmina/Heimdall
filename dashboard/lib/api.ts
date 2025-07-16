// Client-side API calls should go through the dashboard's API routes
// These routes will then proxy to the bot API server-side
import { clientCache } from "./client-cache";

const BOT_API_URL = process.env.BOT_API_URL || "http://localhost:3001";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";

class ApiError extends Error {
  constructor(message: string, public status: number, public response?: any) {
    super(message);
    this.name = "ApiError";
  }
}

class ApiClient {
  private baseUrl: string;
  private apiKey: string;
  private pendingRequests = new Map<string, Promise<any>>();
  private isClientSide: boolean;

  constructor() {
    this.isClientSide = typeof window !== "undefined";
    // Client-side: empty base URL (use relative URLs)
    // Server-side: use bot API URL
    this.baseUrl = this.isClientSide ? "" : BOT_API_URL;
    this.apiKey = INTERNAL_API_KEY;

    // Debug logging (can be removed in production)
    if (this.isClientSide) {
      console.log("ApiClient initialized for client-side with relative URLs");
    } else {
      console.log("ApiClient initialized for server-side with bot API URL:", this.baseUrl);
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // For client-side requests, use relative URLs (endpoint already includes /api)
    // For server-side requests, use the full bot API URL
    const url = this.isClientSide ? endpoint : `${this.baseUrl}${endpoint}`;
    const requestKey = `${options.method || "GET"}:${url}`;

    // Check if we already have a pending request for this endpoint
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey);
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      // Only include API key for server-side requests to bot API
      ...(this.isClientSide ? {} : { Authorization: `Bearer ${this.apiKey}` }),
      ...options.headers,
    };

    const requestPromise = (async () => {
      try {
        const response = await fetch(url, {
          ...options,
          headers,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          // Log rate limiting errors for debugging
          if (response.status === 429) {
            console.warn(`Rate limited on ${endpoint}:`, {
              status: response.status,
              headers: Object.fromEntries(response.headers.entries()),
              data: errorData,
            });
          }

          throw new ApiError(errorData.message || `HTTP ${response.status}`, response.status, errorData);
        }

        return await response.json();
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }
        throw new ApiError(`Network error: ${error instanceof Error ? error.message : "Unknown error"}`, 0);
      } finally {
        // Clean up the pending request
        this.pendingRequests.delete(requestKey);
      }
    })();

    // Store the pending request
    this.pendingRequests.set(requestKey, requestPromise);

    return requestPromise;
  }

  // User validation
  async validateUser(userId: string) {
    // Use client-side cache to prevent duplicate requests
    const cacheKey = `validate-user-${userId}`;
    return clientCache.get(
      cacheKey,
      () => this.request(`/api/modmail/auth/validate-user/${userId}`),
      10 * 60 * 1000 // 10 minutes cache
    );
  }

  // Modmail operations
  async getModmailThreads(
    guildId: string,
    params: {
      page?: number;
      limit?: number;
      status?: "open" | "closed" | "resolved" | "all";
      userId?: string;
      search?: string;
      sortBy?: "lastActivity" | "created" | "resolved" | "closed";
      sortOrder?: "asc" | "desc";
    } = {}
  ) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return this.request(`/api/modmail/${guildId}/threads?${searchParams}`);
  }

  async getModmailThread(guildId: string, threadId: string, includeMessages = true) {
    return this.request(`/api/modmail/${guildId}/threads/${threadId}?includeMessages=${includeMessages}`);
  }

  async getModmailMessages(
    guildId: string,
    threadId: string,
    params: {
      page?: number;
      limit?: number;
      type?: "user" | "staff";
      search?: string;
    } = {}
  ) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return this.request(`/api/modmail/${guildId}/threads/${threadId}/messages?${searchParams}`);
  }

  async getModmailStats(guildId: string, timeframe: "24h" | "7d" | "30d" | "all" = "30d") {
    return this.request(`/api/modmail/${guildId}/stats?timeframe=${timeframe}`);
  }

  async getModmailConfig(guildId: string) {
    return this.request(`/api/modmail/${guildId}/config`);
  }

  async updateModmailConfig(guildId: string, config: any) {
    return this.request(`/api/modmail/${guildId}/config`, {
      method: "POST",
      body: JSON.stringify(config),
    });
  }

  async searchModmail(
    guildId: string,
    params: {
      q: string;
      page?: number;
      limit?: number;
      status?: "open" | "closed" | "resolved" | "all";
      dateFrom?: string;
      dateTo?: string;
      authorId?: string;
    }
  ) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return this.request(`/api/modmail/${guildId}/search?${searchParams}`);
  }

  async getUserTickets(
    userId: string,
    params: {
      page?: number;
      limit?: number;
      status?: "open" | "closed" | "resolved" | "all";
      guildId?: string;
      search?: string;
      sortBy?: "lastActivity" | "created" | "resolved" | "closed";
      sortOrder?: "asc" | "desc";
    } = {}
  ) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.set(key, String(value));
      }
    });

    return this.request(`/api/modmail/user/${userId}/tickets?${searchParams}`);
  }

  async generateTranscript(guildId: string, threadId: string, format: "html" | "json" = "html") {
    // Use the same pattern as other methods - go through dashboard API routes
    const url = this.isClientSide
      ? `/api/modmail/${guildId}/threads/${threadId}/transcript?format=${format}`
      : `${this.baseUrl}/api/modmail/${guildId}/threads/${threadId}/transcript?format=${format}`;

    const headers: HeadersInit = {
      ...(this.isClientSide ? {} : { Authorization: `Bearer ${this.apiKey}` }),
    };

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Provide user-friendly error messages
      if (response.status === 403) {
        throw new ApiError("You don't have permission to view this transcript. You can only view transcripts for tickets you opened or if you have staff permissions.", response.status, errorData);
      } else if (response.status === 404) {
        throw new ApiError("Transcript not found. The ticket may have been deleted.", response.status, errorData);
      } else if (response.status === 429) {
        throw new ApiError("Too many requests. Please wait a moment before trying again.", response.status, errorData);
      }

      throw new ApiError(errorData.message || `HTTP ${response.status}`, response.status, errorData);
    }

    if (format === "json") {
      return await response.json();
    } else {
      return await response.text();
    }
  }
}

export const apiClient = new ApiClient();
export { ApiError };
