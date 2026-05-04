import { db } from '../../config/database';

export type ActivityGranularity = 'day' | 'week' | 'month';

export interface ActivitySummaryRow {
  period: string;
  eventCount: number;
  commitCount: number;
  pullRequestCount: number;
  issueCount: number;
}

export interface TopRepoRow {
  repoId: string;
  owner: string;
  name: string;
  eventCount: number;
  commitCount: number;
  pullRequestCount: number;
}

export interface LanguageBreakdownRow {
  language: string;
  count: number;
}

export interface ContributorStats {
  topRepos: TopRepoRow[];
  languageBreakdown: LanguageBreakdownRow[];
}

export interface ActivityEventRow {
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
  events: ActivityEventRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function getActivitySummary(
  userId: string,
  granularity: ActivityGranularity,
): Promise<ActivitySummaryRow[]> {
  // granularity is safe to interpolate — validated by Zod enum before this call
  const trunc = `date_trunc('${granularity}', ae.occurred_at)`;

  const rows = await db('activity_events as ae')
    .join('user_repo_subscriptions as urs', 'ae.repo_id', 'urs.repo_id')
    .where('urs.user_id', userId)
    .where('urs.is_active', true)
    .groupByRaw(trunc)
    .orderByRaw(`${trunc} ASC`)
    .select(
      db.raw(`${trunc}::text as period`),
      db.raw('COUNT(*)::int as "eventCount"'),
      db.raw(
        'COALESCE(SUM(CASE WHEN ae.event_type = ? THEN ae.commit_count ELSE 0 END), 0)::int as "commitCount"',
        ['PushEvent'],
      ),
      db.raw(
        'COUNT(*) FILTER (WHERE ae.event_type = ?)::int as "pullRequestCount"',
        ['PullRequestEvent'],
      ),
      db.raw(
        'COUNT(*) FILTER (WHERE ae.event_type = ?)::int as "issueCount"',
        ['IssuesEvent'],
      ),
    );

  return rows as ActivitySummaryRow[];
}

export async function getContributorStats(
  userId: string,
  limit: number,
): Promise<ContributorStats> {
  const topRepos = await db('activity_events as ae')
    .join('user_repo_subscriptions as urs', 'ae.repo_id', 'urs.repo_id')
    .join('repos as r', 'ae.repo_id', 'r.id')
    .where('urs.user_id', userId)
    .where('urs.is_active', true)
    .groupBy('r.id', 'r.owner', 'r.name')
    .orderBy('eventCount', 'desc')
    .limit(limit)
    .select(
      db.raw('r.id as "repoId"'),
      'r.owner',
      'r.name',
      db.raw('COUNT(*)::int as "eventCount"'),
      db.raw(
        'COALESCE(SUM(CASE WHEN ae.event_type = ? THEN ae.commit_count ELSE 0 END), 0)::int as "commitCount"',
        ['PushEvent'],
      ),
      db.raw(
        'COUNT(*) FILTER (WHERE ae.event_type = ?)::int as "pullRequestCount"',
        ['PullRequestEvent'],
      ),
    ) as TopRepoRow[];

  const languageBreakdown = await db('activity_events as ae')
    .join('user_repo_subscriptions as urs', 'ae.repo_id', 'urs.repo_id')
    .join('repos as r', 'ae.repo_id', 'r.id')
    .where('urs.user_id', userId)
    .where('urs.is_active', true)
    .whereNotNull('r.language')
    .groupBy('r.language')
    .orderBy('count', 'desc')
    .select(
      db.raw('r.language as language'),
      db.raw('COUNT(*)::int as count'),
    ) as LanguageBreakdownRow[];

  return {
    topRepos,
    languageBreakdown,
  };
}

export async function getRecentEvents(
  userId: string,
  options: { cursor?: string; limit: number },
): Promise<RecentEventsResult> {
  const { cursor, limit } = options;
  let query = db('activity_events as ae')
    .join('user_repo_subscriptions as urs', 'ae.repo_id', 'urs.repo_id')
    .where('urs.user_id', userId)
    .where('urs.is_active', true)
    .select('ae.*')
    .orderBy('ae.occurred_at', 'desc')
    .limit(limit + 1);

  if (cursor) {
    query = query.where(
      'ae.occurred_at',
      '<',
      db('activity_events').where('id', cursor).select('occurred_at'),
    );
  }

  const rows = (await query) as ActivityEventRow[];
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? events[events.length - 1].id : null;

  return { events, nextCursor, hasMore };
}
