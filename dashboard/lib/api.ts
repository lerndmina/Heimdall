const API_BASE_URL = process.env.BOT_API_URL || "http://localhost:3001";
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

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const requestKey = `${options.method || "GET"}:${url}`;

    // Check if we already have a pending request for this endpoint
    if (this.pendingRequests.has(requestKey)) {
      console.log(`Deduplicating request to ${endpoint}`);
      return this.pendingRequests.get(requestKey);
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
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
    return this.request(`/api/modmail/auth/validate-user/${userId}`);
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
    const response = await fetch(`${this.baseUrl}/api/modmail/${guildId}/threads/${threadId}/transcript?format=${format}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(errorData.message || `HTTP ${response.status}`, response.status, errorData);
    }

    if (format === "json") {
      return await response.json();
    } else {
      return await response.text();
    }
  }
}

export const apiClient = new ApiClient(API_BASE_URL, INTERNAL_API_KEY);
export { ApiError };
