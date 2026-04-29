import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { processIntuitWebhook } from '../services/payment.service';
import { webhookLimiter } from '../middleware/rateLimit';
import { recordSecurityAuditEvent } from '../services/security-audit.service';
import { sendSecurityAlert } from '../services/security-alert.service';

const webhookRouter = express.Router();
const prisma = new PrismaClient();
const INTUIT_PROVIDER = 'intuit';

const getHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

const isWithinReplayWindow = (timestampSeconds: number): boolean => {
  const maxAgeSeconds = Number(process.env.INTUIT_WEBHOOK_MAX_AGE_SECONDS || '300');
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - timestampSeconds) <= maxAgeSeconds;
};

const timingSafeEquals = (provided: string, expected: string): boolean => {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const parseProvidedSignatures = (signatureHeader: string | undefined): string[] =>
  signatureHeader
    ? signatureHeader
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const verifyIntuitSignature = (params: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
}): { ok: boolean; reason?: string; signatureHash?: string } => {
  const secret = process.env.INTUIT_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  if (!secret) {
    return isProduction ? { ok: false, reason: 'missing_webhook_secret' } : { ok: true };
  }

  const signatures = parseProvidedSignatures(params.signatureHeader);
  if (!signatures.length) {
    return { ok: false, reason: 'missing_signature' };
  }

  const timestamp = params.timestampHeader ? Number(params.timestampHeader) : NaN;
  if (!params.timestampHeader || Number.isNaN(timestamp) || !Number.isFinite(timestamp)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  if (!isWithinReplayWindow(timestamp)) {
    return { ok: false, reason: 'timestamp_outside_replay_window' };
  }

  const body = params.rawBody.toString('utf8');
  const baseString = `${timestamp}.${body}`;
  const digestBase64 = crypto
    .createHmac('sha256', secret)
    .update(baseString, 'utf8')
    .digest('base64');
  const digestHex = crypto
    .createHmac('sha256', secret)
    .update(baseString, 'utf8')
    .digest('hex');

  const isValid = signatures.some((provided) => timingSafeEquals(provided, digestBase64) || timingSafeEquals(provided, digestHex));
  if (!isValid) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  const signatureHash = crypto
    .createHash('sha256')
    .update(`${timestamp}.${signatures[0]}`)
    .digest('hex');
  return { ok: true, signatureHash };
};

const reserveReplayGuard = async (signatureHash: string): Promise<boolean> => {
  try {
    await prisma.webhookReplayGuard.create({
      data: {
        provider: INTUIT_PROVIDER,
        signatureHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return true;
  } catch (error: any) {
    // P2002 = unique constraint violation -> replay
    if (error?.code === 'P2002') {
      return false;
    }
    if (error?.code === 'P2021') {
      // Older DB snapshots may not include the replay table.
      return true;
    }
    throw error;
  }
};

webhookRouter.post('/intuit', webhookLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const rawBody =
      Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}), 'utf8');
    const signatureHeader =
      getHeaderValue(req.headers['intuit-signature']) ??
      getHeaderValue(req.headers['x-intuit-signature']);
    const timestampHeader =
      getHeaderValue(req.headers['intuit-timestamp']) ??
      getHeaderValue(req.headers['x-intuit-timestamp']);
    const verify = verifyIntuitSignature({
      rawBody,
      signatureHeader,
      timestampHeader,
    });
    if (!verify.ok) {
      await recordSecurityAuditEvent({
        eventType: 'webhook.signature_invalid',
        outcome: 'rejected',
        severity: 'critical',
        provider: INTUIT_PROVIDER,
        metadata: { reason: verify.reason },
      });
      await sendSecurityAlert({
        subject: 'Webhook rejected: signature verification failed',
        summary: 'An Intuit webhook failed signature verification.',
        details: { reason: verify.reason },
      });
      res.status(401).json({ error: 'Unauthorized webhook signature' });
      return;
    }

    if (verify.signatureHash) {
      const reserved = await reserveReplayGuard(verify.signatureHash);
      if (!reserved) {
        await recordSecurityAuditEvent({
          eventType: 'webhook.replay_detected',
          outcome: 'rejected',
          severity: 'critical',
          provider: INTUIT_PROVIDER,
          metadata: { signatureHash: verify.signatureHash },
        });
        await sendSecurityAlert({
          subject: 'Webhook replay detected',
          summary: 'A replayed webhook signature was detected and blocked.',
          details: { signatureHash: verify.signatureHash },
        });
        res.status(409).json({ error: 'Webhook replay detected' });
        return;
      }
    }

    if (!rawBody || !rawBody.length) {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch (_error) {
      res.status(400).json({ error: 'Invalid webhook payload' });
      return;
    }
    const result = await processIntuitWebhook(payload);
    if (!result.accepted) {
      res.status(400).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (error) {
    console.error('Error processing Intuit webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default webhookRouter;
