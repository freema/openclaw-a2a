// Optional bearer-token auth middleware for the /a2a endpoint

import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { AppConfig } from '../config/index.js';
import { A2A_ERROR_CODES } from '../a2a/errors.js';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

/**
 * Builds auth middleware for the JSON-RPC endpoint.
 * When `config.authToken` is unset the endpoint stays public (pass-through).
 * Otherwise an `Authorization: Bearer <token>` header matching the configured
 * token is required; missing/invalid tokens get an HTTP 401 + JSON-RPC error.
 */
export function createAuthMiddleware(config: AppConfig): Middleware {
  const expected = config.authToken;
  if (!expected) {
    return (_req, _res, next) => next();
  }

  const expectedBuf = Buffer.from(expected, 'utf8');

  return (req, res, next) => {
    const header = req.header('Authorization') ?? '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    const provided = match?.[1]?.trim();

    if (provided && tokensMatch(provided, expectedBuf)) {
      return next();
    }

    res.status(401).json({
      jsonrpc: '2.0',
      id: req.body?.id ?? null,
      error: {
        code: A2A_ERROR_CODES.AUTHENTICATION_REQUIRED,
        message: 'Unauthorized: a valid Bearer token is required',
      },
    });
  };
}

function tokensMatch(provided: string, expectedBuf: Buffer): boolean {
  const providedBuf = Buffer.from(provided, 'utf8');
  // Length guard before constant-time compare (timingSafeEqual throws on length mismatch)
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
