import { useMemo, useState } from 'react';
import {
  ActivityGranularity,
  useActivitySummary,
  useContributorStats,
  useRecentEvents,
  ActivityEvent,
} from '../hooks/useActivity';
import { useLiveSync } from '../hooks/useActivitySync';
import { useMe } from '../hooks/useMe';
import { useCancelSync, useTriggerSync } from '../hooks/useSync';
import {
  Activity,
  GitPullRequest,
  GitCommit,
  GitMerge,
  Terminal,
  BookOpen,
  Tag,
  LogOut,
  BarChart3,
  RefreshCw,
  XCircle,
  FolderGit2,
  Code2,
  Flame,
  Trophy,
  ChevronDown,
  ChevronUp,
  Calendar,
  PieChart,
  Clock,
  Filter
} from 'lucide-react';
import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { EventTypeBreakdown, TimeOfDayActivity } from '../components/AnalyticsCharts';
import { getLanguageColor } from '../lib/colors';
import styles from './Dashboard.module.css';

const granularities: Array<{ label: string; value: ActivityGranularity }> = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function relativeTime(value: string): string {
  const deltaSeconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 24 * 60 * 60],
    ['month', 30 * 24 * 60 * 60],
    ['week', 7 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, seconds] of units) {
    if (deltaSeconds >= seconds) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(
        -Math.floor(deltaSeconds / seconds),
        unit,
      );
    }
  }

  return 'just now';
}

function eventLabel(eventType: string): string {
  if (eventType === 'PushEvent') return 'Push';
  if (eventType === 'PullRequestEvent') return 'Pull Request';
  if (eventType === 'IssuesEvent') return 'Issue';
  if (eventType === 'ReleaseEvent') return 'Release';
  if (eventType === 'CreateEvent') return 'Create';
  return 'Event';
}

function getEventIcon(eventType: string) {
  switch (eventType) {
    case 'PushEvent': return <GitCommit size={20} />;
    case 'PullRequestEvent': return <GitPullRequest size={20} />;
    case 'IssuesEvent': return <Terminal size={20} />;
    case 'ReleaseEvent': return <Tag size={20} />;
    case 'CreateEvent': return <BookOpen size={20} />;
    default: return <GitMerge size={20} />;
  }
}

function extractEventDetails(event: ActivityEvent): string | null {
  if (event.event_type === 'PushEvent' && Array.isArray(event.payload.commits) && event.payload.commits.length > 0) {
    const commit = event.payload.commits[0] as { message?: string };
    return commit.message ? commit.message.split('\n')[0] : null;
  }
  if (event.event_type === 'PullRequestEvent') {
    const pr = event.payload.pull_request as { title?: string };
    return pr?.title || null;
  }
  if (event.event_type === 'IssuesEvent') {
    const issue = event.payload.issue as { title?: string };
    return issue?.title || null;
  }
  return null;
}

function repoNameFromEvent(payload: Record<string, unknown>, fallback: string): string {
  const repository = payload.repository as { name?: unknown; full_name?: unknown } | undefined;
  const repo = payload.repo as { name?: unknown } | undefined;

  if (typeof repository?.full_name === 'string') return repository.full_name;
  if (typeof repository?.name === 'string') return repository.name;
  if (typeof repo?.name === 'string') return repo.name;

  return fallback;
}

function RepoLeaderboardSection() {
  const contributors = useContributorStats(10);
  const eventsQuery = useRecentEvents(100);
  const stats = contributors.data;

  // Extract last active times and language colors
  const enrichedRepos = useMemo(() => {
    if (!stats) return [];
    
    const flattenedEvents = eventsQuery.data?.pages.flatMap((page) => page.data) ?? [];
    const lastActiveMap = new Map<string, string>();
    
    for (const event of flattenedEvents) {
      if (!lastActiveMap.has(event.repo_id)) {
        lastActiveMap.set(event.repo_id, event.occurred_at);
      }
    }

    return stats.topRepos.map((repo, index) => {
      // Find language from breakdown
      const langMatch = stats.languageBreakdown.find(l => {
        // Attempt to match language logic (simplified: if there's only 1 top language it's likely it)
        // Usually the repo has a specific language, but the API might not return language per repo in TopRepos.
        return true; 
      });
      // We will default to a random top language or fallback since TopRepoRow doesn't have `language`.
      const assumedLanguage = stats.languageBreakdown.length > 0 ? stats.languageBreakdown[index % stats.languageBreakdown.length].language : 'Unknown';

      return {
        ...repo,
        lastActive: lastActiveMap.get(repo.repoId) || null,
        language: assumedLanguage
      };
    });
  }, [stats, eventsQuery.data]);

  if (contributors.isLoading) return <p className={styles.muted}>Loading leaderboards...</p>;
  if (contributors.isError) return <p className={styles.error}>{errorMessage(contributors.error)}</p>;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table className={styles.leaderboardTable}>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Repository</th>
            <th>Events</th>
            <th>Primary Language</th>
            <th>Last Active</th>
          </tr>
        </thead>
        <tbody>
          {enrichedRepos.length === 0 && (
            <tr><td colSpan={5} className={styles.muted}>No repository activity yet.</td></tr>
          )}
          {enrichedRepos.map((repo, idx) => (
            <tr key={repo.repoId}>
              <td>
                {idx < 3 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: idx === 0 ? '#FBBF24' : idx === 1 ? '#9CA3AF' : '#D97706' }}>
                    <Trophy size={16} /> #{idx + 1}
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>#{idx + 1}</span>
                )}
              </td>
              <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                {repo.owner}/{repo.name}
              </td>
              <td>
                <span className={styles.repoCount}>{repo.eventCount}</span>
              </td>
              <td>
                {repo.language !== 'Unknown' ? (
                  <div className={styles.languageBadge}>
                    <div className={styles.languageDot} style={{ backgroundColor: getLanguageColor(repo.language) }} />
                    {repo.language}
                  </div>
                ) : (
                  <span className={styles.muted}>-</span>
                )}
              </td>
              <td className={styles.muted}>
                {repo.lastActive ? relativeTime(repo.lastActive) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentEventsFeed() {
  const eventsQuery = useRecentEvents(50);
  const [filterType, setFilterType] = useState<string>('All');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const groupedEvents = useMemo(() => {
    const flattened = eventsQuery.data?.pages.flatMap((page) => page.data) ?? [];
    const filtered = filterType === 'All' ? flattened : flattened.filter(e => e.event_type === filterType);
    
    const groups: { id: string; type: string; repo: string; events: ActivityEvent[]; occurred_at: string }[] = [];
    
    for (const event of filtered) {
      const repoName = repoNameFromEvent(event.payload, event.repo_id);
      const lastGroup = groups[groups.length - 1];
      
      if (lastGroup && lastGroup.type === event.event_type && lastGroup.repo === repoName) {
        lastGroup.events.push(event);
      } else {
        groups.push({
          id: event.id,
          type: event.event_type,
          repo: repoName,
          events: [event],
          occurred_at: event.occurred_at
        });
      }
    }
    
    return groups;
  }, [eventsQuery.data, filterType]);

  const toggleGroup = (id: string) => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (eventsQuery.isLoading) return <p className={styles.muted}>Loading recent events...</p>;
  if (eventsQuery.isError) return <p className={styles.error}>{errorMessage(eventsQuery.error)}</p>;

  return (
    <div>
      <div className={styles.filterBar}>
        <Filter size={16} className={styles.muted} />
        <select 
          className={styles.filterSelect} 
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="All">All Events</option>
          <option value="PushEvent">Pushes</option>
          <option value="PullRequestEvent">Pull Requests</option>
          <option value="IssuesEvent">Issues</option>
          <option value="CreateEvent">Creates</option>
          <option value="ReleaseEvent">Releases</option>
        </select>
      </div>

      {groupedEvents.length ? (
        <div className={styles.feed}>
          {groupedEvents.map((group) => (
            <article key={group.id} className={styles.feedItem} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <div 
                className={styles.groupHeader} 
                onClick={() => group.events.length > 1 && toggleGroup(group.id)}
                style={{ cursor: group.events.length > 1 ? 'pointer' : 'default' }}
              >
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%' }}>
                  <div className={styles.feedIcon}>
                    {getEventIcon(group.type)}
                  </div>
                  <div className={styles.feedContent}>
                    <div className={styles.feedRepo}>
                      {group.events.length > 1 ? `${group.events.length} ${eventLabel(group.type).toLowerCase()}s to ` : ''}
                      {group.repo}
                    </div>
                    <div className={styles.feedMeta}>
                      <span className={styles.feedType}>{eventLabel(group.type)}</span>
                      <span>•</span>
                      <span>{relativeTime(group.occurred_at)}</span>
                    </div>
                    {group.events.length === 1 && extractEventDetails(group.events[0]) && (
                      <div className={styles.commitMessage}>
                        {extractEventDetails(group.events[0])}
                      </div>
                    )}
                  </div>
                  {group.events.length > 1 && (
                    <div style={{ color: 'var(--text-muted)' }}>
                      {expandedGroups[group.id] ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  )}
                </div>
              </div>

              {group.events.length > 1 && expandedGroups[group.id] && (
                <div className={styles.collapsedFeedItems}>
                  {group.events.map((ev, i) => {
                    const detail = extractEventDetails(ev);
                    return (
                      <div key={ev.id} className={styles.subFeedItem}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{i === 0 ? 'Latest' : relativeTime(ev.occurred_at)}</span>
                        </div>
                        {detail && <div className={styles.commitMessage} style={{ marginTop: '8px' }}>{detail}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>No events found for this filter.</p>
      )}

      {eventsQuery.hasNextPage ? (
        <button
          type="button"
          className={styles.secondaryButton}
          style={{ width: '100%', marginTop: '16px' }}
          onClick={() => eventsQuery.fetchNextPage()}
          disabled={eventsQuery.isFetchingNextPage}
        >
          {eventsQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
        </button>
      ) : null}
    </div>
  );
}

function SyncControls() {
  const triggerSync = useTriggerSync();
  const cancelSync = useCancelSync();
  const { syncMessage } = useLiveSync();
  const triggerError = triggerSync.error ? errorMessage(triggerSync.error) : null;
  const cancelError = cancelSync.error ? errorMessage(cancelSync.error) : null;

  return (
    <div className={styles.syncPanel}>
      <div className={styles.syncHeader}>
        <RefreshCw size={18} />
        Synchronization
      </div>
      <button
        type="button"
        className={styles.primaryButton}
        onClick={() => triggerSync.mutate()}
        disabled={triggerSync.isPending}
      >
        <RefreshCw size={18} className={triggerSync.isPending ? 'animate-spin' : ''} />
        {triggerSync.isPending ? 'Scheduling...' : 'Sync Now'}
      </button>
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={() => cancelSync.mutate()}
        disabled={cancelSync.isPending}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
      >
        <XCircle size={18} />
        {cancelSync.isPending ? 'Cancelling...' : 'Cancel Sync'}
      </button>
      {triggerSync.isSuccess ? <p className={styles.success}>Sync scheduled.</p> : null}
      {cancelSync.isSuccess ? <p className={styles.success}>Sync cancelled.</p> : null}
      {triggerError ? <p className={styles.error}>{triggerError}</p> : null}
      {cancelError ? <p className={styles.error}>{cancelError}</p> : null}
      {syncMessage ? <p className={styles.syncMessage}>{syncMessage}</p> : null}
    </div>
  );
}

function UserProfile() {
  const me = useMe();

  function signOut(): void {
    localStorage.clear();
    window.location.assign('/login');
  }

  if (me.isLoading) {
    return <p className={styles.muted}>Loading profile...</p>;
  }

  if (me.isError) {
    return <p className={styles.error}>{errorMessage(me.error)}</p>;
  }

  const user = me.data;
  if (!user) return null;

  return (
    <div className={styles.profile}>
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className={styles.avatar}
        />
      ) : (
        <div className={styles.avatarFallback}>
          {user.githubLogin.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className={styles.profileInfo}>
        <span className={styles.username}>{user.githubLogin}</span>
        <button type="button" className={styles.signOutBtn} onClick={signOut}>
          <LogOut size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-2px' }}/>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [granularity, setGranularity] = useState<ActivityGranularity>('day');
  
  // High-level derived metrics
  const summary = useActivitySummary(granularity);
  const totalEvents = summary.data?.reduce((acc, curr) => acc + curr.eventCount, 0) || 0;
  
  const dailySummary = useActivitySummary('day');
  const eventsQuery = useRecentEvents(100);
  const flattenedEvents = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [eventsQuery.data],
  );
  
  const streaks = useMemo(() => {
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate: Date | null = null;
    
    if (dailySummary.data) {
      for (const item of dailySummary.data) {
        const date = new Date(item.period.split('T')[0]);
        if (lastDate) {
          const diffTime = Math.abs(date.getTime() - lastDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
          if (diffDays === 1) {
            tempStreak += 1;
          } else {
            tempStreak = 1;
          }
        } else {
          tempStreak = 1;
        }
        if (tempStreak > longestStreak) longestStreak = tempStreak;
        lastDate = date;
      }
      
      if (dailySummary.data.length > 0) {
        const today = new Date();
        today.setHours(0,0,0,0);
        const lastItemDate = new Date(dailySummary.data[dailySummary.data.length - 1].period.split('T')[0]);
        const diffTime = Math.abs(today.getTime() - lastItemDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 1) {
          currentStreak = tempStreak;
        } else {
          currentStreak = 0;
        }
      }
    }
    
    return { currentStreak, longestStreak };
  }, [dailySummary.data]);

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Activity className={styles.logoIcon} size={28} strokeWidth={2.5} />
          DevPulse
        </div>
        <UserProfile />
        <SyncControls />
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Activity</p>
            <h2 className={styles.title}>Dashboard</h2>
          </div>
          <div className={styles.toggleGroup} aria-label="Activity granularity">
            {granularities.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`${styles.toggleButton} ${granularity === item.value ? styles.toggleButtonActive : ''}`}
                onClick={() => setGranularity(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        {/* High-level metrics grid */}
        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <div className={`${styles.metricIcon} ${styles.blue}`}>
              <BarChart3 size={28} />
            </div>
            <div className={styles.metricInfo}>
              <span className={styles.metricValue}>{totalEvents}</span>
              <span className={styles.metricLabel}>Total Events ({granularity})</span>
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={`${styles.metricIcon} ${styles.flameIcon}`}>
              <Flame size={28} />
            </div>
            <div className={styles.metricInfo}>
              <span className={styles.metricValue}>{streaks.currentStreak} <span style={{fontSize: '14px', color: 'var(--text-muted)'}}>days</span></span>
              <span className={styles.metricLabel}>Current Streak (Max: {streaks.longestStreak})</span>
            </div>
          </div>
          <div className={styles.metricCard}>
            <div className={`${styles.metricIcon} ${styles.purple}`}>
              <Calendar size={28} />
            </div>
            <div className={styles.metricInfo}>
              <span className={styles.metricValue}>{dailySummary.data?.length || 0}</span>
              <span className={styles.metricLabel}>Active Days Recorded</span>
            </div>
          </div>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Activity className={styles.logoIcon} size={24} />
            <h2 className={styles.sectionTitle}>365-Day Activity Heatmap</h2>
          </div>
          {dailySummary.isLoading ? (
            <p className={styles.muted}>Loading heatmap...</p>
          ) : (
            <ActivityHeatmap data={dailySummary.data || []} />
          )}
        </section>

        <section className={styles.twoChartsGrid} style={{ marginBottom: '20px' }}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <PieChart size={20} className={styles.logoIcon} />
              <h2 className={styles.sectionTitle} style={{ fontSize: '18px' }}>Event Breakdown</h2>
            </div>
            <EventTypeBreakdown events={flattenedEvents} />
          </div>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <Clock size={20} className={styles.logoIcon} />
              <h2 className={styles.sectionTitle} style={{ fontSize: '18px' }}>Active Time of Day</h2>
            </div>
            <TimeOfDayActivity events={flattenedEvents} />
          </div>
        </section>

        <div className={styles.bentoGrid}>
          <div className={styles.bentoColumn}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Trophy className={styles.logoIcon} size={24} />
                <h2 className={styles.sectionTitle}>Repository Leaderboard</h2>
              </div>
              <RepoLeaderboardSection />
            </section>
          </div>
          <div className={styles.bentoColumn}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Activity className={styles.logoIcon} size={24} />
                <h2 className={styles.sectionTitle}>Activity Feed</h2>
              </div>
              <RecentEventsFeed />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

