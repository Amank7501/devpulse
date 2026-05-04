import { db } from '../../src/config/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityEvent {
  id: string;
  repo_id: string;
  github_event_id: string;
  event_type: string;
  actor_login: string;
  actor_avatar: string | null;
  payload: Record<string, unknown>;
  commit_count: number | null;
  pr_action: string | null;
  pr_merged: boolean | null;
  pr_cycle_time_hours: number | null;
  branch: string | null;
  occurred_at: Date;
  inserted_at: Date;
}

export interface RecentEventsResult {
  events: ActivityEvent[];
  nextCursor: string | null;
}

export interface CommitFrequencyRow {
  date: string;
  count: number;
  repoId: string;
}

export interface PRCycleTimeRow {
  week: string;
  avgHours: number;
  prCount: number;
}

export interface ContributorStatsRow {
  actorLogin: string;
  commitCount: number;
  prCount: number;
  avatarUrl: string;
}

// ---------------------------------------------------------------------------
// getRecentEvents
// ---------------------------------------------------------------------------

export async function getRecentEvents(params: {
  userId: string;
  repoIds?: string[];
  eventTypes?: string[];
  cursor?: string;
  limit?: number;
}): Promise<RecentEventsResult> {
  const { userId, repoIds, eventTypes, cursor, limit = 50 } = params;

  // Short-circuit if an explicit empty repoIds list was provided
  if (repoIds !== undefined && repoIds.length === 0) {
    return { events: [], nextCursor: null };
  }

  let query = db('activity_events as ae')
    .join('user_repo_subscriptions as urs', 'ae.repo_id', 'urs.repo_id')
    .where('urs.user_id', userId)
    .where('urs.is_active', true)
    .select('ae.*')
    .orderBy('ae.occurred_at', 'desc')
    .limit(limit + 1); // +1 to detect next page

  if (repoIds && repoIds.length > 0) {
    query = query.whereIn('ae.repo_id', repoIds);
  }

  if (eventTypes && eventTypes.length > 0) {
    query = query.whereIn('ae.event_type', eventTypes);
  }

  if (cursor) {
    query = query.where(
      'ae.occurred_at',
      '<',
      db('activity_events').where('id', cursor).select('occurred_at'),
    );
  }

  const rows = (await query) as ActivityEvent[];
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? events[events.length - 1].id : null;

  return { events, nextCursor };
}

// ---------------------------------------------------------------------------
// getCommitFrequency
// ---------------------------------------------------------------------------

export async function getCommitFrequency(params: {
  repoIds: string[];
  startDate: string;
  endDate: string;
  granularity: 'day' | 'week' | 'month';
}): Promise<CommitFrequencyRow[]> {
  const { repoIds, startDate, endDate, granularity } = params;

  if (repoIds.length === 0) return [];

  const rows = await db('activity_events')
    .where('event_type', 'PushEvent')
    .whereIn('repo_id', repoIds)
    .whereBetween('occurred_at', [startDate, endDate])
    .groupByRaw('date_trunc(?, occurred_at), repo_id', [granularity])
    .orderByRaw('date_trunc(?, occurred_at) ASC', [granularity])
    .select(
      db.raw('date_trunc(?, occurred_at)::text as date', [granularity]),
      db.raw('COALESCE(SUM(commit_count), 0)::int as count'),
      db.raw('repo_id as "repoId"'),
    );

  return rows as CommitFrequencyRow[];
}

// ---------------------------------------------------------------------------
// getPRCycleTime
// ---------------------------------------------------------------------------

export async function getPRCycleTime(params: {
  repoIds: string[];
  startDate: string;
  endDate: string;
}): Promise<PRCycleTimeRow[]> {
  const { repoIds, startDate, endDate } = params;

  if (repoIds.length === 0) return [];

  const rows = await db('activity_events')
    .where('event_type', 'PullRequestEvent')
    .where('pr_merged', true)
    .whereIn('repo_id', repoIds)
    .whereBetween('occurred_at', [startDate, endDate])
    .groupByRaw("date_trunc('week', occurred_at)")
    .orderByRaw("date_trunc('week', occurred_at) ASC")
    .select(
      db.raw("date_trunc('week', occurred_at)::text as week"),
      db.raw('ROUND(AVG(pr_cycle_time_hours)::numeric, 2)::float as "avgHours"'),
      db.raw('COUNT(*)::int as "prCount"'),
    );

  return rows as PRCycleTimeRow[];
}

// ---------------------------------------------------------------------------
// getContributorStats
// ---------------------------------------------------------------------------

export async function getContributorStats(params: {
  repoIds: string[];
  startDate: string;
  endDate: string;
}): Promise<ContributorStatsRow[]> {
  const { repoIds, startDate, endDate } = params;

  if (repoIds.length === 0) return [];

  const [commitRows, prRows] = await Promise.all([
    db('activity_events')
      .where('event_type', 'PushEvent')
      .whereIn('repo_id', repoIds)
      .whereBetween('occurred_at', [startDate, endDate])
      .groupBy('actor_login', 'actor_avatar')
      .select(
        'actor_login',
        'actor_avatar',
        db.raw('COALESCE(SUM(commit_count), 0)::int as commit_count'),
      ) as Promise<Array<{ actor_login: string; actor_avatar: string | null; commit_count: number }>>,

    db('activity_events')
      .where('event_type', 'PullRequestEvent')
      .where('pr_merged', true)
      .whereIn('repo_id', repoIds)
      .whereBetween('occurred_at', [startDate, endDate])
      .groupBy('actor_login')
      .select('actor_login', db.raw('COUNT(*)::int as pr_count')) as Promise<
      Array<{ actor_login: string; pr_count: number }>
    >,
  ]);

  const statsMap = new Map<string, ContributorStatsRow>();

  for (const row of commitRows) {
    statsMap.set(row.actor_login, {
      actorLogin: row.actor_login,
      commitCount: row.commit_count,
      prCount: 0,
      avatarUrl: row.actor_avatar ?? '',
    });
  }

  for (const row of prRows) {
    const existing = statsMap.get(row.actor_login);
    if (existing) {
      existing.prCount = row.pr_count;
    } else {
      statsMap.set(row.actor_login, {
        actorLogin: row.actor_login,
        commitCount: 0,
        prCount: row.pr_count,
        avatarUrl: '',
      });
    }
  }

  return [...statsMap.values()]
    .sort((a, b) => b.commitCount - a.commitCount)
    .slice(0, 20);
}
