import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import axios from 'axios';
import { appointmentConfirmedTemplate } from './email.templates';
import { sendEmail } from './email.service';
import { getAccessTokenForProvider } from './oauth/oauth.service';
import {
  createQboInvoiceCheckout,
  getQboInvoice,
  getQboPayment,
  IntuitQboError,
  normalizeQboInvoiceLink,
} from './intuit-qbo.service';
import { appointmentPaymentReceiptToOwnerTemplate } from './email.templates';
import { recordSecurityAuditEvent } from './security-audit.service';
import { sendSecurityAlert } from './security-alert.service';

const prisma = new PrismaClient();
const INTUIT_PROVIDER = 'intuit';

interface IntuitCheckoutResult {
  externalPaymentId: string;
  checkoutUrl: string;
  raw: Record<string, unknown>;
}

const parseAllowedSuccessEvents = (): Set<string> => {
  const configured = process.env.INTUIT_SUCCESS_EVENT_TYPES;
  const defaults = ['payment.succeeded', 'payment.success', 'charge.succeeded'];
  const raw = configured
    ? configured.split(/[,\s]+/).filter(Boolean)
    : defaults;
  return new Set(raw.map((item) => item.toLowerCase()));
};

const getWebhookEventId = (payload: Record<string, unknown>): string => {
  const candidates = [
    payload.eventId,
    payload.id,
    (payload.event as Record<string, unknown> | undefined)?.id,
  ];
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return (value as string | undefined) ?? `generated-${crypto.randomUUID()}`;
};

const getWebhookType = (payload: Record<string, unknown>): string => {
  const candidates = [
    payload.eventType,
    payload.type,
    (payload.event as Record<string, unknown> | undefined)?.type,
    payload.status,
  ];
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return (value as string | undefined) ?? 'unknown';
};

const isSucceededEvent = (eventType: string): boolean =>
  parseAllowedSuccessEvents().has(eventType.toLowerCase());

const parseCurrency = (payload: Record<string, unknown>): string | null => {
  const value =
    (payload.currency as string | undefined) ||
    ((payload.data as Record<string, unknown> | undefined)?.currency as string | undefined) ||
    ((payload.payment as Record<string, unknown> | undefined)?.currency as string | undefined);
  return value ? value.toUpperCase() : null;
};

const parseAmount = (payload: Record<string, unknown>): number | null => {
  const candidate =
    (payload.amount as number | string | undefined) ??
    ((payload.total as number | string | undefined) ?? undefined) ??
    (((payload.data as Record<string, unknown> | undefined)?.amount as number | string | undefined) ??
      undefined);
  if (typeof candidate === 'number') {
    return Number(candidate.toFixed(2));
  }
  if (typeof candidate === 'string' && candidate.trim()) {
    const parsed = Number(candidate);
    if (!Number.isNaN(parsed)) {
      return Number(parsed.toFixed(2));
    }
  }
  return null;
};

type PaymentMode = 'mock' | 'qbo' | 'live';

const getPaymentMode = (): PaymentMode => {
  const raw = (process.env.INTUIT_PAYMENT_MODE || 'mock').trim().toLowerCase();
  if (raw === 'qbo') {
    return 'qbo';
  }
  if (raw === 'live') {
    return 'live';
  }
  return 'mock';
};

const isInvoicePaid = (balance: number | undefined): boolean =>
  typeof balance === 'number' && Number(balance.toFixed(2)) === 0;

export const createIntuitCheckoutSession = async (params: {
  appointmentId: string;
  bookingEmail?: string;
  tipAmount?: number;
  currency?: string;
}): Promise<{
  provider: string;
  externalPaymentId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
  status: string;
  mode: PaymentMode;
}> => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
    include: { service: true },
  });
  if (!appointment) {
    throw new Error('Appointment not found');
  }
  if (
    params.bookingEmail &&
    appointment.email.toLowerCase() !== params.bookingEmail.toLowerCase()
  ) {
    throw new Error('Booking token does not match appointment owner.');
  }

  if (appointment.states === 'cancelled') {
    throw new Error('Cancelled bookings cannot be paid.');
  }
  if (appointment.paymentStatus === 'paid') {
    throw new Error('This booking is already paid.');
  }
  const isCircle = appointment.kind === 'circle';
  if (isCircle) {
    throw new Error('Circle seats are paid in person at the event.');
  }
  if (appointment.states !== 'confirmed') {
    throw new Error('This booking must be accepted before payment.');
  }

  const tipAmount = params.tipAmount ?? appointment.tipAmount ?? 0;
  const baseAmount = appointment.quotedAmount ?? appointment.service.price;
  const amount = Number((baseAmount + tipAmount).toFixed(2));
  const currency = params.currency ?? 'USD';
  const externalPaymentId = `intuit_${crypto.randomUUID()}`;

  const existingPending = await prisma.paymentTransaction.findFirst({
    where: {
      appointmentId: appointment.id,
      provider: INTUIT_PROVIDER,
      status: 'pending',
    },
    orderBy: { createdAt: 'desc' },
  });
  if (existingPending?.checkoutUrl) {
    const checkoutUrl = normalizeQboInvoiceLink(existingPending.checkoutUrl);
    if (checkoutUrl !== existingPending.checkoutUrl) {
      await prisma.paymentTransaction.update({
        where: { id: existingPending.id },
        data: { checkoutUrl },
      });
    }
    return {
      provider: INTUIT_PROVIDER,
      externalPaymentId: existingPending.externalPaymentId,
      checkoutUrl,
      amount: existingPending.amount,
      currency: existingPending.currency,
      status: 'pending',
      mode: getPaymentMode(),
    };
  }

  const mode = getPaymentMode();
  let checkoutResult: IntuitCheckoutResult;
  if (mode === 'qbo') {
    const invoice = await createQboInvoiceCheckout({
      appointmentId: appointment.id,
      email: appointment.email,
      firstName: appointment.clientFirstName,
      lastName: appointment.clientLastName,
      description: `${appointment.service.title} appointment`,
      amount,
      currency,
    });
    checkoutResult = {
      externalPaymentId: invoice.invoiceId,
      checkoutUrl: invoice.checkoutUrl,
      raw: invoice.raw,
    };
  } else if (mode === 'live') {
    const token = await getAccessTokenForProvider('intuit');
    if (!token) {
      throw new Error('Intuit is not connected. Complete OAuth before creating checkout sessions.');
    }
    const createUrl = process.env.INTUIT_PAYMENTS_CREATE_URL;
    if (!createUrl) {
      throw new Error('Missing INTUIT_PAYMENTS_CREATE_URL for live Intuit payment mode.');
    }

    const requestBody = {
      amount,
      currency,
      metadata: {
        appointmentId: appointment.id,
        externalPaymentId,
      },
      customer: {
        email: appointment.email,
        firstName: appointment.clientFirstName,
        lastName: appointment.clientLastName,
      },
      description: `${appointment.service.title} appointment`,
    };
    const response = await axios.post<Record<string, unknown>>(createUrl, requestBody, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
    const data = response.data || {};
    const returnedExternalId =
      (data.paymentId as string | undefined) ||
      (data.id as string | undefined) ||
      (data.chargeId as string | undefined);
    const checkoutUrlFromIntuit =
      (data.checkoutUrl as string | undefined) ||
      (data.url as string | undefined) ||
      (data.approvalUrl as string | undefined);
    if (!checkoutUrlFromIntuit) {
      throw new Error('Intuit live payment response missing checkout URL.');
    }
    checkoutResult = {
      externalPaymentId: returnedExternalId || externalPaymentId,
      checkoutUrl: checkoutUrlFromIntuit,
      raw: data,
    };
  } else {
    const checkoutBaseUrl =
      process.env.INTUIT_CHECKOUT_BASE_URL || 'https://sandbox.intuit.com/mock-checkout';
    checkoutResult = {
      externalPaymentId,
      checkoutUrl: `${checkoutBaseUrl}?paymentId=${encodeURIComponent(externalPaymentId)}&appointmentId=${encodeURIComponent(
        appointment.id
      )}`,
      raw: { mode: 'mock' },
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.create({
      data: {
        appointmentId: appointment.id,
        provider: INTUIT_PROVIDER,
        externalPaymentId: checkoutResult.externalPaymentId,
        status: 'pending',
        amount,
        currency,
        checkoutUrl: checkoutResult.checkoutUrl,
        metadata: { mode, gatewayResponse: checkoutResult.raw } as Prisma.InputJsonValue,
      },
    });

    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        paymentStatus: 'pending',
        paymentMethod: 'credit_card',
        paymentProvider: INTUIT_PROVIDER,
        paymentExternalId: checkoutResult.externalPaymentId,
        tipAmount,
      },
    });
  });

  return {
    provider: INTUIT_PROVIDER,
    externalPaymentId: checkoutResult.externalPaymentId,
    checkoutUrl: checkoutResult.checkoutUrl,
    amount,
    currency,
    status: 'pending',
    mode,
  };
};

type QboWebhookEntity = {
  name?: string;
  id?: string;
  operation?: string;
  lastUpdated?: string;
};

type QboEventNotification = {
  realmId?: string;
  dataChangeEvent?: { entities?: QboWebhookEntity[] };
};

const CUSTOMER_PAID_EMAIL_SUBJECT = 'Your payment was received — session is booked';
const APPOINTMENT_ID_NOTE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveOwnerReceiptEmail = (clientEmail: string | null | undefined): string | null =>
  process.env.BUSINESS_OWNER_EMAIL || clientEmail || null;

const sendPaidBookingEmails = (params: {
  appointment: {
    id: string;
    clientFirstName: string;
    clientLastName: string;
    email: string;
    phone: string | null;
    date: Date;
    service: {
      title: string;
      description: string;
      Client: { email: string | null } | null;
    };
  };
  receivedAmount: number;
  receivedCurrency: string;
  paymentExternalId: string;
}): void => {
  const { appointment } = params;
  const customerHtml = appointmentConfirmedTemplate({
    clientFirstName: appointment.clientFirstName,
    clientLastName: appointment.clientLastName,
    email: appointment.email,
    date: appointment.date,
    serviceTitle: appointment.service.title,
    serviceDescription: appointment.service.description,
    appointmentId: appointment.id,
  });
  sendEmail(appointment.email, CUSTOMER_PAID_EMAIL_SUBJECT, customerHtml).catch((err) => {
    console.error('Failed to send payment confirmation email:', err);
  });

  const ownerEmail = resolveOwnerReceiptEmail(appointment.service.Client?.email);
  if (!ownerEmail) {
    return;
  }
  const ownerReceiptHtml = appointmentPaymentReceiptToOwnerTemplate({
    customerFirstName: appointment.clientFirstName,
    customerLastName: appointment.clientLastName,
    customerEmail: appointment.email,
    customerPhone: appointment.phone ?? null,
    serviceTitle: appointment.service.title,
    date: appointment.date,
    appointmentId: appointment.id,
    paymentExternalId: params.paymentExternalId,
    amountPaid: params.receivedAmount,
    currency: params.receivedCurrency,
  });
  sendEmail(
    ownerEmail,
    `Payment received: ${appointment.clientFirstName} ${appointment.clientLastName}`,
    ownerReceiptHtml
  ).catch((err) => {
    console.error('Failed to send owner payment receipt email:', err);
  });
};

const deriveQboEventId = (notifications: QboEventNotification[]): string | null => {
  const parts = notifications.flatMap((notification) =>
    (notification.dataChangeEvent?.entities ?? []).map(
      (entity) =>
        `${notification.realmId ?? ''}:${entity.name ?? ''}:${entity.id ?? ''}:${entity.operation ?? ''}:${entity.lastUpdated ?? ''}`
    )
  );
  const joined = parts.filter(Boolean).join('|');
  return joined ? joined.slice(0, 250) : null;
};

const confirmPaidBooking = async (params: {
  eventId: string;
  eventType: string;
  paymentTx: { id: string; appointmentId: string; status: string; currency: string };
  appointment: {
    id: string;
    states: string;
    clientFirstName: string;
    clientLastName: string;
    email: string;
    phone: string | null;
    date: Date;
    quotedAmount: number | null;
    tipAmount: number | null;
    paymentExternalId: string | null;
    service: {
      title: string;
      description: string;
      price: number;
      Client: { email: string | null } | null;
    };
  };
  receivedAmount: number;
  receivedCurrency: string;
  paymentExternalId: string;
  payload: Record<string, unknown>;
}): Promise<{ accepted: boolean; duplicate: boolean; eventId: string; status: string }> => {
  const { paymentTx, appointment, eventId, eventType } = params;
  if (paymentTx.status !== 'pending') {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    return { accepted: true, duplicate: false, eventId, status: 'already_paid' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.update({
      where: { id: paymentTx.id },
      data: {
        status: 'paid',
        metadata: params.payload as Prisma.InputJsonValue,
      },
    });

    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        states: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: 'credit_card',
        paymentProvider: INTUIT_PROVIDER,
        paymentExternalId: params.paymentExternalId,
      },
    });

    await tx.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
  });

  await recordSecurityAuditEvent({
    eventType: 'payment.confirmed',
    outcome: 'accepted',
    severity: 'info',
    provider: INTUIT_PROVIDER,
    appointmentId: appointment.id,
    paymentTransactionId: paymentTx.id,
    metadata: {
      eventId,
      eventType,
      amount: params.receivedAmount,
      currency: params.receivedCurrency,
    },
  });

  sendPaidBookingEmails({
    appointment,
    receivedAmount: params.receivedAmount,
    receivedCurrency: params.receivedCurrency,
    paymentExternalId: params.paymentExternalId,
  });

  return { accepted: true, duplicate: false, eventId, status: 'confirmed' };
};

const confirmFromQboInvoiceId = async (
  invoiceId: string,
  eventId: string,
  payload: Record<string, unknown>
): Promise<{ accepted: boolean; duplicate: boolean; eventId: string; status: string } | null> => {
  let invoice;
  try {
    invoice = await getQboInvoice(invoiceId);
  } catch (error) {
    if (error instanceof IntuitQboError && error.statusCode === 404) {
      return { accepted: true, duplicate: false, eventId, status: 'ignored' };
    }
    throw error;
  }

  let paymentTx = await prisma.paymentTransaction.findUnique({
    where: { externalPaymentId: invoiceId },
  });
  const appointmentIdNote = invoice.PrivateNote?.trim();
  if (!paymentTx && appointmentIdNote && APPOINTMENT_ID_NOTE.test(appointmentIdNote)) {
    paymentTx = await prisma.paymentTransaction.findFirst({
      where: {
        appointmentId: appointmentIdNote,
        provider: INTUIT_PROVIDER,
        status: 'pending',
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (!paymentTx) {
    return null;
  }

  if (!isInvoicePaid(invoice.Balance)) {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    return { accepted: true, duplicate: false, eventId, status: 'invoice_unpaid' };
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: paymentTx.appointmentId },
    include: { service: { include: { Client: true } } },
  });
  if (!appointment?.service) {
    return { accepted: true, duplicate: false, eventId, status: 'appointment_not_found' };
  }

  const receivedAmount =
    typeof invoice.TotalAmt === 'number' ? Number(invoice.TotalAmt.toFixed(2)) : paymentTx.amount;
  const receivedCurrency = (invoice.CurrencyRef?.value || paymentTx.currency).toUpperCase();
  const expectedAmount = Number(
    ((appointment.quotedAmount ?? appointment.service.price) + (appointment.tipAmount ?? 0)).toFixed(2)
  );
  if (receivedAmount !== expectedAmount || receivedCurrency !== paymentTx.currency.toUpperCase()) {
    return {
      accepted: false,
      duplicate: false,
      eventId,
      status: 'amount_or_currency_mismatch',
    };
  }

  return confirmPaidBooking({
    eventId,
    eventType: 'qbo.invoice.paid',
    paymentTx,
    appointment,
    receivedAmount,
    receivedCurrency,
    paymentExternalId: invoiceId,
    payload,
  });
};

const processQboEventNotifications = async (
  payload: Record<string, unknown>,
  eventId: string
): Promise<{ accepted: boolean; duplicate: boolean; eventId: string; status: string }> => {
  const notifications = payload.eventNotifications as QboEventNotification[];
  const integrationConnection = await prisma.integrationConnection.findUnique({
    where: {
      provider_ownerKey: {
        provider: INTUIT_PROVIDER,
        ownerKey: 'global',
      },
    },
  });
  const expectedRealmId =
    ((integrationConnection?.metadata as Record<string, unknown> | null)?.realmId as string | undefined) ??
    undefined;

  let lastStatus = 'ignored';
  for (const notification of notifications) {
    if (expectedRealmId && notification.realmId && notification.realmId !== expectedRealmId) {
      lastStatus = 'realm_mismatch';
      continue;
    }
    for (const entity of notification.dataChangeEvent?.entities ?? []) {
      const name = (entity.name || '').toLowerCase();
      const operation = (entity.operation || '').toLowerCase();
      if (!entity.id || !['create', 'update'].includes(operation)) {
        continue;
      }
      if (name === 'invoice') {
        const result = await confirmFromQboInvoiceId(entity.id, eventId, payload);
        if (result) {
          if (!result.accepted || result.status === 'confirmed') {
            return result;
          }
          lastStatus = result.status;
        }
      }
      if (name === 'payment') {
        try {
          const payment = await getQboPayment(entity.id);
          const invoiceId = payment.LinkedTxn?.find((txn) => txn.TxnType === 'Invoice')?.TxnId;
          if (invoiceId) {
            const result = await confirmFromQboInvoiceId(invoiceId, eventId, payload);
            if (result) {
              if (!result.accepted || result.status === 'confirmed') {
                return result;
              }
              lastStatus = result.status;
            }
          }
        } catch (error) {
          if (!(error instanceof IntuitQboError && error.statusCode === 404)) {
            throw error;
          }
        }
      }
    }
  }

  await prisma.integrationWebhookEvent.update({
    where: {
      provider_eventExternalId: {
        provider: INTUIT_PROVIDER,
        eventExternalId: eventId,
      },
    },
    data: { processedAt: new Date() },
  });
  return { accepted: true, duplicate: false, eventId, status: lastStatus };
};

export const syncPendingQboInvoicePayments = async (): Promise<{
  checked: number;
  results: Array<{ invoiceId: string; status: string }>;
}> => {
  const pending = await prisma.paymentTransaction.findMany({
    where: { provider: INTUIT_PROVIDER, status: 'pending' },
    select: { externalPaymentId: true },
    orderBy: { createdAt: 'asc' },
  });

  const results: Array<{ invoiceId: string; status: string }> = [];
  for (const tx of pending) {
    const eventId = `sync:${tx.externalPaymentId}:${new Date().toISOString()}`.slice(0, 250);
    await prisma.integrationWebhookEvent.upsert({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      update: {
        eventType: 'qbo.invoice.sync',
        payload: { source: 'admin-sync', invoiceId: tx.externalPaymentId } as Prisma.InputJsonValue,
      },
      create: {
        provider: INTUIT_PROVIDER,
        eventExternalId: eventId,
        eventType: 'qbo.invoice.sync',
        payload: { source: 'admin-sync', invoiceId: tx.externalPaymentId } as Prisma.InputJsonValue,
      },
    });

    const result = await confirmFromQboInvoiceId(tx.externalPaymentId, eventId, {
      source: 'admin-sync',
      invoiceId: tx.externalPaymentId,
    });
    results.push({
      invoiceId: tx.externalPaymentId,
      status: result?.status ?? 'not_found',
    });
  }

  return { checked: pending.length, results };
};

export const processIntuitWebhook = async (
  payload: Record<string, unknown>
): Promise<{ accepted: boolean; duplicate: boolean; eventId: string; status: string }> => {
  const qboEventId = Array.isArray(payload.eventNotifications)
    ? deriveQboEventId(payload.eventNotifications as QboEventNotification[])
    : null;
  const eventId = qboEventId || getWebhookEventId(payload);
  const eventType = getWebhookType(payload);

  const existing = await prisma.integrationWebhookEvent.findUnique({
    where: {
      provider_eventExternalId: {
        provider: INTUIT_PROVIDER,
        eventExternalId: eventId,
      },
    },
  });
  if (existing?.processedAt) {
    await recordSecurityAuditEvent({
      eventType: 'webhook.duplicate',
      outcome: 'rejected',
      severity: 'warning',
      provider: INTUIT_PROVIDER,
      metadata: { eventId, eventType },
    });
    return { accepted: true, duplicate: true, eventId, status: 'already_processed' };
  }

  await prisma.integrationWebhookEvent.upsert({
    where: {
      provider_eventExternalId: {
        provider: INTUIT_PROVIDER,
        eventExternalId: eventId,
      },
    },
    update: {
      eventType,
      payload: payload as Prisma.InputJsonValue,
    },
    create: {
      provider: INTUIT_PROVIDER,
      eventExternalId: eventId,
      eventType,
      payload: payload as Prisma.InputJsonValue,
    },
  });

  if (Array.isArray(payload.eventNotifications)) {
    return processQboEventNotifications(payload, eventId);
  }

  if (!isSucceededEvent(eventType)) {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    await recordSecurityAuditEvent({
      eventType: 'webhook.non_success_event',
      outcome: 'accepted',
      severity: 'info',
      provider: INTUIT_PROVIDER,
      metadata: { eventId, eventType },
    });
    return { accepted: true, duplicate: false, eventId, status: 'ignored' };
  }

  const paymentId =
    (payload.paymentId as string | undefined) ||
    ((payload.data as Record<string, unknown> | undefined)?.paymentId as string | undefined) ||
    ((payload.externalPaymentId as string | undefined) ?? undefined);
  const appointmentId =
    (payload.appointmentId as string | undefined) ||
    ((payload.metadata as Record<string, unknown> | undefined)?.appointmentId as string | undefined) ||
    ((payload.data as Record<string, unknown> | undefined)?.appointmentId as string | undefined);

  if (!paymentId && !appointmentId) {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    await recordSecurityAuditEvent({
      eventType: 'payment.confirmation_missing_reference',
      outcome: 'rejected',
      severity: 'warning',
      provider: INTUIT_PROVIDER,
      metadata: { eventId, eventType },
    });
    return { accepted: true, duplicate: false, eventId, status: 'missing_reference' };
  }

  const paymentTx = paymentId
    ? await prisma.paymentTransaction.findUnique({
        where: { externalPaymentId: paymentId },
      })
    : await prisma.paymentTransaction.findFirst({
        where: {
          provider: INTUIT_PROVIDER,
          appointmentId: appointmentId ?? undefined,
          status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
      });

  if (!paymentTx) {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    await recordSecurityAuditEvent({
      eventType: 'payment.transaction_missing',
      outcome: 'rejected',
      severity: 'warning',
      provider: INTUIT_PROVIDER,
      metadata: { eventId, eventType, paymentId, appointmentId },
    });
    await sendSecurityAlert({
      subject: 'Payment webhook rejected: transaction missing',
      summary: 'A successful payment webhook could not be matched to a transaction.',
      details: { eventId, paymentId, appointmentId },
    });
    return { accepted: false, duplicate: false, eventId, status: 'transaction_not_found' };
  }

  if (appointmentId && paymentTx.appointmentId !== appointmentId) {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    await recordSecurityAuditEvent({
      eventType: 'payment.appointment_mismatch',
      outcome: 'rejected',
      severity: 'critical',
      provider: INTUIT_PROVIDER,
      appointmentId,
      paymentTransactionId: paymentTx.id,
      metadata: { eventId, paymentTxAppointmentId: paymentTx.appointmentId },
    });
    await sendSecurityAlert({
      subject: 'Payment webhook rejected: appointment mismatch',
      summary: 'Webhook appointment reference mismatched stored payment transaction.',
      details: { eventId, appointmentId, paymentTxAppointmentId: paymentTx.appointmentId },
    });
    return { accepted: false, duplicate: false, eventId, status: 'appointment_mismatch' };
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: paymentTx.appointmentId },
    include: { service: { include: { Client: true } } },
  });

  if (!appointment) {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    await recordSecurityAuditEvent({
      eventType: 'payment.appointment_not_found',
      outcome: 'rejected',
      severity: 'warning',
      provider: INTUIT_PROVIDER,
      paymentTransactionId: paymentTx.id,
      metadata: { eventId, paymentTxAppointmentId: paymentTx.appointmentId },
    });
    return { accepted: true, duplicate: false, eventId, status: 'appointment_not_found' };
  }

  const baseAmount = appointment.quotedAmount ?? appointment.service.price;
  const expectedAmount = Number((baseAmount + (appointment.tipAmount ?? 0)).toFixed(2));
  const receivedAmount = parseAmount(payload);
  const expectedCurrency = paymentTx.currency.toUpperCase();
  const receivedCurrency = parseCurrency(payload);

  if (receivedAmount === null || receivedAmount !== expectedAmount || !receivedCurrency || receivedCurrency !== expectedCurrency) {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    await recordSecurityAuditEvent({
      eventType: 'payment.amount_or_currency_mismatch',
      outcome: 'rejected',
      severity: 'critical',
      provider: INTUIT_PROVIDER,
      appointmentId: appointment.id,
      paymentTransactionId: paymentTx.id,
      metadata: {
        eventId,
        expectedAmount,
        receivedAmount,
        expectedCurrency,
        receivedCurrency,
      },
    });
    await sendSecurityAlert({
      subject: 'Payment webhook rejected: amount/currency mismatch',
      summary: 'Payment webhook values did not match pending transaction.',
      details: {
        eventId,
        appointmentId: appointment.id,
        expectedAmount,
        receivedAmount,
        expectedCurrency,
        receivedCurrency,
      },
    });
    return { accepted: false, duplicate: false, eventId, status: 'amount_or_currency_mismatch' };
  }

  const webhookRealmId =
    (payload.realmId as string | undefined) ||
    ((payload.data as Record<string, unknown> | undefined)?.realmId as string | undefined);
  const integrationConnection = await prisma.integrationConnection.findUnique({
    where: {
      provider_ownerKey: {
        provider: INTUIT_PROVIDER,
        ownerKey: 'global',
      },
    },
  });
  const expectedRealmId =
    ((integrationConnection?.metadata as Record<string, unknown> | null)?.realmId as string | undefined) ??
    undefined;
  if (webhookRealmId && expectedRealmId && webhookRealmId !== expectedRealmId) {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    await recordSecurityAuditEvent({
      eventType: 'payment.realm_mismatch',
      outcome: 'rejected',
      severity: 'critical',
      provider: INTUIT_PROVIDER,
      appointmentId: appointment.id,
      paymentTransactionId: paymentTx.id,
      metadata: { eventId, webhookRealmId, expectedRealmId },
    });
    await sendSecurityAlert({
      subject: 'Payment webhook rejected: realm mismatch',
      summary: 'Webhook realm/account did not match configured integration account.',
      details: { eventId, webhookRealmId, expectedRealmId },
    });
    return { accepted: false, duplicate: false, eventId, status: 'realm_mismatch' };
  }

  if (paymentTx.status !== 'pending') {
    await prisma.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
    await recordSecurityAuditEvent({
      eventType: 'payment.invalid_state_transition',
      outcome: 'rejected',
      severity: 'warning',
      provider: INTUIT_PROVIDER,
      appointmentId: appointment.id,
      paymentTransactionId: paymentTx.id,
      metadata: { eventId, currentStatus: paymentTx.status },
    });
    return { accepted: true, duplicate: false, eventId, status: 'already_paid' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.update({
      where: { id: paymentTx.id },
      data: {
        status: 'paid',
        metadata: payload as Prisma.InputJsonValue,
      },
    });

    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        states: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: 'credit_card',
        paymentProvider: INTUIT_PROVIDER,
        paymentExternalId: paymentId ?? appointment.paymentExternalId,
      },
    });

    await tx.integrationWebhookEvent.update({
      where: {
        provider_eventExternalId: {
          provider: INTUIT_PROVIDER,
          eventExternalId: eventId,
        },
      },
      data: { processedAt: new Date() },
    });
  });

  await recordSecurityAuditEvent({
    eventType: 'payment.confirmed',
    outcome: 'accepted',
    severity: 'info',
    provider: INTUIT_PROVIDER,
    appointmentId: appointment.id,
    paymentTransactionId: paymentTx.id,
    metadata: {
      eventId,
      eventType,
      amount: receivedAmount,
      currency: receivedCurrency,
    },
  });

  if (appointment.service) {
    sendPaidBookingEmails({
      appointment: {
        ...appointment,
        service: appointment.service,
      },
      receivedAmount:
        (payload.amount as number | undefined) ??
        (payload.total as number | undefined) ??
        (appointment.quotedAmount ?? appointment.service.price) + (appointment.tipAmount ?? 0),
      receivedCurrency:
        (payload.currency as string | undefined) ||
        ((payload.data as Record<string, unknown> | undefined)?.currency as string | undefined) ||
        'USD',
      paymentExternalId: paymentId ?? appointment.paymentExternalId ?? 'not_available',
    });
  }

  return { accepted: true, duplicate: false, eventId, status: 'confirmed' };
};
