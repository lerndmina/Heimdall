export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  requestId: string;
}

export interface HealthComponent {
  status: "healthy" | "unhealthy";
  details: string;
  [key: string]: any;
}

export interface HealthStatus {
  status: "healthy" | "unhealthy";
  timestamp: string;
  components: {
    discord: HealthComponent;
    database: HealthComponent;
    redis: HealthComponent;
    commands: HealthComponent;
  };
}

export interface ApiKeyRequest {
  name: string;
  scopes: string[];
  expiresAt?: Date;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  timestamp: string;
  requestId: string;
  statusCode?: number;
}

// Modmail API types
export interface ModmailThread {
  guildId: string;
  forumThreadId: string;
  forumChannelId: string;
  userId: string;
  userDisplayName: string;
  userAvatar?: string;
  lastUserActivityAt: string;
  markedResolved: boolean;
  resolvedAt?: string;
  claimedBy?: string;
  claimedAt?: string;
  autoCloseDisabled: boolean;
  autoCloseScheduledAt?: string;
  inactivityNotificationSent?: string;
  messageCount: number;
  createdAt: string;
  messages?: ModmailMessage[];
}

export interface ModmailMessage {
  messageId: string;
  type: "user" | "staff";
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  attachments: ModmailAttachment[];
  isEdited: boolean;
  editedContent?: string;
  editedAt?: string;
  editedBy?: string;
  createdAt: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  discordMessageId?: string;
  discordMessageUrl?: string;
  webhookMessageId?: string;
  webhookMessageUrl?: string;
  dmMessageId?: string;
  dmMessageUrl?: string;
}

export interface ModmailAttachment {
  filename: string;
  url: string;
  size: number;
  contentType?: string;
}

export interface ModmailConfig {
  guildId: string;
  guildDescription?: string;
  forumChannelId: string;
  staffRoleId: string;
  tags?: ModmailTag[];
  inactivityWarningHours: number;
  autoCloseHours: number;
  hasWebhook: boolean;
}

export interface ModmailTag {
  snowflake: string;
  status: "open" | "closed";
}

export interface ModmailStats {
  total: number;
  open: number;
  closed: number;
  totalMessages: number;
  messageBreakdown?: {
    staff: number;
    user: number;
  };
}

export interface PaginatedResponse<T> {
  data: T;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}
