import express, { Request, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { isSupportedOAuthProvider } from '../services/oauth/oauth.providers';
import {
  getOAuthConnectionStatus,
  refreshOAuthProviderConnection,
} from '../services/oauth/oauth.service';

const integrationRouter = express.Router();

integrationRouter.get(
  '/:provider/status',
  authLimiter,
  adminAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = req.params.provider;
      if (!isSupportedOAuthProvider(provider)) {
        res.status(400).json({ error: 'Unsupported provider' });
        return;
      }

      const ownerKey = typeof req.query.ownerKey === 'string' ? req.query.ownerKey : undefined;
      const status = await getOAuthConnectionStatus(provider, ownerKey);
      res.json({
        provider,
        ownerKey: ownerKey ?? 'global',
        ...status,
      });
    } catch (error) {
      console.error('Error fetching integration status:', error);
      res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }
);

integrationRouter.post(
  '/:provider/refresh',
  authLimiter,
  adminAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const provider = req.params.provider;
      if (!isSupportedOAuthProvider(provider)) {
        res.status(400).json({ error: 'Unsupported provider' });
        return;
      }

      const ownerKey =
        req.body && typeof req.body.ownerKey === 'string' ? req.body.ownerKey : undefined;
      const refreshResult = await refreshOAuthProviderConnection(provider, ownerKey);
      const status = await getOAuthConnectionStatus(provider, ownerKey);

      res.json({
        provider,
        ownerKey: ownerKey ?? 'global',
        ...refreshResult,
        ...status,
      });
    } catch (error) {
      console.error('Error refreshing provider connection:', error);
      res.status(500).json({ error: 'Failed to refresh provider connection' });
    }
  }
);

export default integrationRouter;
