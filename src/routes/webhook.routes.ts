import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { authLimiter } from '../middleware/rateLimit';
import { processIntuitWebhook } from '../services/payment.service';

const webhookRouter = express.Router();

const isValidWebhookSecret = (provided: string | undefined, expected: string | undefined): boolean => {
  if (!expected) {
    return true;
  }
  if (!provided) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

webhookRouter.post('/intuit', authLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const secretHeader = req.headers['x-intuit-webhook-secret'];
    const providedSecret = typeof secretHeader === 'string' ? secretHeader : undefined;
    if (!isValidWebhookSecret(providedSecret, process.env.INTUIT_WEBHOOK_SECRET)) {
      res.status(401).json({ error: 'Unauthorized webhook signature' });
      return;
    }

    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }

    const result = await processIntuitWebhook(req.body as Record<string, unknown>);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error processing Intuit webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default webhookRouter;
