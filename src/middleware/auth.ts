import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

// Simple admin authentication middleware
export const adminAuth = (req: Request, res: Response, next: NextFunction): void => {
  const headerKey = req.headers['x-admin-key'];
  const authHeader = req.headers.authorization;
  const bearerKey =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;
  const provided = typeof headerKey === 'string' ? headerKey : bearerKey;
  const expected = process.env.ADMIN_KEY;

  if (!provided || !expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}; 