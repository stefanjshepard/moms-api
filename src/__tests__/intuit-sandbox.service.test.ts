import axios, { AxiosError } from 'axios';
import {
  createSandboxCharge,
  getSandboxCompanyInfo,
  getSandboxUserInfo,
  IntuitSandboxError,
} from '../services/intuit-sandbox.service';
import * as oauthService from '../services/oauth/oauth.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

const connectedStatus = {
  connected: true,
  expiresAt: null,
  scopes: ['com.intuit.quickbooks.accounting'],
  updatedAt: null,
  metadata: { realmId: '934145270000' },
};

describe('Intuit sandbox API probes', () => {
  const originalEnvironment = process.env.INTUIT_ENVIRONMENT;

  beforeEach(() => {
    process.env.INTUIT_ENVIRONMENT = 'sandbox';
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
    jest.spyOn(oauthService, 'getAccessTokenForProvider').mockResolvedValue('sandbox-access-token');
    jest.spyOn(oauthService, 'getOAuthConnectionStatus').mockResolvedValue(connectedStatus);
    jest.spyOn(axios, 'isAxiosError').mockImplementation((error: unknown): error is AxiosError =>
      Boolean(error && typeof error === 'object' && (error as AxiosError).isAxiosError)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.INTUIT_ENVIRONMENT = originalEnvironment;
  });

  it('GETs sandbox companyinfo for the stored realmId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { CompanyInfo: { CompanyName: 'Sandbox Co' } } });

    const data = await getSandboxCompanyInfo();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://sandbox-quickbooks.api.intuit.com/v3/company/934145270000/companyinfo/934145270000',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sandbox-access-token',
          Accept: 'application/json',
        }),
      })
    );
    expect(data).toEqual({ CompanyInfo: { CompanyName: 'Sandbox Co' } });
  });

  it('GETs sandbox OpenID userinfo', async () => {
    mockedAxios.get.mockResolvedValue({ data: { sub: 'intuit-user' } });

    await getSandboxUserInfo();

    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://sandbox-accounts.platform.intuit.com/v1/openid_connect/userinfo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sandbox-access-token',
        }),
      })
    );
  });

  it('retries companyinfo once after a 401 refresh', async () => {
    const unauthorized = Object.assign(new Error('unauthorized'), {
      isAxiosError: true,
      response: { status: 401, data: { error: 'invalid_token' } },
    });
    mockedAxios.get.mockRejectedValueOnce(unauthorized).mockResolvedValueOnce({
      data: { CompanyInfo: { CompanyName: 'After Refresh' } },
    });
    const getToken = oauthService.getAccessTokenForProvider as jest.Mock;
    getToken.mockResolvedValueOnce('expired-token').mockResolvedValueOnce('fresh-token');

    const data = await getSandboxCompanyInfo();

    expect(getToken).toHaveBeenNthCalledWith(1, 'intuit', 'global', { forceRefresh: false });
    expect(getToken).toHaveBeenNthCalledWith(2, 'intuit', 'global', { forceRefresh: true });
    expect(data).toEqual({ CompanyInfo: { CompanyName: 'After Refresh' } });
  });

  it('POSTs the official sandbox charge URL with Request-Id', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'ch_sandbox', status: 'CAPTURED' } });

    const data = await createSandboxCharge();

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://sandbox.api.intuit.com/quickbooks/v4/payments/charges');
    expect(body).toEqual(
      expect.objectContaining({
        amount: '10.55',
        currency: 'USD',
        card: expect.objectContaining({
          number: '4111111111111111',
          expMonth: '02',
          cvc: '123',
        }),
      })
    );
    expect(config?.headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer sandbox-access-token',
        'Content-Type': 'application/json',
        'Request-Id': expect.any(String),
      })
    );
    expect(data).toEqual({ id: 'ch_sandbox', status: 'CAPTURED' });
  });

  it('refuses charges when INTUIT_ENVIRONMENT is production', async () => {
    process.env.INTUIT_ENVIRONMENT = 'production';
    await expect(createSandboxCharge()).rejects.toBeInstanceOf(IntuitSandboxError);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
