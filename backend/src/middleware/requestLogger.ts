import morgan from 'morgan';
import { env } from '../config/env';

export const requestLogger = morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev');
