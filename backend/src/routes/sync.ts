import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { removeSyncJob, scheduleSyncJob } from '../workers';

const router = Router();

router.post('/trigger', requireAuth, async (req, res) => {
  await scheduleSyncJob(req.user!.userId);
  res.json({ status: 'scheduled' });
});

router.delete('/cancel', requireAuth, async (req, res) => {
  await removeSyncJob(req.user!.userId);
  res.json({ status: 'cancelled' });
});

export default router;
