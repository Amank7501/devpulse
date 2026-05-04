import http from 'http';
import Redis from 'ioredis';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';
import { env } from '../config/env';
import logger from '../config/logger';
import { verifyJwt } from '../services/tokenService';

interface AuthMessage {
  type: 'auth';
  token: string;
}

function parseAuthMessage(raw: RawData): AuthMessage | null {
  try {
    const parsed = JSON.parse(raw.toString()) as Partial<AuthMessage>;
    if (parsed.type === 'auth' && typeof parsed.token === 'string') {
      return { type: 'auth', token: parsed.token };
    }
  } catch {
    return null;
  }

  return null;
}

export function startWsServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket) => {
    let subscriber: Redis | null = null;
    let authenticated = false;

    async function cleanup(): Promise<void> {
      if (!subscriber) return;

      const client = subscriber;
      subscriber = null;
      try {
        await client.unsubscribe();
      } catch (err) {
        logger.warn({ err }, 'Failed to unsubscribe Redis live client');
      }
      await client.quit().catch((err) => {
        logger.warn({ err }, 'Failed to quit Redis live client');
      });
    }

    socket.once('message', (raw) => {
      const authMessage = parseAuthMessage(raw);

      if (!authMessage) {
        socket.close(4001, 'Invalid auth message');
        return;
      }

      let userId: string;
      try {
        userId = verifyJwt(authMessage.token).sub;
      } catch {
        socket.close(4001, 'Invalid token');
        return;
      }

      authenticated = true;
      subscriber = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 3,
      });

      const channel = `live:${userId}`;

      subscriber.on('message', (incomingChannel, message) => {
        if (incomingChannel !== channel || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(message);
      });

      subscriber.on('error', (err) => {
        logger.error({ err, userId }, 'Redis live subscriber error');
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1011, 'Live subscription error');
        }
      });

      subscriber.subscribe(channel).catch((err) => {
        logger.error({ err, userId }, 'Failed to subscribe to live channel');
        socket.close(1011, 'Live subscription failed');
      });
    });

    socket.on('message', () => {
      if (!authenticated) return;
    });

    socket.on('close', () => {
      cleanup().catch((err) => {
        logger.warn({ err }, 'Failed to clean up websocket subscriber');
      });
    });
  });

  logger.info('WebSocket server attached at /ws');
  return wss;
}
