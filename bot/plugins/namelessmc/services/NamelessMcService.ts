export interface NamelessMcConfig {
  siteBaseUrl: string;
  apiKey: string;
}

export interface VerifyDiscordPayload {
  code: string;
  identifier: string;
  username: string;
}

export interface VerifyDiscordResult {
  success: boolean;
  message?: string;
}

export interface NamelessIntegrationInfo {
  integration?: string;
  identifier?: string;
  verified?: boolean;
  username?: string;
}

export interface NamelessLinkedUser {
  id?: number | string;
  username?: string;
  displayname?: string;
  profile?: string;
  integrations?: NamelessIntegrationInfo[];
}

export interface LookupDiscordLinkResult {
  success: boolean;
  linked: boolean;
  message?: string;
  user?: NamelessLinkedUser;
  integration?: NamelessIntegrationInfo;
}

function getMessageFromUnknown(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const data = payload as Record<string, unknown>;

  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (typeof data.error === "string" && data.error.trim()) return data.error;

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const firstRecord = first as Record<string, unknown>;
      if (typeof firstRecord.message === "string") return firstRecord.message;
      if (typeof firstRecord.error === "string") return firstRecord.error;
    }
  }

  return undefined;
}

export class NamelessMcService {
  constructor(private config: NamelessMcConfig) {}

  async lookupDiscordLink(discordUserId: string): Promise<LookupDiscordLinkResult> {
    const base = this.config.siteBaseUrl.trim().replace(/\/+$/, "");
    const lookup = encodeURIComponent(`integration_id:Discord:${discordUserId}`);
    const endpoint = `${base}/api/v2/users/${lookup}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });
    } catch {
      return {
        success: false,
        linked: false,
        message: "Failed to reach NamelessMC while checking current Discord link status.",
      };
    }

    let parsed: unknown = undefined;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      const apiMessage = getMessageFromUnknown(parsed);
      if (apiMessage === "nameless:cannot_find_user") {
        return {
          success: true,
          linked: false,
        };
      }

      return {
        success: false,
        linked: false,
        message: apiMessage ?? `NamelessMC link lookup failed (${response.status}).`,
      };
    }

    const user = (parsed && typeof parsed === "object" ? (parsed as NamelessLinkedUser) : undefined) ?? undefined;
    const integrations = Array.isArray(user?.integrations) ? user.integrations : [];
    const discordIntegration = integrations.find((integration) => integration?.integration === "Discord" && Boolean(integration?.verified));

    return {
      success: true,
      linked: Boolean(discordIntegration),
      user,
      integration: discordIntegration,
    };
  }

  async verifyDiscordCode(payload: VerifyDiscordPayload): Promise<VerifyDiscordResult> {
    const base = this.config.siteBaseUrl.trim().replace(/\/+$/, "");
    const endpoint = `${base}/api/v2/integration/verify`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integration: "Discord",
          code: payload.code,
          identifier: payload.identifier,
          username: payload.username,
        }),
      });
    } catch {
      return {
        success: false,
        message: "Failed to reach NamelessMC. Please check SITEBASEURL_ENV and try again.",
      };
    }

    let parsed: unknown = undefined;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      return {
        success: false,
        message: getMessageFromUnknown(parsed) ?? `NamelessMC verification failed (${response.status}).`,
      };
    }

    return {
      success: true,
      message: getMessageFromUnknown(parsed),
    };
  }
}
