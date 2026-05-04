import pino from 'pino';
import { env } from './env';

const isDev = env.NODE_ENV === 'development';

function buildTransport(): pino.TransportSingleOptions | undefined {
  if (!isDev) return undefined;
  try {
    require.resolve('pino-pretty');
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  } catch {
    return undefined;
  }
}

const transport = buildTransport();

const logger = pino({
  level: env.LOG_LEVEL,
  ...(transport ? { transport } : {}),
});

export default logger;
