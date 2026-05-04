import { Router } from 'express';
import { db } from '../config/database';
import { requireAuth } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  const user = await db('users')
    .select('id', 'github_login', 'avatar_url')
    .where({ id: req.user!.userId })
    .first() as {
      id: string;
      github_login: string;
      avatar_url: string | null;
    } | undefined;

  if (!user) {
    throw new NotFoundError('User not found');
  }

  res.json({
    userId: user.id,
    githubLogin: user.github_login,
    avatarUrl: user.avatar_url,
  });
});

export default router;
