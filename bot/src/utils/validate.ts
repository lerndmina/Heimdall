/**
 * Zod Validation Middleware for Express
 *
 * Validates req.body, req.query, or req.params against a Zod schema.
 * Returns a 400 with structured error details on validation failure.
 */

import type { Request, Response, NextFunction } from "express";
import { z, type ZodSchema } from "zod";

/**
 * Middleware that validates `req.body` against the given Zod schema.
 * On failure, returns 400 with a JSON error payload.
 *
 * Usage:
 * ```ts
 * router.post("/", validateBody(MySchema), handler);
 * ```
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    // Replace req.body with the parsed (and potentially transformed) data
    req.body = result.data;
    next();
  };
}

/**
 * Middleware that validates `req.query` against the given Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    next();
  };
}
