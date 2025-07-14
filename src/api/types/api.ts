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
