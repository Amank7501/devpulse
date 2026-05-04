import { Router } from 'express';
import { randomBytes } from 'crypto';
import axios from 'axios';
import { z } from 'zod';
import { fetchGitHubUser } from '../services/githubClient';
import { db } from '../config/database';
import { redisClient } from '../config/redis';
import { env } from '../config/env';
import { encryptToken, signJwt } from '../services/tokenService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { NotFoundError, GitHubApiError } from '../middleware/errorHandler';

const router = Router();

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface UpsertedUser {
  id: string;
  github_login: string;
}

const cookieOpts = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};

router.get('/github', async (_req, res) => {
  const state = randomBytes(16).toString('hex');
  await redisClient.set(`oauth:state:${state}`, '1', 'EX', 5 * 60);

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_REDIRECT_URI,
    scope: 'read:user repo',
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get('/github/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  if (!state) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { code } = z
    .object({ code: z.string().min(1) })
    .parse(req.query);

  const stateKey = `oauth:state:${state}`;
  const stateValid = await redisClient.get(stateKey);
  if (stateValid === null) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  await redisClient.del(stateKey);

  const { data: tokenData } = await axios.post<GitHubTokenResponse>(
    'https://github.com/login/oauth/access_token',
    {
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_REDIRECT_URI,
    },
    { headers: { Accept: 'application/json' } },
  );

  if (tokenData.error) {
    throw new GitHubApiError(tokenData.error_description ?? tokenData.error);
  }

  const githubUser = await fetchGitHubUser(tokenData.access_token);

  const result = await db.raw(
    `INSERT INTO users (github_id, github_login, display_name, avatar_url, email, encrypted_access_token)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (github_id) DO UPDATE SET
       github_login           = EXCLUDED.github_login,
       display_name           = EXCLUDED.display_name,
       avatar_url             = EXCLUDED.avatar_url,
       email                  = EXCLUDED.email,
       encrypted_access_token = EXCLUDED.encrypted_access_token,
       token_valid            = true,
       updated_at             = NOW()
     RETURNING id, github_login`,
    [
      githubUser.id,
      githubUser.login,
      githubUser.name ?? null,
      githubUser.avatar_url,
      githubUser.email ?? null,
      encryptToken(tokenData.access_token),
    ],
  );

  const user = result.rows[0] as UpsertedUser;
  const jwtToken = signJwt({ sub: user.id, githubLogin: user.github_login });

  res.cookie('jwt', jwtToken, { ...cookieOpts, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.redirect(`${env.FRONTEND_URL}/login?token=${encodeURIComponent(jwtToken)}`);
});

router.post('/logout', authenticate, async (req, res) => {
  const { jti, exp } = (req as AuthRequest).user;
  const ttl = exp - Math.floor(Date.now() / 1000);

  if (ttl > 0) {
    await redisClient.set(`blacklist:${jti}`, '1', 'EX', ttl);
  }

  res.clearCookie('jwt', cookieOpts);
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await db('users')
    .select('id', 'github_login', 'display_name', 'avatar_url', 'email', 'created_at')
    .where({ id: (req as AuthRequest).user.id })
    .first();

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json(user);
});

export default router;
