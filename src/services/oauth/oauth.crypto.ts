import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

const getEncryptionKey = (): Buffer => {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('Missing required environment variable: INTEGRATION_ENCRYPTION_KEY');
  }

  const normalized = key.trim();
  if (normalized.length === 64 && /^[0-9a-fA-F]+$/.test(normalized)) {
    return Buffer.from(normalized, 'hex');
  }

  const asBase64 = Buffer.from(normalized, 'base64');
  if (asBase64.length === 32) {
    return asBase64;
  }

  throw new Error(
    'INTEGRATION_ENCRYPTION_KEY must be 32-byte base64 or 64-char hex.'
  );
};

export const encryptSecret = (plaintext: string): string => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${authTag.toString('base64')}.${ciphertext.toString('base64')}`;
};

export const decryptSecret = (encoded: string): string => {
  const [ivB64, tagB64, dataB64] = encoded.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted secret format');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
};
