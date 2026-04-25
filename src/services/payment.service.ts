import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { appointmentConfirmedTemplate } from './email.templates';
import { sendEmail } from './email.service';
import { getAccessTokenForProvider } from './oauth/oauth.service';

const prisma = new PrismaClient();
const INTUIT_PROVIDER = 'intuit';

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

const isSucceededEvent = (eventType: string): boolean => {
  const normalized = eventType.toLowerCase();
  return (
    normalized.includes('succeeded') ||
    normalized.includes('paid') ||
    normalized === 'payment.success'
  );
};

export const createIntuitCheckoutSession = async (params: {
  appointmentId: string;
  tipAmount?: number;
  currency?: string;
}): Promise<{
  provider: string;
  externalPaymentId: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
  status: string;
}> => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
    include: { service: true },
  });
  if (!appointment) {
    throw new Error('Appointment not found');
  }

  const tipAmount = params.tipAmount ?? appointment.tipAmount ?? 0;
  const amount = Number((appointment.service.price + tipAmount).toFixed(2));
  const currency = params.currency ?? 'USD';
  const externalPaymentId = `intuit_${crypto.randomUUID()}`;

  const mode = process.env.INTUIT_PAYMENT_MODE || 'mock';
  if (mode === 'live') {
    const token = await getAccessTokenForProvider('intuit');
    if (!token) {
      throw new Error('Intuit is not connected. Complete OAuth before creating checkout sessions.');
    }
  }

  const checkoutBaseUrl =
    process.env.INTUIT_CHECKOUT_BASE_URL || 'https://sandbox.intuit.com/mock-checkout';
  const checkoutUrl = `${checkoutBaseUrl}?paymentId=${encodeURIComponent(externalPaymentId)}&appointmentId=${encodeURIComponent(
    appointment.id
  )}`;

  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.create({
      data: {
        appointmentId: appointment.id,
        provider: INTUIT_PROVIDER,
        externalPaymentId,
        status: 'pending',
        amount,
        currency,
        checkoutUrl,
        metadata: { mode },
      },
    });

    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        paymentStatus: 'pending',
        paymentMethod: 'credit_card',
        paymentProvider: INTUIT_PROVIDER,
        paymentExternalId: externalPaymentId,
        tipAmount,
      },
    });
  });

  return {
    provider: INTUIT_PROVIDER,
    externalPaymentId,
    checkoutUrl,
    amount,
    currency,
    status: 'pending',
  };
};

export const processIntuitWebhook = async (
  payload: Record<string, unknown>
): Promise<{ accepted: boolean; duplicate: boolean; eventId: string; status: string }> => {
  const eventId = getWebhookEventId(payload);
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
    return { accepted: true, duplicate: false, eventId, status: 'missing_reference' };
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      OR: [
        appointmentId ? { id: appointmentId } : undefined,
        paymentId ? { paymentExternalId: paymentId } : undefined,
      ].filter(Boolean) as any,
    },
    include: { service: true },
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
    return { accepted: true, duplicate: false, eventId, status: 'appointment_not_found' };
  }

  const wasConfirmed = appointment.states === 'confirmed';
  await prisma.$transaction(async (tx) => {
    await tx.paymentTransaction.updateMany({
      where: {
        OR: [
          paymentId ? { externalPaymentId: paymentId } : undefined,
          { appointmentId: appointment.id, provider: INTUIT_PROVIDER },
        ].filter(Boolean) as any,
      },
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

  if (!wasConfirmed && appointment.service) {
    const html = appointmentConfirmedTemplate({
      clientFirstName: appointment.clientFirstName,
      clientLastName: appointment.clientLastName,
      email: appointment.email,
      date: appointment.date,
      serviceTitle: appointment.service.title,
      serviceDescription: appointment.service.description,
      appointmentId: appointment.id,
    });
    sendEmail(appointment.email, 'Appointment Confirmed!', html).catch((err) => {
      console.error('Failed to send payment confirmation email:', err);
    });
  }

  return { accepted: true, duplicate: false, eventId, status: 'confirmed' };
};
