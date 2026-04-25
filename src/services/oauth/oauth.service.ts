import axios from 'axios';
import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { decryptSecret, encryptSecret } from './oauth.crypto';
import { getOAuthProviderConfig } from './oauth.providers';
import { OAuthProvider, OAuthTokenResponse } from './oauth.types';

const prisma = new PrismaClient();
const OAUTH_STATE_TTL_MINUTES = 15;
const DEFAULT_OWNER_KEY = 'global';

const b64Url = (buf: Buffer): string =>
  buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const createPkceVerifier = (): string => b64Url(crypto.randomBytes(64));

const createPkceChallenge = (verifier: string): string =>
  b64Url(crypto.createHash('sha256').update(verifier).digest());

const exchangeCode = async (
  provider: OAuthProvider,
  code: string,
  codeVerifier?: string
): Promise<OAuthTokenResponse> => {
  const cfg = getOAuthProviderConfig(provider);

  const params = new URLSearchParams();
  params.set('grant_type', 'authorization_code');
  params.set('code', code);
  params.set('redirect_uri', cfg.redirectUri);
  params.set('client_id', cfg.clientId);
  if (!cfg.usesBasicClientAuth) {
    params.set('client_secret', cfg.clientSecret);
  }
  if (codeVerifier) {
    params.set('code_verifier', codeVerifier);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cfg.usesBasicClientAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
  }

  const response = await axios.post<OAuthTokenResponse>(cfg.tokenUrl, params.toString(), { headers });
  return response.data;
};

const refreshToken = async (provider: OAuthProvider, refreshTokenValue: string): Promise<OAuthTokenResponse> => {
  const cfg = getOAuthProviderConfig(provider);

  const params = new URLSearchParams();
  params.set('grant_type', 'refresh_token');
  params.set('refresh_token', refreshTokenValue);
  params.set('client_id', cfg.clientId);
  if (!cfg.usesBasicClientAuth) {
    params.set('client_secret', cfg.clientSecret);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (cfg.usesBasicClientAuth) {
    headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`;
  }

  const response = await axios.post<OAuthTokenResponse>(cfg.tokenUrl, params.toString(), { headers });
  return response.data;
};

const getTokenExpiryDate = (seconds?: number): Date | null => {
  if (!seconds || Number.isNaN(seconds)) {
    return null;
  }
  return new Date(Date.now() + seconds * 1000);
};

export const createOAuthAuthorization = async (
  provider: OAuthProvider,
  options?: { ownerKey?: string; clientId?: string; redirectPath?: string }
): Promise<{ state: string; authorizationUrl: string }> => {
  const cfg = getOAuthProviderConfig(provider);
  const state = b64Url(crypto.randomBytes(32));
  const codeVerifier = createPkceVerifier();
  const codeChallenge = createPkceChallenge(codeVerifier);

  await prisma.oAuthState.create({
    data: {
      provider,
      state,
      codeVerifier,
      redirectPath: options?.redirectPath ?? null,
      clientId: options?.clientId ?? null,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MINUTES * 60 * 1000),
    },
  });

  const params = new URLSearchParams();
  params.set('response_type', 'code');
  params.set('client_id', cfg.clientId);
  params.set('redirect_uri', cfg.redirectUri);
  params.set('scope', cfg.scopes.join(' '));
  params.set('state', state);
  params.set('code_challenge', codeChallenge);
  params.set('code_challenge_method', 'S256');
  if (cfg.accessType) {
    params.set('access_type', cfg.accessType);
  }
  if (cfg.prompt) {
    params.set('prompt', cfg.prompt);
  }

  return {
    state,
    authorizationUrl: `${cfg.authorizeUrl}?${params.toString()}`,
  };
};

export const completeOAuthAuthorization = async (params: {
  provider: OAuthProvider;
  code: string;
  state: string;
  ownerKey?: string;
}): Promise<{ provider: OAuthProvider; ownerKey: string; redirectPath: string | null }> => {
  const ownerKey = params.ownerKey ?? DEFAULT_OWNER_KEY;

  const stateRecord = await prisma.oAuthState.findUnique({
    where: { state: params.state },
  });

  if (!stateRecord || stateRecord.provider !== params.provider) {
    throw new Error('Invalid OAuth state');
  }
  if (stateRecord.consumedAt) {
    throw new Error('OAuth state already consumed');
  }
  if (stateRecord.expiresAt.getTime() < Date.now()) {
    throw new Error('OAuth state expired');
  }

  const tokenResponse = await exchangeCode(params.provider, params.code, stateRecord.codeVerifier ?? undefined);
  if (!tokenResponse.refresh_token) {
    throw new Error('Provider did not return a refresh token');
  }
  const refreshTokenValue = tokenResponse.refresh_token;

  const scopes = tokenResponse.scope
    ? tokenResponse.scope.split(/\s+/).filter(Boolean)
    : getOAuthProviderConfig(params.provider).scopes;

  await prisma.$transaction(async (tx) => {
    await tx.oAuthState.update({
      where: { id: stateRecord.id },
      data: { consumedAt: new Date() },
    });

    await tx.integrationConnection.upsert({
      where: {
        provider_ownerKey: {
          provider: params.provider,
          ownerKey,
        },
      },
      update: {
        clientId: stateRecord.clientId ?? undefined,
        accessTokenEncrypted: tokenResponse.access_token
          ? encryptSecret(tokenResponse.access_token)
          : undefined,
        refreshTokenEncrypted: encryptSecret(refreshTokenValue),
        tokenExpiresAt: getTokenExpiryDate(tokenResponse.expires_in),
        scopes,
        metadata: tokenResponse.realmId
          ? { realmId: tokenResponse.realmId }
          : undefined,
        isActive: true,
      },
      create: {
        provider: params.provider,
        ownerKey,
        clientId: stateRecord.clientId ?? null,
        accessTokenEncrypted: tokenResponse.access_token
          ? encryptSecret(tokenResponse.access_token)
          : null,
        refreshTokenEncrypted: encryptSecret(refreshTokenValue),
        tokenExpiresAt: getTokenExpiryDate(tokenResponse.expires_in),
        scopes,
        metadata: tokenResponse.realmId ? { realmId: tokenResponse.realmId } : undefined,
        isActive: true,
      },
    });
  });

  return {
    provider: params.provider,
    ownerKey,
    redirectPath: stateRecord.redirectPath,
  };
};

export const getAccessTokenForProvider = async (
  provider: OAuthProvider,
  ownerKey: string = DEFAULT_OWNER_KEY
): Promise<string | null> => {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider_ownerKey: { provider, ownerKey } },
  });

  if (!connection || !connection.isActive) {
    return null;
  }

  const needsRefresh =
    !connection.accessTokenEncrypted ||
    (connection.tokenExpiresAt ? connection.tokenExpiresAt.getTime() <= Date.now() + 60_000 : false);

  if (!needsRefresh && connection.accessTokenEncrypted) {
    return decryptSecret(connection.accessTokenEncrypted);
  }

  const refreshed = await refreshToken(provider, decryptSecret(connection.refreshTokenEncrypted));

  const updated = await prisma.integrationConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEncrypted: refreshed.access_token ? encryptSecret(refreshed.access_token) : connection.accessTokenEncrypted,
      refreshTokenEncrypted: refreshed.refresh_token
        ? encryptSecret(refreshed.refresh_token)
        : connection.refreshTokenEncrypted,
      tokenExpiresAt: getTokenExpiryDate(refreshed.expires_in),
      scopes: refreshed.scope ? refreshed.scope.split(/\s+/).filter(Boolean) : connection.scopes,
      metadata: refreshed.realmId
        ? {
            ...((connection.metadata as Record<string, unknown> | null) ?? {}),
            realmId: refreshed.realmId,
          }
        : (connection.metadata as Prisma.InputJsonValue | undefined),
    },
  });

  return updated.accessTokenEncrypted ? decryptSecret(updated.accessTokenEncrypted) : null;
};

export const getOAuthConnectionStatus = async (
  provider: OAuthProvider,
  ownerKey: string = DEFAULT_OWNER_KEY
): Promise<{ connected: boolean; expiresAt: string | null; scopes: string[]; updatedAt: string | null }> => {
  const connection = await prisma.integrationConnection.findUnique({
    where: { provider_ownerKey: { provider, ownerKey } },
  });
  if (!connection || !connection.isActive) {
    return { connected: false, expiresAt: null, scopes: [], updatedAt: null };
  }

  return {
    connected: true,
    expiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
    scopes: connection.scopes,
    updatedAt: connection.updatedAt.toISOString(),
  };
};

export const disconnectOAuthProvider = async (
  provider: OAuthProvider,
  ownerKey: string = DEFAULT_OWNER_KEY
): Promise<void> => {
  await prisma.integrationConnection.updateMany({
    where: { provider, ownerKey },
    data: {
      isActive: false,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: encryptSecret(crypto.randomUUID()),
      tokenExpiresAt: null,
      metadata: Prisma.JsonNull,
    },
  });
};
