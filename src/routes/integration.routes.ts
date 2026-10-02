import express, { Request, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { oauthLimiter } from '../middleware/rateLimit';
import { isSupportedOAuthProvider } from '../services/oauth/oauth.providers';
import {
  getOAuthConnectionStatus,
  refreshOAuthProviderConnection,
} from '../services/oauth/oauth.service';
import {
  createSandboxCharge,
  getSandboxCompanyInfo,
  getSandboxUserInfo,
  IntuitSandboxError,
} from '../services/intuit-sandbox.service';

const integrationRouter = express.Router();

const sendSandboxError = (res: Response, error: unknown, fallback: string): void => {
  if (error instanceof IntuitSandboxError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: fallback });
};

const readOwnerKey = (req: Request): string | undefined => {
  if (typeof req.query.ownerKey === 'string') {
    return req.query.ownerKey;
  }
  if (req.body && typeof req.body.ownerKey === 'string') {
    return req.body.ownerKey;
  }
  return undefined;
};

integrationRouter.get(
  '/intuit/sandbox/companyinfo',
  oauthLimiter,
  adminAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await getSandboxCompanyInfo(readOwnerKey(req));
      res.json({ environment: process.env.INTUIT_ENVIRONMENT || 'sandbox', data });
    } catch (error) {
      sendSandboxError(res, error, 'Failed to fetch Intuit companyinfo');
    }
  }
);

integrationRouter.get(
  '/intuit/sandbox/userinfo',
  oauthLimiter,
  adminAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await getSandboxUserInfo(readOwnerKey(req));
      res.json({ environment: process.env.INTUIT_ENVIRONMENT || 'sandbox', data });
    } catch (error) {
      sendSandboxError(res, error, 'Failed to fetch Intuit userinfo');
    }
  }
);

integrationRouter.post(
  '/intuit/sandbox/charges',
  oauthLimiter,
  adminAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const amount = req.body && typeof req.body.amount === 'string' ? req.body.amount : undefined;
      const currency = req.body && typeof req.body.currency === 'string' ? req.body.currency : undefined;
      const data = await createSandboxCharge({
        ownerKey: readOwnerKey(req),
        amount,
        currency,
      });
      res.status(201).json({ environment: 'sandbox', data });
    } catch (error) {
      sendSandboxError(res, error, 'Failed to create Intuit sandbox charge');
    }
  }
);

integrationRouter.get(
  '/:provider/status',
  oauthLimiter,
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
  oauthLimiter,
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
