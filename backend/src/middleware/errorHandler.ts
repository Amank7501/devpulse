import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import { ApiError, TokenExpiredError as GitHubTokenExpiredError } from '../services/githubClient';

// ---------------------------------------------------------------------------
// Custom error hierarchy
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly type: string,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(detail?: string) {
    super(400, 'https://devpulse.dev/errors/validation', 'Validation Error', detail);
  }
}

export class NotFoundError extends AppError {
  constructor(detail?: string) {
    super(404, 'https://devpulse.dev/errors/not-found', 'Not Found', detail);
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail?: string) {
    super(401, 'https://devpulse.dev/errors/unauthorized', 'Unauthorized', detail);
  }
}

export class RateLimitError extends AppError {
  constructor(
    public readonly resetAt: number,
    detail?: string,
  ) {
    super(429, 'https://devpulse.dev/errors/rate-limit', 'Too Many Requests', detail);
  }
}

export class GitHubApiError extends AppError {
  constructor(detail?: string) {
    super(502, 'https://devpulse.dev/errors/github-api', 'GitHub API Error', detail);
  }
}

export class TokenExpiredError extends AppError {
  constructor(detail?: string) {
    super(401, 'https://devpulse.dev/errors/token-expired', 'Token Expired', detail);
  }
}

// ---------------------------------------------------------------------------
// Error handler middleware
// ---------------------------------------------------------------------------

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof GitHubTokenExpiredError) {
    res.status(401).json({ error: 'Token expired' });
    return;
  }

  logger.error({ err }, 'Unhandled request error');
  res.status(500).json({ error: 'Internal server error' });
}
