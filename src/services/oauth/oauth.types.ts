export type OAuthProvider = 'google_calendar' | 'intuit';

export interface OAuthProviderConfig {
  provider: OAuthProvider;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  accessType?: 'offline' | 'online';
  prompt?: string;
  usesBasicClientAuth?: boolean;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  realmId?: string;
  x_refresh_token_expires_in?: number;
}
