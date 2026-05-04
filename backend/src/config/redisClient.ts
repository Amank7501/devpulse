import Redis from 'ioredis';
import { env } from './env';

export const redisConnection = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redisConnection.on('error', (err: Error) => {
  console.error('[redis] bullmq connection error:', err.message);
});
