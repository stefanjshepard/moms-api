import crypto from 'crypto';

interface BookingTokenPayload {
  appointmentId: string;
  email: string;
  iat: number;
  exp: number;
}

const TOKEN_LIFETIME_SECONDS = 60 * 60 * 2; // 2 hours

const b64UrlEncode = (input: Buffer | string): string =>
  (typeof input === 'string' ? Buffer.from(input, 'utf8') : input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const b64UrlDecode = (input: string): Buffer => {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const normalized = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  return Buffer.from(normalized, 'base64');
};

const getBookingTokenSecret = (): string => {
  const value = process.env.BOOKING_TOKEN_SECRET;
  if (!value) {
    throw new Error('Missing BOOKING_TOKEN_SECRET');
  }
  return value;
};

const sign = (data: string, secret: string): string =>
  b64UrlEncode(crypto.createHmac('sha256', secret).update(data).digest());

export const createBookingAccessToken = (params: {
  appointmentId: string;
  email: string;
  now?: Date;
  ttlSeconds?: number;
}): string => {
  const secret = getBookingTokenSecret();
  const nowEpoch = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const payload: BookingTokenPayload = {
    appointmentId: params.appointmentId,
    email: params.email.toLowerCase(),
    iat: nowEpoch,
    exp: nowEpoch + (params.ttlSeconds ?? TOKEN_LIFETIME_SECONDS),
  };
  const header = { alg: 'HS256', typ: 'BKT' };
  const encodedHeader = b64UrlEncode(JSON.stringify(header));
  const encodedPayload = b64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(data, secret);
  return `${data}.${signature}`;
};

export const verifyBookingAccessToken = (
  token: string,
  options?: { now?: Date; expectedAppointmentId?: string }
): { valid: true; payload: BookingTokenPayload } | { valid: false; reason: string } => {
  const secret = getBookingTokenSecret();
  const segments = token.split('.');
  if (segments.length !== 3) {
    return { valid: false, reason: 'invalid_format' };
  }

  const [encodedHeader, encodedPayload, signature] = segments;
  const data = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = sign(data, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return { valid: false, reason: 'invalid_signature' };
  }

  let payload: BookingTokenPayload;
  try {
    payload = JSON.parse(b64UrlDecode(encodedPayload).toString('utf8')) as BookingTokenPayload;
  } catch (_error) {
    return { valid: false, reason: 'invalid_payload' };
  }

  if (!payload.appointmentId || !payload.email || !payload.exp || !payload.iat) {
    return { valid: false, reason: 'invalid_payload' };
  }

  const nowEpoch = Math.floor((options?.now ?? new Date()).getTime() / 1000);
  if (payload.exp < nowEpoch) {
    return { valid: false, reason: 'expired' };
  }
  if (options?.expectedAppointmentId && payload.appointmentId !== options.expectedAppointmentId) {
    return { valid: false, reason: 'appointment_mismatch' };
  }

  return { valid: true, payload };
};
