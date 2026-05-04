import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';
import { redisConnection } from '../config/redisClient';
import { redisClient } from '../config/redis';
import logger from '../config/logger';
import { syncUserActivity, TokenExpiredError } from '../services/syncService';

const QUEUE_NAME = 'github-sync';
const SYNC_REPEAT_EVERY_MS = 5 * 60 * 1000;
const RATE_LIMIT_RETRY_BASE_MS = 60 * 1000;
const RATE_LIMIT_RETRY_MAX_MS = 10 * 60 * 1000;

interface SyncJobData {
  userId: string;
  rateLimitRetryCount?: number;
}

const repeatOptions = { every: SYNC_REPEAT_EVERY_MS };

function syncJobId(userId: string): string {
  return `sync:${userId}`;
}

function rateLimitRetryJobId(userId: string): string {
  return `sync-rate-limit:${userId}`;
}

function rateLimitRetryJobIdPrefix(userId: string): string {
  return `${rateLimitRetryJobId(userId)}:`;
}

function getRateLimitDelay(retryCount: number): number {
  return Math.min(
    RATE_LIMIT_RETRY_BASE_MS * 2 ** retryCount,
    RATE_LIMIT_RETRY_MAX_MS,
  );
}

export const syncQueue = new Queue<SyncJobData>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: RATE_LIMIT_RETRY_BASE_MS,
    },
    removeOnComplete: true,
  },
});

async function getPendingRateLimitRetryJobs(userId: string): Promise<Array<Job<SyncJobData>>> {
  const [delayedJobs, waitingJobs] = await Promise.all([
    syncQueue.getDelayed(0, -1),
    syncQueue.getWaiting(0, -1),
  ]);
  const retryJobIdPrefix = rateLimitRetryJobIdPrefix(userId);

  return [...delayedJobs, ...waitingJobs].filter((retryJob) =>
    retryJob.id?.startsWith(retryJobIdPrefix),
  );
}

async function removePendingRateLimitRetryJobs(userId: string): Promise<number> {
  const retryJobs = await getPendingRateLimitRetryJobs(userId);

  await Promise.all(retryJobs.map((retryJob) => retryJob.remove()));

  return retryJobs.reduce(
    (maxRetryCount, retryJob) =>
      Math.max(maxRetryCount, retryJob.data.rateLimitRetryCount ?? 0),
    0,
  );
}

async function scheduleRateLimitRetry(job: Job<SyncJobData>): Promise<void> {
  const { userId } = job.data;
  const pendingRetryCount = await removePendingRateLimitRetryJobs(userId);
  const retryCount = Math.max(job.data.rateLimitRetryCount ?? 0, pendingRetryCount);
  const nextRetryCount = retryCount + 1;
  const delay = getRateLimitDelay(retryCount);

  await syncQueue.add(
    'sync',
    { userId, rateLimitRetryCount: nextRetryCount },
    {
      delay,
      jobId: `${rateLimitRetryJobIdPrefix(userId)}${nextRetryCount}`,
      removeOnComplete: true,
    },
  );

  logger.warn(
    { userId, delay, retryCount: nextRetryCount },
    'GitHub sync rate limited; scheduled delayed retry',
  );
}

export async function removeSyncJob(userId: string): Promise<void> {
  await syncQueue.removeRepeatable('sync', repeatOptions, syncJobId(userId));
  await removePendingRateLimitRetryJobs(userId);
}

export async function scheduleSyncJob(userId: string): Promise<Job<SyncJobData>> {
  return syncQueue.add(
    'sync',
    { userId },
    {
      jobId: syncJobId(userId),
      repeat: repeatOptions,
    },
  );
}

new Worker<SyncJobData>(
  QUEUE_NAME,
  async (job: Job<SyncJobData>) => {
    const { userId } = job.data;

    try {
      const onProgress = (msg: string): void => {
        redisClient
          .publish(`live:${userId}`, JSON.stringify({ type: 'sync_progress', message: msg }))
          .catch(() => {});
      };
      const result = await syncUserActivity(userId, onProgress);

      if (result.status === 'rate_limited') {
        await scheduleRateLimitRetry(job);
      } else {
        await redisClient.publish(
          `live:${userId}`,
          JSON.stringify({ type: 'sync_complete', result }),
        );
      }

      return result;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        await removeSyncJob(userId);
        logger.warn({ userId }, 'GitHub token expired; removed sync job');
        return { status: 'token_expired' };
      }

      throw err;
    }
  },
  { connection: redisConnection },
);
