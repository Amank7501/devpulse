import {
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export type ActivityGranularity = 'day' | 'week' | 'month';

export interface ActivitySummary {
  period: string;
  eventCount: number;
  commitCount: number;
  pullRequestCount: number;
  issueCount: number;
}

export interface TopRepo {
  repoId: string;
  owner: string;
  name: string;
  eventCount: number;
  commitCount: number;
  pullRequestCount: number;
}

export interface LanguageBreakdown {
  language: string;
  count: number;
}

export interface ContributorStats {
  topRepos: TopRepo[];
  languageBreakdown: LanguageBreakdown[];
}

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
  occurred_at: string;
  inserted_at: string;
}

interface DataResponse<T> {
  data: T;
}

export interface RecentEventsPage {
  data: ActivityEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const activityQueryKeys = {
  all: ['activity'] as const,
  summary: (granularity: ActivityGranularity) =>
    [...activityQueryKeys.all, 'summary', granularity] as const,
  contributors: (limit: number) =>
    [...activityQueryKeys.all, 'contributors', limit] as const,
  events: (limit: number) =>
    [...activityQueryKeys.all, 'events', limit] as const,
};

function withSearchParams(
  path: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function useActivitySummary(granularity: ActivityGranularity) {
  return useQuery({
    queryKey: activityQueryKeys.summary(granularity),
    queryFn: async () => {
      const response = await apiClient<DataResponse<ActivitySummary[]>>(
        withSearchParams('/api/activity/summary', { granularity }),
      );
      return response.data;
    },
  });
}

export function useContributorStats(limit = 10) {
  return useQuery({
    queryKey: activityQueryKeys.contributors(limit),
    queryFn: async () => {
      const response = await apiClient<DataResponse<ContributorStats>>(
        withSearchParams('/api/activity/contributors', { limit }),
      );
      return response.data;
    },
  });
}

export function useRecentEvents(limit = 20) {
  return useInfiniteQuery({
    queryKey: activityQueryKeys.events(limit),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiClient<RecentEventsPage>(
        withSearchParams('/api/activity/events', {
          cursor: pageParam as string | undefined,
          limit,
        }),
      ),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
  });
}
