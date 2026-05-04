import axios, { AxiosInstance } from 'axios';
import { redisClient } from '../config/redis';
import { decryptToken } from './tokenService';

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class RateLimitError extends Error {
  constructor(public readonly resetAt: number) {
    super('GitHub rate limit exceeded');
    this.name = 'RateLimitError';
  }
}

export class TokenExpiredError extends Error {
  constructor() {
    super('GitHub token expired or revoked');
    this.name = 'TokenExpiredError';
  }
}

export class SecondaryRateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super('GitHub secondary rate limit');
    this.name = 'SecondaryRateLimitError';
  }
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export class GitHubApiError extends ApiError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = 'GitHubApiError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubEvent {
  id: string;
  type: string;
  actor: { login: string; avatar_url: string };
  repo: { id: number; name: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  created_at: string;
}

export interface GitHubUserProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  language: string | null;
  owner: { login: string };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export async function checkRateLimit(userId: string): Promise<void> {
  const remaining = await redisClient.hget(`gh:ratelimit:${userId}`, 'remaining');
  if (remaining !== null && Number(remaining) < 100) {
    const resetTs = await redisClient.hget(`gh:ratelimit:${userId}`, 'reset');
    throw new RateLimitError(Number(resetTs ?? '0'));
  }
}

// Client with per-user rate-limit header caching (used for fetchGitHubUser).
function makeGitHubClient(userId: string, encryptedToken: string): AxiosInstance {
  const client = axios.create({
    baseURL: 'https://api.github.com',
    timeout: 10000,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DevPulse/1.0',
      Authorization: `token ${decryptToken(encryptedToken)}`,
    },
  });

  client.interceptors.response.use(
    (response) => {
      const h = response.headers;
      const remaining = h['x-ratelimit-remaining'];
      const reset = h['x-ratelimit-reset'];
      const limit = h['x-ratelimit-limit'];
      if (remaining !== undefined && reset !== undefined && limit !== undefined) {
        redisClient
          .hset(`gh:ratelimit:${userId}`, { remaining, reset, limit })
          .catch(() => {});
      }
      return response;
    },
    (error) => {
      if (!error.response) return Promise.reject(error);

      const { status, headers, data } = error.response as {
        status: number;
        headers: Record<string, string>;
        data: { message?: string };
      };

      if (status === 401) return Promise.reject(new TokenExpiredError());
      if (status === 403 && headers['x-ratelimit-remaining'] === '0') {
        return Promise.reject(new RateLimitError(Number(headers['x-ratelimit-reset'])));
      }
      if (status === 429) {
        return Promise.reject(
          new SecondaryRateLimitError(Number(headers['retry-after']) || 60),
        );
      }
      return Promise.reject(new GitHubApiError(status, data?.message ?? 'GitHub API error'));
    },
  );

  return client;
}

// Lightweight client for plain-token callers (no Redis caching, same error mapping).
function makeTokenClient(plainToken: string): AxiosInstance {
  const client = axios.create({
    baseURL: 'https://api.github.com',
    timeout: 10000,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'DevPulse/1.0',
      Authorization: `token ${plainToken}`,
    },
  });

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (!error.response) return Promise.reject(error);

      const { status, headers, data } = error.response as {
        status: number;
        headers: Record<string, string>;
        data: { message?: string };
      };

      if (status === 401) return Promise.reject(new TokenExpiredError());
      if (status === 403 && headers['x-ratelimit-remaining'] === '0') {
        return Promise.reject(new RateLimitError(Number(headers['x-ratelimit-reset'])));
      }
      if (status === 429) {
        return Promise.reject(
          new SecondaryRateLimitError(Number(headers['retry-after']) || 60),
        );
      }
      return Promise.reject(new GitHubApiError(status, data?.message ?? 'GitHub API error'));
    },
  );

  return client;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchUserRepos(token: string): Promise<GitHubRepo[]> {
  const client = makeTokenClient(token);
  const response = await client.get<GitHubRepo[]>('/user/repos', {
    params: {
      affiliation: 'owner,collaborator,organization_member',
      visibility: 'all',
      per_page: 100,
      sort: 'pushed',
      direction: 'desc',
    },
  });
  return response.data;
}

export async function fetchRepoEvents(
  token: string,
  fullName: string,
  etag?: string | null,
): Promise<{ events: GitHubEvent[]; etag: string | null; notModified: boolean }> {
  const client = makeTokenClient(token);
  const response = await client.get<GitHubEvent[]>(`/repos/${fullName}/events`, {
    params: { per_page: 100 },
    headers: etag ? { 'If-None-Match': etag } : {},
    validateStatus: (s) => (s >= 200 && s < 300) || s === 304,
  });

  if (response.status === 304) {
    return { events: [], etag: etag ?? null, notModified: true };
  }

  return {
    events: response.data,
    etag: (response.headers['etag'] as string | undefined) ?? null,
    notModified: false,
  };
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUserProfile> {
  const response = await axios.get<GitHubUserProfile>('https://api.github.com/user', {
    headers: {
      Authorization: `token ${accessToken}`,
      'User-Agent': 'DevPulse/1.0',
      Accept: 'application/vnd.github.v3+json',
    },
    timeout: 10000,
  });
  return response.data;
}

// Kept for internal use by any callers that still need the userId-scoped client.
export { makeGitHubClient };
