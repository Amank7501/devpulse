import { db } from '../config/database';
import { redisClient } from '../config/redis';
import {
  fetchRepoEvents,
  fetchUserRepos,
  checkRateLimit,
  RateLimitError,
  TokenExpiredError,
  type GitHubEvent,
  type GitHubRepo,
} from './githubClient';
import { decryptToken } from './tokenService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityEventInsert {
  repo_id: string;
  github_event_id: string;
  event_type: string;
  actor_login: string;
  actor_avatar: string | null;
  payload: object;
  commit_count: number | null;
  pr_action: string | null;
  pr_merged: boolean | null;
  pr_cycle_time_hours: number | null;
  branch: string | null;
  occurred_at: Date;
}

export interface SyncResult {
  inserted: number;
  skipped: number;
  status: 'synced' | 'not_modified' | 'rate_limited';
  apiCallsUsed: number;
}

export { TokenExpiredError } from './githubClient';

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function extractRepoLanguage(events: GitHubEvent[]): string | null {
  for (const event of events) {
    const language = (
      event.payload as {
        repo?: { language?: unknown };
        repository?: { language?: unknown };
      }
    ).repository?.language ?? (
      event.payload as { repo?: { language?: unknown } }
    ).repo?.language;

    if (typeof language === 'string' && language.length > 0) {
      return language;
    }
  }

  return null;
}

export function normalizeGitHubEvent(raw: GitHubEvent, repoId: string): ActivityEventInsert {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = raw.payload as Record<string, any>;
  let commitCount: number | null = null;
  let prAction: string | null = null;
  let prMerged: boolean | null = null;
  let prCycleTimeHours: number | null = null;
  let branch: string | null = null;

  switch (raw.type) {
    case 'PushEvent':
      commitCount = p.commits?.length ?? p.size ?? 0;
      branch = (p.ref as string | undefined)?.replace('refs/heads/', '') ?? null;
      break;

    case 'PullRequestEvent': {
      prAction = p.action ?? null;
      prMerged = p.pull_request?.merged === true;
      const pr = p.pull_request;
      if (prMerged && pr?.merged_at && pr?.created_at) {
        prCycleTimeHours =
          (new Date(pr.merged_at as string).getTime() -
            new Date(pr.created_at as string).getTime()) /
          3_600_000;
      }
      branch = pr?.head?.ref ?? null;
      break;
    }

    case 'IssuesEvent':
      prAction = p.action ?? null;
      break;

    case 'ReleaseEvent':
      branch = p.release?.tag_name ?? null;
      break;
  }

  return {
    repo_id: repoId,
    github_event_id: raw.id,
    event_type: raw.type,
    actor_login: raw.actor.login,
    actor_avatar: raw.actor.avatar_url ?? null,
    payload: raw.payload as object,
    commit_count: commitCount,
    pr_action: prAction,
    pr_merged: prMerged,
    pr_cycle_time_hours: prCycleTimeHours,
    branch,
    occurred_at: new Date(raw.created_at),
  };
}

// ---------------------------------------------------------------------------
// Per-repo sync (used for targeted manual syncs)
// ---------------------------------------------------------------------------

export async function syncRepo(userId: string, repoId: string): Promise<SyncResult> {
  const user = await db('users')
    .select('encrypted_access_token', 'github_login')
    .where({ id: userId, token_valid: true })
    .first() as { encrypted_access_token: string; github_login: string } | undefined;

  if (!user) throw new Error('User token invalid or user not found');

  const repo = await db('repos')
    .select('owner', 'name')
    .where({ id: repoId })
    .first() as { owner: string; name: string } | undefined;

  if (!repo) throw new Error(`Repo ${repoId} not found`);

  const plainToken = decryptToken(user.encrypted_access_token);
  const fullName = `${repo.owner}/${repo.name}`;
  const etagKey = `etag:repo:${userId}:${fullName}`;
  const etag = await redisClient.get(etagKey);

  let fetchResult: Awaited<ReturnType<typeof fetchRepoEvents>>;
  try {
    fetchResult = await fetchRepoEvents(plainToken, fullName, etag);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { inserted: 0, skipped: 0, status: 'rate_limited', apiCallsUsed: 0 };
    }
    if (err instanceof TokenExpiredError) {
      await db('users').where({ id: userId }).update({ token_valid: false });
      throw err;
    }
    throw err;
  }

  if (fetchResult.notModified) {
    await db('user_repo_subscriptions')
      .where({ user_id: userId, repo_id: repoId })
      .update({ last_synced: db.fn.now() });
    return { inserted: 0, skipped: 0, status: 'not_modified', apiCallsUsed: 1 };
  }

  const { events, etag: newEtag } = fetchResult;

  // Only store events where the authenticated user is the actor
  const userEvents = events.filter((e) => e.actor.login === user.github_login);

  if (newEtag) await redisClient.set(etagKey, newEtag);

  const language = extractRepoLanguage(userEvents);
  if (language) await db('repos').where({ id: repoId }).update({ language });

  if (userEvents.length === 0) {
    return { inserted: 0, skipped: 0, status: 'synced', apiCallsUsed: 1 };
  }

  const normalized = userEvents.map((e) => normalizeGitHubEvent(e, repoId));

  const insertedRows = (await db('activity_events')
    .insert(normalized)
    .onConflict('github_event_id')
    .ignore()
    .returning('id')) as Array<{ id: string }>;

  const inserted = insertedRows.length;
  const skipped = normalized.length - inserted;

  await db('user_repo_subscriptions')
    .where({ user_id: userId, repo_id: repoId })
    .update({ last_synced: db.fn.now(), sync_cursor: newEtag ?? null });

  if (inserted > 0) {
    redisClient
      .publish(
        `live:${userId}`,
        JSON.stringify({ type: 'activity_events', events: normalized.slice(0, 20) }),
      )
      .catch(() => {});
  }

  return { inserted, skipped, status: 'synced', apiCallsUsed: 1 };
}

// ---------------------------------------------------------------------------
// Full user sync: discovers all accessible repos then fetches events for each
// ---------------------------------------------------------------------------

export async function syncUserActivity(
  userId: string,
  onProgress?: (msg: string) => void,
): Promise<SyncResult> {
  // Step 0: load credentials
  const user = await db('users')
    .select('encrypted_access_token', 'github_login')
    .where({ id: userId, token_valid: true })
    .first() as { encrypted_access_token: string; github_login: string } | undefined;

  if (!user) throw new Error('User token invalid or user not found');

  await checkRateLimit(userId);

  const plainToken = decryptToken(user.encrypted_access_token);

  // Step 1: fetch all repos the user can access
  let githubRepos: GitHubRepo[];
  try {
    githubRepos = await fetchUserRepos(plainToken);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { inserted: 0, skipped: 0, status: 'rate_limited', apiCallsUsed: 0 };
    }
    if (err instanceof TokenExpiredError) {
      await db('users').where({ id: userId }).update({ token_valid: false });
      throw err;
    }
    throw err;
  }

  onProgress?.(`Fetched ${githubRepos.length} repos`);

  // Step 1b: upsert all repos and ensure subscriptions exist; build fullName→id map
  const fullNameToRepoId = new Map<string, string>();

  for (const ghRepo of githubRepos) {
    const [row] = (await db('repos')
      .insert({
        github_repo_id: ghRepo.id,
        name: ghRepo.name,
        full_name: ghRepo.full_name,
        owner: ghRepo.owner.login,
        owner_login: ghRepo.owner.login,
        is_private: ghRepo.private,
        language: ghRepo.language ?? null,
      })
      .onConflict('full_name')
      .merge(['github_repo_id', 'name', 'owner', 'owner_login', 'is_private', 'language'])
      .returning('id')) as Array<{ id: string }>;

    fullNameToRepoId.set(ghRepo.full_name, row.id);

    await db('user_repo_subscriptions')
      .insert({ user_id: userId, repo_id: row.id })
      .onConflict(['user_id', 'repo_id'])
      .ignore();
  }

  // Step 2–4: fetch events for every repo concurrently; a single failure must not
  // abort the whole sync, so use allSettled instead of all
  const eventResults = await Promise.allSettled(
    githubRepos.map(async (ghRepo) => {
      const repoId = fullNameToRepoId.get(ghRepo.full_name)!;
      const etagKey = `etag:repo:${userId}:${ghRepo.full_name}`;
      const etag = await redisClient.get(etagKey);

      const fetchResult = await fetchRepoEvents(plainToken, ghRepo.full_name, etag);

      if (fetchResult.notModified) {
        onProgress?.(`Synced ${ghRepo.full_name} (+0 events)`);
        return { inserted: 0, skipped: 0 };
      }

      const { events, etag: newEtag } = fetchResult;

      // Step 3: keep only events where the authenticated user is the actor
      const userEvents = events.filter((e) => e.actor.login === user.github_login);

      if (newEtag) await redisClient.set(etagKey, newEtag);

      if (userEvents.length === 0) {
        onProgress?.(`Synced ${ghRepo.full_name} (+0 events)`);
        return { inserted: 0, skipped: 0 };
      }

      // Step 4: upsert filtered events
      const normalized = userEvents.map((e) => normalizeGitHubEvent(e, repoId));

      const insertedRows = (await db('activity_events')
        .insert(normalized)
        .onConflict('github_event_id')
        .ignore()
        .returning('id')) as Array<{ id: string }>;

      await db('user_repo_subscriptions')
        .where({ user_id: userId, repo_id: repoId })
        .update({ last_synced: db.fn.now() });

      const repoInserted = insertedRows.length;
      onProgress?.(`Synced ${ghRepo.full_name} (+${repoInserted} events)`);
      return {
        inserted: repoInserted,
        skipped: normalized.length - repoInserted,
      };
    }),
  );

  // Aggregate results; surface TokenExpiredError if any repo returned one
  let inserted = 0;
  let skipped = 0;
  let tokenExpiredErr: TokenExpiredError | undefined;

  for (const result of eventResults) {
    if (result.status === 'fulfilled') {
      inserted += result.value.inserted;
      skipped += result.value.skipped;
    } else if (result.reason instanceof TokenExpiredError) {
      tokenExpiredErr = result.reason;
    }
  }

  if (tokenExpiredErr) {
    await db('users').where({ id: userId }).update({ token_valid: false });
    throw tokenExpiredErr;
  }

  const apiCallsUsed = 1 + githubRepos.length; // fetchUserRepos + one per repo

  onProgress?.(`Sync complete — ${inserted} new events across ${githubRepos.length} repos`);

  if (inserted > 0) {
    redisClient
      .publish(`live:${userId}`, JSON.stringify({ type: 'activity_events' }))
      .catch(() => {});
  }

  return {
    inserted,
    skipped,
    status: inserted > 0 ? 'synced' : 'not_modified',
    apiCallsUsed,
  };
}
