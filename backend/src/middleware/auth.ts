import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { redisClient } from '../config/redis';
import { verifyJwt, JwtPayload, TokenExpiredError } from '../services/tokenService';

interface AuthenticatedUser {
  id: string;
  userId: string;
  github_login?: string;
  jti?: string;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface AuthRequest extends Request {
  user: AuthenticatedUser & { github_login: string; jti: string; exp: number };
}

const UNAUTHORIZED = 'https://devpulse.dev/errors/unauthorized';

function deny(res: Response, detail: string): void {
  res.status(401).json({
    type: UNAUTHORIZED,
    title: 'Unauthorized',
    status: 401,
    detail,
  });
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token: string | undefined = req.cookies?.jwt;

  if (!token) {
    deny(res, 'No token provided');
    return;
  }

  let payload: JwtPayload;
  try {
    payload = verifyJwt(token);
  } catch (err) {
    deny(res, err instanceof TokenExpiredError ? 'Token expired' : 'Invalid token');
    return;
  }

  const revoked = await redisClient.get(`blacklist:${payload.jti}`);
  if (revoked !== null) {
    deny(res, 'Token revoked');
    return;
  }

  (req as AuthRequest).user = {
    id: payload.sub,
    userId: payload.sub,
    github_login: payload.githubLogin,
    jti: payload.jti,
    exp: payload.exp,
  };
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.header('authorization');
  const [scheme, token] = authHeader?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token || !process.env.JWT_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
    req.user = {
      id: payload.sub,
      userId: payload.sub,
      github_login: payload.githubLogin,
      jti: payload.jti,
      exp: payload.exp,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
