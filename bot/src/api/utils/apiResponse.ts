import { randomUUID } from "crypto";
import type { ApiResponse, ApiErrorResponse } from "../types/api";

/**
 * Create a standardized successful API response
 */
export function createSuccessResponse<T>(data: T, requestId?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId: requestId || randomUUID(),
  };
}

/**
 * Create a standardized error API response
 */
export function createErrorResponse(
  error: string,
  statusCode?: number,
  requestId?: string
): ApiErrorResponse {
  return {
    success: false,
    error,
    timestamp: new Date().toISOString(),
    requestId: requestId || randomUUID(),
    statusCode,
  };
}

/**
 * Create a paginated response wrapper
 */
export function createPaginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
  requestId?: string
): ApiResponse<{
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}> {
  const totalPages = Math.ceil(total / limit);

  return createSuccessResponse(
    {
      items: data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
    requestId
  );
}
