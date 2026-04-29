import express, { Request, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { runDataRetentionCleanup } from '../services/data-retention.service';

const securityRouter = express.Router();

securityRouter.post('/retention/run', authLimiter, adminAuth, async (_req: Request, res: Response) => {
  try {
    const result = await runDataRetentionCleanup();
    res.json({
      status: 'ok',
      ...result,
    });
  } catch (error) {
    console.error('Failed to run retention cleanup:', error);
    res.status(500).json({ error: 'Failed to run retention cleanup' });
  }
});

export default securityRouter;
