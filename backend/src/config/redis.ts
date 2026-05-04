import Redis from 'ioredis';
import { env } from './env';

const sharedOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
};

export const redisClient = new Redis(env.REDIS_URL, sharedOptions);
export const redisSubscriber = new Redis(env.REDIS_URL, sharedOptions);

redisClient.on('error', (err: Error) => {
  console.error('[redis] client error:', err.message);
});

redisSubscriber.on('error', (err: Error) => {
  console.error('[redis] subscriber error:', err.message);
});

export async function testRedisConnection(): Promise<true> {
  await redisClient.ping();
  return true;
}
