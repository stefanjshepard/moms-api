import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { app } from '../index';
import '../__tests__/setup';
import {
  completeOAuthAuthorization,
  createOAuthAuthorization,
  getOAuthConnectionStatus,
} from '../services/oauth/oauth.service';

jest.mock('axios');

const prisma = new PrismaClient();
const mockedAxios = axios as jest.Mocked<typeof axios>;

const ensureIntuitTestEnv = () => {
  process.env.INTUIT_OAUTH_CLIENT_ID = process.env.INTUIT_OAUTH_CLIENT_ID || 'test-intuit-client-id';
  process.env.INTUIT_OAUTH_CLIENT_SECRET = process.env.INTUIT_OAUTH_CLIENT_SECRET || 'test-intuit-client-secret';
  process.env.INTUIT_OAUTH_REDIRECT_URI =
    process.env.INTUIT_OAUTH_REDIRECT_URI || 'http://localhost:5001/api/oauth/callback/intuit';
  if (!process.env.ADMIN_KEY) {
    process.env.ADMIN_KEY = 'test-admin-key';
  }
};

describe('Intuit OAuth', () => {
  beforeEach(() => {
    ensureIntuitTestEnv();
    mockedAxios.post.mockReset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('builds the official authorize URL without PKCE', async () => {
    const response = await request(app)
      .post('/api/oauth/intuit/authorize')
      .set('x-admin-key', process.env.ADMIN_KEY || '')
      .expect(200);

    const url = new URL(response.body.authorizationUrl);
    expect(url.origin + url.pathname).toBe('https://appcenter.intuit.com/connect/oauth2');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe(process.env.INTUIT_OAUTH_REDIRECT_URI);
    expect(url.searchParams.get('scope')).toContain('com.intuit.quickbooks.accounting');
    expect(url.searchParams.get('scope')).toContain('com.intuit.quickbooks.payment');
    expect(url.searchParams.has('code_challenge')).toBe(false);
    expect(url.searchParams.has('code_challenge_method')).toBe(false);
  });

  it('stores realmId from the callback query and exchanges the code with Basic auth', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        access_token: 'intuit-access-token',
        refresh_token: 'intuit-refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        x_refresh_token_expires_in: 8640000,
      },
    });

    const { state } = await createOAuthAuthorization('intuit');
    await completeOAuthAuthorization({
      provider: 'intuit',
      code: 'auth-code',
      state,
      realmId: '934145270000',
    });

    const [tokenUrl, body, config] = mockedAxios.post.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer');
    expect(String(body)).toContain('grant_type=authorization_code');
    expect(String(body)).toContain('code=auth-code');
    expect(String(body)).not.toContain('code_verifier');
    expect(config?.headers?.Authorization).toMatch(/^Basic /);

    const status = await getOAuthConnectionStatus('intuit');
    expect(status.connected).toBe(true);
    expect(status.metadata).toEqual({ realmId: '934145270000' });
  });
});
