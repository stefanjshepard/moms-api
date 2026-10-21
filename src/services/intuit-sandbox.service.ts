import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { getIntuitApiEndpoints, getIntuitEnvironment } from './oauth/oauth.providers';
import * as oauthService from './oauth/oauth.service';

const INTUIT_PROVIDER = 'intuit' as const;
const DEFAULT_OWNER_KEY = 'global';

export class IntuitSandboxError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'IntuitSandboxError';
    this.statusCode = statusCode;
  }
}

const getOwnerKey = (ownerKey?: string): string => ownerKey || DEFAULT_OWNER_KEY;

const formatIntuitErrorBody = (data: unknown): string => {
  if (!data) {
    return 'empty response';
  }
  if (typeof data === 'string') {
    return data.slice(0, 500);
  }
  try {
    return JSON.stringify(data).slice(0, 500);
  } catch {
    return 'unreadable response';
  }
};

const mapAxiosError = (error: unknown, action: string): IntuitSandboxError => {
  if (error instanceof IntuitSandboxError) {
    return error;
  }
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const detail = formatIntuitErrorBody(axiosError.response?.data);
    if (status === 401) {
      return new IntuitSandboxError(`Intuit ${action} unauthorized after token refresh: ${detail}`, 401);
    }
    return new IntuitSandboxError(`Intuit ${action} failed (${status ?? 'network'}): ${detail}`, 502);
  }
  if (error instanceof Error) {
    return new IntuitSandboxError(error.message, 502);
  }
  return new IntuitSandboxError(`Intuit ${action} failed`, 502);
};

const getConnectedAccessToken = async (ownerKey: string, forceRefresh = false): Promise<string> => {
  const token = await oauthService.getAccessTokenForProvider(INTUIT_PROVIDER, ownerKey, { forceRefresh });
  if (!token) {
    throw new IntuitSandboxError('Intuit is not connected. Complete OAuth first.', 400);
  }
  return token;
};

const getStoredRealmId = async (ownerKey: string): Promise<string> => {
  const status = await oauthService.getOAuthConnectionStatus(INTUIT_PROVIDER, ownerKey);
  if (!status.connected) {
    throw new IntuitSandboxError('Intuit is not connected. Complete OAuth first.', 400);
  }
  const realmId = status.metadata?.realmId;
  if (typeof realmId !== 'string' || !realmId.trim()) {
    throw new IntuitSandboxError(
      'Missing Intuit realmId. Reconnect OAuth; Intuit sends realmId on the callback URL.',
      400
    );
  }
  return realmId.trim();
};

const withBearerRetry = async <T>(
  ownerKey: string,
  action: string,
  requestFn: (accessToken: string) => Promise<T>
): Promise<T> => {
  const firstToken = await getConnectedAccessToken(ownerKey);
  try {
    return await requestFn(firstToken);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const refreshed = await getConnectedAccessToken(ownerKey, true);
      try {
        return await requestFn(refreshed);
      } catch (retryError) {
        throw mapAxiosError(retryError, action);
      }
    }
    throw mapAxiosError(error, action);
  }
};

const jsonHeaders = (accessToken: string, extra?: Record<string, string>): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: 'application/json',
  ...extra,
});

export const getSandboxCompanyInfo = async (ownerKey?: string): Promise<unknown> => {
  const resolvedOwnerKey = getOwnerKey(ownerKey);
  const realmId = await getStoredRealmId(resolvedOwnerKey);
  const { companyBaseUrl } = getIntuitApiEndpoints();
  const url = `${companyBaseUrl}/${realmId}/companyinfo/${realmId}`;

  return withBearerRetry(resolvedOwnerKey, 'companyinfo', async (accessToken) => {
    const response = await axios.get(url, { headers: jsonHeaders(accessToken) });
    return response.data;
  });
};

export const getSandboxUserInfo = async (ownerKey?: string): Promise<unknown> => {
  const resolvedOwnerKey = getOwnerKey(ownerKey);
  const { userinfoUrl } = getIntuitApiEndpoints();

  return withBearerRetry(resolvedOwnerKey, 'userinfo', async (accessToken) => {
    const response = await axios.get(userinfoUrl, { headers: jsonHeaders(accessToken) });
    return response.data;
  });
};

const officialSandboxChargeBody = (amount: string, currency: string) => {
  const expYear = String(new Date().getUTCFullYear() + 2);
  // Field names match Intuit's official PHP Payments SDK charge sample.
  return {
    amount,
    currency,
    card: {
      number: '4111111111111111',
      expMonth: '02',
      expYear,
      cvc: '123',
      address: {
        streetAddress: '1130 Kifer Rd',
        city: 'Sunnyvale',
        region: 'CA',
        country: 'US',
        postalCode: '94086',
      },
    },
    context: {
      mobile: 'false',
      isEcommerce: 'true',
    },
  };
};

export const createSandboxCharge = async (params?: {
  ownerKey?: string;
  amount?: string;
  currency?: string;
}): Promise<unknown> => {
  if (getIntuitEnvironment() !== 'sandbox') {
    throw new IntuitSandboxError(
      'Sandbox charge probe is disabled unless INTUIT_ENVIRONMENT=sandbox.',
      400
    );
  }

  const resolvedOwnerKey = getOwnerKey(params?.ownerKey);
  const { chargesUrl } = getIntuitApiEndpoints();
  const amount = params?.amount?.trim() || '10.55';
  const currency = (params?.currency?.trim() || 'USD').toUpperCase();
  const body = officialSandboxChargeBody(amount, currency);

  return withBearerRetry(resolvedOwnerKey, 'charges', async (accessToken) => {
    const response = await axios.post(chargesUrl, body, {
      headers: jsonHeaders(accessToken, {
        'Content-Type': 'application/json',
        'Request-Id': crypto.randomUUID(),
      }),
    });
    return response.data;
  });
};
