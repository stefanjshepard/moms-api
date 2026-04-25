import express, { Request, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { isSupportedOAuthProvider } from '../services/oauth/oauth.providers';
import {
  completeOAuthAuthorization,
  createOAuthAuthorization,
  disconnectOAuthProvider,
  getOAuthConnectionStatus,
} from '../services/oauth/oauth.service';

const oauthRouter = express.Router();

oauthRouter.post('/:provider/authorize', authLimiter, adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = req.params.provider;
    if (!isSupportedOAuthProvider(provider)) {
      res.status(400).json({ error: 'Unsupported OAuth provider' });
      return;
    }

    const { redirectPath, ownerKey, clientId } = req.body ?? {};
    const response = await createOAuthAuthorization(provider, {
      redirectPath: typeof redirectPath === 'string' ? redirectPath : undefined,
      ownerKey: typeof ownerKey === 'string' ? ownerKey : undefined,
      clientId: typeof clientId === 'string' ? clientId : undefined,
    });
    res.json(response);
  } catch (error) {
    console.error('Error creating OAuth authorization URL:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create OAuth authorization URL' });
  }
});

oauthRouter.get('/callback/:provider', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = req.params.provider;
    if (!isSupportedOAuthProvider(provider)) {
      res.status(400).json({ error: 'Unsupported OAuth provider' });
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const ownerKey = typeof req.query.ownerKey === 'string' ? req.query.ownerKey : undefined;
    if (!code || !state) {
      res.status(400).json({ error: 'Missing OAuth callback parameters' });
      return;
    }

    const result = await completeOAuthAuthorization({
      provider,
      code,
      state,
      ownerKey,
    });

    if (result.redirectPath) {
      const target = new URL(result.redirectPath, process.env.FRONTEND_URL || 'http://localhost:3000');
      target.searchParams.set('provider', result.provider);
      target.searchParams.set('connected', 'true');
      res.redirect(target.toString());
      return;
    }

    res.json({
      status: 'connected',
      provider: result.provider,
      ownerKey: result.ownerKey,
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(400).json({ error: error instanceof Error ? error.message : 'OAuth callback failed' });
  }
});

oauthRouter.get('/:provider/status', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = req.params.provider;
    if (!isSupportedOAuthProvider(provider)) {
      res.status(400).json({ error: 'Unsupported OAuth provider' });
      return;
    }

    const ownerKey = typeof req.query.ownerKey === 'string' ? req.query.ownerKey : undefined;
    const status = await getOAuthConnectionStatus(provider, ownerKey);
    res.json({ provider, ownerKey: ownerKey || 'global', ...status });
  } catch (error) {
    console.error('Error fetching OAuth connection status:', error);
    res.status(500).json({ error: 'Failed to fetch OAuth connection status' });
  }
});

oauthRouter.delete('/:provider/connection', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = req.params.provider;
    if (!isSupportedOAuthProvider(provider)) {
      res.status(400).json({ error: 'Unsupported OAuth provider' });
      return;
    }

    const ownerKey = typeof req.query.ownerKey === 'string' ? req.query.ownerKey : undefined;
    await disconnectOAuthProvider(provider, ownerKey);
    res.status(204).send();
  } catch (error) {
    console.error('Error disconnecting OAuth provider:', error);
    res.status(500).json({ error: 'Failed to disconnect OAuth provider' });
  }
});

export default oauthRouter;
