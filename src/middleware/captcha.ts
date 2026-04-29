import { Request, Response, NextFunction } from 'express';

const getTokenFromRequest = (req: Request): string | null => {
  const headerValue = req.headers['x-captcha-token'];
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue;
  }
  const bodyToken = req.body?.captchaToken;
  if (typeof bodyToken === 'string' && bodyToken.trim()) {
    return bodyToken;
  }
  return null;
};

const verifyCaptchaToken = async (token: string, remoteIp?: string): Promise<boolean> => {
  const secret = process.env.CAPTCHA_SECRET;
  if (!secret) {
    return true;
  }

  const provider = process.env.CAPTCHA_PROVIDER || 'turnstile';
  const verifyUrl =
    process.env.CAPTCHA_VERIFY_URL ||
    (provider === 'hcaptcha'
      ? 'https://hcaptcha.com/siteverify'
      : 'https://challenges.cloudflare.com/turnstile/v0/siteverify');

  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteIp) {
    form.set('remoteip', remoteIp);
  }

  const response = await fetch(verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!response.ok) {
    return false;
  }

  const data = (await response.json()) as { success?: boolean };
  return data.success === true;
};

export const captchaIfConfigured = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!process.env.CAPTCHA_SECRET) {
    next();
    return;
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Captcha token is required.' });
    return;
  }

  try {
    const isValid = await verifyCaptchaToken(token, req.ip);
    if (!isValid) {
      res.status(401).json({ error: 'Captcha verification failed.' });
      return;
    }
    next();
  } catch (_error) {
    res.status(401).json({ error: 'Captcha verification failed.' });
  }
};
