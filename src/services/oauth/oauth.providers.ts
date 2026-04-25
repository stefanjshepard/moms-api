import { OAuthProvider, OAuthProviderConfig } from './oauth.types';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const parseScopes = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) {
    return fallback;
  }

  return value
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
};

export const getOAuthProviderConfig = (provider: OAuthProvider): OAuthProviderConfig => {
  switch (provider) {
    case 'google_calendar':
      return {
        provider,
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: getRequiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
        clientSecret: getRequiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
        redirectUri: getRequiredEnv('GOOGLE_OAUTH_REDIRECT_URI'),
        scopes: parseScopes(process.env.GOOGLE_OAUTH_SCOPES, [
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/userinfo.email',
        ]),
        accessType: 'offline',
        prompt: 'consent',
      };
    case 'intuit':
      return {
        provider,
        authorizeUrl: process.env.INTUIT_OAUTH_AUTHORIZE_URL || 'https://appcenter.intuit.com/connect/oauth2',
        tokenUrl: process.env.INTUIT_OAUTH_TOKEN_URL || 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        clientId: getRequiredEnv('INTUIT_OAUTH_CLIENT_ID'),
        clientSecret: getRequiredEnv('INTUIT_OAUTH_CLIENT_SECRET'),
        redirectUri: getRequiredEnv('INTUIT_OAUTH_REDIRECT_URI'),
        scopes: parseScopes(process.env.INTUIT_OAUTH_SCOPES, [
          'com.intuit.quickbooks.accounting',
          'com.intuit.quickbooks.payment',
        ]),
        usesBasicClientAuth: true,
      };
    default: {
      const exhaustive: never = provider;
      throw new Error(`Unsupported OAuth provider: ${String(exhaustive)}`);
    }
  }
};

export const isSupportedOAuthProvider = (value: string): value is OAuthProvider =>
  value === 'google_calendar' || value === 'intuit';
