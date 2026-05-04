import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  getActivitySummary,
  getContributorStats,
  getRecentEvents,
} from '../db/queries/activityQueries';

const router = Router();

const granularitySchema = z
  .enum(['day', 'week', 'month'])
  .default('day');

const limitSchema = (defaultLimit: number) =>
  z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(defaultLimit);

router.get('/summary', requireAuth, async (req, res) => {
  const granularity = granularitySchema.parse(req.query.granularity);
  const data = await getActivitySummary(req.user!.userId, granularity);

  res.json({ data });
});

router.get('/contributors', requireAuth, async (req, res) => {
  const limit = limitSchema(10).parse(req.query.limit);
  const data = await getContributorStats(req.user!.userId, limit);

  res.json({ data });
});

router.get('/events', requireAuth, async (req, res) => {
  const query = z
    .object({
      cursor: z.string().min(1).optional(),
      limit: limitSchema(20),
    })
    .parse(req.query);

  const result = await getRecentEvents(req.user!.userId, query);

  res.json({
    data: result.events,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  });
});

export default router;
