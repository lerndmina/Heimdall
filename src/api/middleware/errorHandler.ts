import { Request, Response, NextFunction } from "express";
import { createErrorResponse } from "../utils/apiResponse";
import log from "../../utils/log";

interface ApiError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

/**
 * Global error handling middleware
 */
export function errorHandler(error: ApiError, req: Request, res: Response, next: NextFunction) {
  log.error(`API Error on ${req.method} ${req.path}:`, error);

  // Default to 500 server error
  let statusCode = error.statusCode || 500;
  let message = error.message || "Internal server error";

  // Handle specific error types
  if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Validation error";
  } else if (error.name === "CastError") {
    statusCode = 400;
    message = "Invalid data format";
  } else if (error.name === "MongoError" && error.message.includes("duplicate key")) {
    statusCode = 409;
    message = "Resource already exists";
  }

  // Don't expose internal errors in production
  if (statusCode === 500 && process.env.NODE_ENV === "production") {
    message = "Internal server error";
  }

  res.status(statusCode).json(createErrorResponse(message, statusCode, req.requestId));
}

/**
 * Handle 404 routes
 */
export function notFoundHandler(req: Request, res: Response) {
  res
    .status(404)
    .json(createErrorResponse(`Route ${req.method} ${req.path} not found`, 404, req.requestId));
}

/**
 * Async error wrapper to catch async errors in route handlers
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
