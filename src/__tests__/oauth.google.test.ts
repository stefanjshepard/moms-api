import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import '../__tests__/setup';
import {
  completeOAuthAuthorization,
  createOAuthAuthorization,
} from '../services/oauth/oauth.service';

jest.mock('axios');

const prisma = new PrismaClient();
const mockedAxios = axios as jest.Mocked<typeof axios>;

const ensureGoogleTestEnv = () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || 'test-google-client-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET || 'test-google-client-secret';
  process.env.GOOGLE_OAUTH_REDIRECT_URI =
    process.env.GOOGLE_OAUTH_REDIRECT_URI ||
    'http://localhost:5001/api/oauth/callback/google_calendar';
};

describe('Google Calendar OAuth', () => {
  beforeEach(() => {
    ensureGoogleTestEnv();
    mockedAxios.post.mockReset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a Google connection that does not include Calendar access', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        access_token: 'google-access-token',
        refresh_token: 'google-refresh-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/userinfo.email openid',
      },
    });

    const { state } = await createOAuthAuthorization('google_calendar');
    await expect(
      completeOAuthAuthorization({
        provider: 'google_calendar',
        code: 'auth-code',
        state,
      })
    ).rejects.toThrow(/Calendar access/);
  });
});
