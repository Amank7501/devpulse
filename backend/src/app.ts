import 'express-async-errors';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth';
import reposRouter from './routes/repos';
import activityRouter from './routes/activity';
import analyticsRouter from './routes/analytics';
import syncRouter from './routes/sync';
import meRouter from './routes/me';
import healthRouter from './routes/health';

const app = express();
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests' });
  },
});

app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
}));
app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));
app.use(requestLogger);

app.use('/api/auth', authRateLimiter);
app.use('/api/auth', authRouter);
app.use('/api/repos', reposRouter);
app.use('/api/activity', activityRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/sync', syncRouter);
app.use('/api', meRouter);
app.use('/api/health', healthRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ status: 404, title: 'Not Found', detail: 'Route not found' });
});

app.use(errorHandler);

export default app;
