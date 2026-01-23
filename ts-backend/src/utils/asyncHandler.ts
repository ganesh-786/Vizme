import type { Request, Response, NextFunction } from "express";

/**
 * asyncHandler is a higher-order function that wraps an async Express route handler, 
 * automatically catching any rejected promises and passing errors to Express's error middleware
 * via next(). This eliminates the need for repetitive try-catch blocks in each async route.
 * 
 * Usage:
 *   app.get("/route", asyncHandler(async (req, res, next) => { ... }))
 */

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);