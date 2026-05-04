import http from 'http';
import app from './app';
import { db, testConnection } from './config/database';
import { redisClient, redisSubscriber, testRedisConnection } from './config/redis';
import logger from './config/logger';
import { env } from './config/env';
import { startWsServer } from './ws/wsServer';
import './workers';

export const server = http.createServer(app);
startWsServer(server);

async function start(): Promise<void> {
  try {
    await testConnection();
    logger.info('Database connection established');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to database');
    throw err;
  }

  try {
    await testRedisConnection();
    logger.info('Redis connection established');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Redis');
    throw err;
  }

  server.listen(env.PORT, () => {
    logger.info(`Dev Pulse backend running on port ${env.PORT}`);
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received, draining connections');
  server.close(() => {
    (async () => {
      await db.destroy();
      await redisClient.quit();
      await redisSubscriber.quit();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    })().catch((err) => {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    });
  });
}

process.on('SIGTERM', () => { shutdown('SIGTERM').catch(() => process.exit(1)); });
process.on('SIGINT', () => { shutdown('SIGINT').catch(() => process.exit(1)); });

start().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error');
  process.exit(1);
});
