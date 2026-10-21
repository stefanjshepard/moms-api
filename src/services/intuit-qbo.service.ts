import axios, { AxiosError } from 'axios';
import { getIntuitApiEndpoints } from './oauth/oauth.providers';
import * as oauthService from './oauth/oauth.service';

const INTUIT_PROVIDER = 'intuit' as const;
const DEFAULT_OWNER_KEY = 'global';
// InvoiceLink requires a current minor version; 75 is documented with include=invoiceLink.
const QBO_MINOR_VERSION = '75';

export class IntuitQboError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'IntuitQboError';
    this.statusCode = statusCode;
  }
}

type QboRef = { value?: string; name?: string };
type QboCustomer = {
  Id: string;
  DisplayName?: string;
  PrimaryEmailAddr?: { Address?: string };
};
type QboItem = { Id: string; Name?: string; Type?: string; Active?: boolean };
export type QboInvoice = {
  Id: string;
  Balance?: number;
  TotalAmt?: number;
  InvoiceLink?: string;
  CurrencyRef?: QboRef;
  PrivateNote?: string;
};
type QboPayment = {
  Id: string;
  TotalAmt?: number;
  LinkedTxn?: Array<{ TxnId?: string; TxnType?: string }>;
};

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

const mapAxiosError = (error: unknown, action: string): IntuitQboError => {
  if (error instanceof IntuitQboError) {
    return error;
  }
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const detail = formatIntuitErrorBody(axiosError.response?.data);
    if (status === 401) {
      return new IntuitQboError(`Intuit ${action} unauthorized after token refresh: ${detail}`, 401);
    }
    return new IntuitQboError(`Intuit ${action} failed (${status ?? 'network'}): ${detail}`, 502);
  }
  if (error instanceof Error) {
    return new IntuitQboError(error.message, 502);
  }
  return new IntuitQboError(`Intuit ${action} failed`, 502);
};

const getConnectedAccessToken = async (forceRefresh = false): Promise<string> => {
  const token = await oauthService.getAccessTokenForProvider(INTUIT_PROVIDER, DEFAULT_OWNER_KEY, {
    forceRefresh,
  });
  if (!token) {
    throw new IntuitQboError('Intuit is not connected. Complete OAuth first.', 400);
  }
  return token;
};

const getStoredRealmId = async (): Promise<string> => {
  const status = await oauthService.getOAuthConnectionStatus(INTUIT_PROVIDER, DEFAULT_OWNER_KEY);
  if (!status.connected) {
    throw new IntuitQboError('Intuit is not connected. Complete OAuth first.', 400);
  }
  const realmId = status.metadata?.realmId;
  if (typeof realmId !== 'string' || !realmId.trim()) {
    throw new IntuitQboError(
      'Missing Intuit realmId. Reconnect OAuth; Intuit sends realmId on the callback URL.',
      400
    );
  }
  return realmId.trim();
};

const jsonHeaders = (accessToken: string, extra?: Record<string, string>): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: 'application/json',
  ...extra,
});

const withBearerRetry = async <T>(
  action: string,
  requestFn: (accessToken: string) => Promise<T>
): Promise<T> => {
  const firstToken = await getConnectedAccessToken();
  try {
    return await requestFn(firstToken);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const refreshed = await getConnectedAccessToken(true);
      try {
        return await requestFn(refreshed);
      } catch (retryError) {
        throw mapAxiosError(retryError, action);
      }
    }
    throw mapAxiosError(error, action);
  }
};

const qboUrl = (realmId: string, path: string, extraQuery?: Record<string, string>): string => {
  const { companyBaseUrl } = getIntuitApiEndpoints();
  const url = new URL(`${companyBaseUrl}/${realmId}${path}`);
  url.searchParams.set('minorversion', QBO_MINOR_VERSION);
  if (extraQuery) {
    for (const [key, value] of Object.entries(extraQuery)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

const escapeQboQueryValue = (value: string): string => value.replace(/'/g, "''");

const qboQuery = async <T>(entity: 'Customer' | 'Item', query: string): Promise<T[]> => {
  const realmId = await getStoredRealmId();
  const url = qboUrl(realmId, '/query', { query });
  const data = await withBearerRetry(`query ${entity}`, async (accessToken) => {
    const response = await axios.get(url, { headers: jsonHeaders(accessToken) });
    return response.data as { QueryResponse?: Record<string, T[] | undefined> };
  });
  const rows = data.QueryResponse?.[entity];
  return Array.isArray(rows) ? rows : [];
};

const findOrCreateCustomer = async (params: {
  email: string;
  firstName: string;
  lastName: string;
}): Promise<QboCustomer> => {
  const email = params.email.trim();
  const matches = await qboQuery<QboCustomer>(
    'Customer',
    `select * from Customer where PrimaryEmailAddr = '${escapeQboQueryValue(email)}'`
  );
  const existing = matches.find(
    (customer) => customer.PrimaryEmailAddr?.Address?.toLowerCase() === email.toLowerCase()
  );
  if (existing?.Id) {
    return existing;
  }

  const realmId = await getStoredRealmId();
  const displayName = `${params.firstName} ${params.lastName} (${email})`.slice(0, 500);
  const created = await withBearerRetry('create customer', async (accessToken) => {
    const response = await axios.post(
      qboUrl(realmId, '/customer'),
      {
        DisplayName: displayName,
        GivenName: params.firstName.slice(0, 100),
        FamilyName: params.lastName.slice(0, 100),
        PrimaryEmailAddr: { Address: email },
      },
      { headers: jsonHeaders(accessToken, { 'Content-Type': 'application/json' }) }
    );
    return response.data as { Customer?: QboCustomer };
  });
  if (!created.Customer?.Id) {
    throw new IntuitQboError('Intuit customer create did not return an id.', 502);
  }
  return created.Customer;
};

const findServiceItem = async (): Promise<QboItem> => {
  const items = await qboQuery<QboItem>(
    'Item',
    "select * from Item where Type = 'Service' and Active = true maxresults 5"
  );
  const service = items.find((item) => item.Id && item.Active !== false);
  if (service?.Id) {
    return service;
  }
  throw new IntuitQboError(
    'No active Service item found in the QuickBooks company. Add a Service item in the sandbox company.',
    400
  );
};

const readInvoiceLink = (invoice: QboInvoice | undefined): string | null => {
  if (!invoice) {
    return null;
  }
  if (typeof invoice.InvoiceLink === 'string' && invoice.InvoiceLink.startsWith('http')) {
    return invoice.InvoiceLink;
  }
  return null;
};

export const getQboInvoice = async (invoiceId: string): Promise<QboInvoice> => {
  const realmId = await getStoredRealmId();
  const data = await withBearerRetry('get invoice', async (accessToken) => {
    const response = await axios.get(qboUrl(realmId, `/invoice/${invoiceId}`, { include: 'invoiceLink' }), {
      headers: jsonHeaders(accessToken),
    });
    return response.data as { Invoice?: QboInvoice };
  });
  if (!data.Invoice?.Id) {
    throw new IntuitQboError(`Intuit invoice ${invoiceId} was not found.`, 404);
  }
  return data.Invoice;
};

export const getQboPayment = async (paymentId: string): Promise<QboPayment> => {
  const realmId = await getStoredRealmId();
  const data = await withBearerRetry('get payment', async (accessToken) => {
    const response = await axios.get(qboUrl(realmId, `/payment/${paymentId}`), {
      headers: jsonHeaders(accessToken),
    });
    return response.data as { Payment?: QboPayment };
  });
  if (!data.Payment?.Id) {
    throw new IntuitQboError(`Intuit payment ${paymentId} was not found.`, 404);
  }
  return data.Payment;
};

export const createQboInvoiceCheckout = async (params: {
  appointmentId: string;
  email: string;
  firstName: string;
  lastName: string;
  description: string;
  amount: number;
  currency: string;
}): Promise<{ invoiceId: string; checkoutUrl: string; raw: Record<string, unknown> }> => {
  const customer = await findOrCreateCustomer({
    email: params.email,
    firstName: params.firstName,
    lastName: params.lastName,
  });
  const item = await findServiceItem();
  const realmId = await getStoredRealmId();

  const created = await withBearerRetry('create invoice', async (accessToken) => {
    const response = await axios.post(
      qboUrl(realmId, '/invoice'),
      {
        CustomerRef: { value: customer.Id },
        BillEmail: { Address: params.email },
        PrivateNote: params.appointmentId,
        AllowOnlineCreditCardPayment: true,
        AllowOnlineACHPayment: true,
        CurrencyRef: { value: params.currency },
        Line: [
          {
            Amount: params.amount,
            DetailType: 'SalesItemLineDetail',
            Description: params.description.slice(0, 4000),
            SalesItemLineDetail: {
              ItemRef: { value: item.Id, name: item.Name },
              Qty: 1,
              UnitPrice: params.amount,
            },
          },
        ],
      },
      { headers: jsonHeaders(accessToken, { 'Content-Type': 'application/json' }) }
    );
    return response.data as { Invoice?: QboInvoice };
  });

  const invoiceId = created.Invoice?.Id;
  if (!invoiceId) {
    throw new IntuitQboError('Intuit invoice create did not return an id.', 502);
  }

  const invoice = await getQboInvoice(invoiceId);
  const checkoutUrl = readInvoiceLink(invoice) || readInvoiceLink(created.Invoice);
  if (!checkoutUrl) {
    throw new IntuitQboError(
      'QuickBooks did not return an invoice Pay Now link. Enable online invoice payments for the sandbox company.',
      502
    );
  }

  return {
    invoiceId,
    checkoutUrl,
    raw: { Invoice: invoice, Customer: { Id: customer.Id } },
  };
};
