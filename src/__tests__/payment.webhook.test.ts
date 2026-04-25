import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';
import '../__tests__/setup';
import { getValidMstBookingDate } from './utils/scheduling';
import axios from 'axios';
import * as emailService from '../services/email.service';
import * as oauthService from '../services/oauth/oauth.service';

const prisma = new PrismaClient();

describe('Payment + Webhook Flow', () => {
  beforeEach(() => {
    jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.INTUIT_WEBHOOK_SECRET;
    delete process.env.INTUIT_PAYMENT_MODE;
    delete process.env.INTUIT_PAYMENTS_CREATE_URL;
  });

  it('should create an Intuit checkout session and persist payment transaction', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Client Name',
        aboutMe: 'About text',
        email: 'client@example.com',
      },
    });
    const service = await prisma.service.create({
      data: {
        title: 'Service',
        description: 'Service description text',
        price: 150,
        isPublished: true,
        clientId: client.id,
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        clientFirstName: 'Jane',
        clientLastName: 'Doe',
        email: 'jane@example.com',
        phone: '+15555551234',
        date: getValidMstBookingDate(10, 2),
        serviceId: service.id,
      },
    });

    const response = await request(app)
      .post('/api/payments/intuit/checkout-session')
      .send({ appointmentId: appointment.id, tipAmount: 20 })
      .expect(201);

    expect(response.body.provider).toBe('intuit');
    expect(response.body.externalPaymentId).toContain('intuit_');
    expect(response.body.amount).toBe(170);

    const tx = await prisma.paymentTransaction.findUnique({
      where: { externalPaymentId: response.body.externalPaymentId },
    });
    expect(tx).not.toBeNull();
    expect(tx?.status).toBe('pending');
  });

  it('should create a live-mode Intuit checkout session with OAuth token', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Live Mode Client',
        aboutMe: 'About text',
        email: 'live-owner@example.com',
      },
    });
    const service = await prisma.service.create({
      data: {
        title: 'Live Service',
        description: 'Live service description',
        price: 175,
        isPublished: true,
        clientId: client.id,
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        clientFirstName: 'Live',
        clientLastName: 'Customer',
        email: 'live-customer@example.com',
        phone: '+15555558888',
        date: getValidMstBookingDate(12, 2),
        serviceId: service.id,
      },
    });

    process.env.INTUIT_PAYMENT_MODE = 'live';
    process.env.INTUIT_PAYMENTS_CREATE_URL = 'https://api.intuit.example/payments/create';
    jest.spyOn(oauthService, 'getAccessTokenForProvider').mockResolvedValue('intuit-oauth-token');
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        paymentId: 'intuit_live_123',
        checkoutUrl: 'https://pay.intuit.example/checkout/intuit_live_123',
      },
    } as any);

    const response = await request(app)
      .post('/api/payments/intuit/checkout-session')
      .send({ appointmentId: appointment.id, tipAmount: 15 })
      .expect(201);

    expect(response.body.externalPaymentId).toBe('intuit_live_123');
    expect(response.body.checkoutUrl).toBe('https://pay.intuit.example/checkout/intuit_live_123');
    expect(response.body.amount).toBe(190);
    expect(oauthService.getAccessTokenForProvider).toHaveBeenCalledWith('intuit');
    expect(axios.post).toHaveBeenCalled();
  });

  it('should process successful Intuit webhook idempotently', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Webhook Client',
        aboutMe: 'About text',
        email: 'webhook-owner@example.com',
      },
    });
    const service = await prisma.service.create({
      data: {
        title: 'Webhook Service',
        description: 'Service description text',
        price: 120,
        isPublished: true,
        clientId: client.id,
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        clientFirstName: 'Webhook',
        clientLastName: 'User',
        email: 'webhook-user@example.com',
        phone: '+15555550000',
        date: getValidMstBookingDate(11, 2),
        serviceId: service.id,
      },
    });

    const checkout = await request(app)
      .post('/api/payments/intuit/checkout-session')
      .send({ appointmentId: appointment.id })
      .expect(201);

    const paymentId = checkout.body.externalPaymentId;
    process.env.INTUIT_WEBHOOK_SECRET = 'test-secret';

    const payload = {
      eventId: 'evt-123',
      eventType: 'payment.succeeded',
      paymentId,
      appointmentId: appointment.id,
      metadata: {
        appointmentId: appointment.id,
      },
    };

    const first = await request(app)
      .post('/api/webhooks/intuit')
      .set('x-intuit-webhook-secret', 'test-secret')
      .send(payload)
      .expect(200);

    expect(first.body.duplicate).toBe(false);
    expect(first.body.status).toBe('confirmed');

    const second = await request(app)
      .post('/api/webhooks/intuit')
      .set('x-intuit-webhook-secret', 'test-secret')
      .send(payload)
      .expect(200);

    expect(second.body.duplicate).toBe(true);

    const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(updated?.states).toBe('confirmed');
    expect(updated?.paymentStatus).toBe('paid');
    expect(updated?.paymentProvider).toBe('intuit');

    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'webhook-owner@example.com',
      expect.stringContaining('Payment received:'),
      expect.any(String)
    );
  });
});
