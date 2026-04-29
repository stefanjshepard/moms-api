import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { app } from '../index';
import '../__tests__/setup';
import { getValidMstBookingDate } from './utils/scheduling';
import * as emailService from '../services/email.service';

const prisma = new PrismaClient();

describe('Smoke E2E: book -> checkout -> webhook -> reminder queued', () => {
  beforeEach(() => {
    jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
    process.env.BOOKING_TOKEN_SECRET = 'smoke-booking-token-secret';
  });

  const createWebhookHeaders = (payload: Record<string, unknown>, secret: string, timestamp: number) => {
    const raw = JSON.stringify(payload);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${raw}`, 'utf8')
      .digest('base64');
    return {
      'intuit-signature': signature,
      'intuit-timestamp': String(timestamp),
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.INTUIT_WEBHOOK_SECRET;
    delete process.env.BOOKING_TOKEN_SECRET;
  });

  it('runs complete happy path and keeps reminder job queued', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Smoke Client',
        aboutMe: 'About text',
        email: 'smoke-owner@example.com',
      },
    });

    const service = await prisma.service.create({
      data: {
        title: 'Smoke Service',
        description: 'Service description',
        price: 140,
        isPublished: true,
        clientId: client.id,
      },
    });

    const bookingDate = getValidMstBookingDate(10, 2);
    const booking = await request(app).post('/api/appointments').send({
      clientFirstName: 'Smoke',
      clientLastName: 'Customer',
      email: 'smoke-customer@example.com',
      phone: '+15550001111',
      date: bookingDate.toISOString(),
      serviceId: service.id,
      paymentMethod: 'credit_card',
    });

    expect(booking.status).toBe(201);
    const appointmentId = booking.body.id as string;
    const bookingToken = booking.body.checkoutToken as string;
    expect(appointmentId).toBeTruthy();
    expect(bookingToken).toBeTruthy();

    const reminder = await prisma.reminderJob.findFirst({
      where: { appointmentId, status: 'pending' },
    });
    expect(reminder).not.toBeNull();

    const checkout = await request(app)
      .post('/api/payments/intuit/checkout-session')
      .set('x-booking-token', bookingToken)
      .send({ appointmentId })
      .expect(201);
    const paymentId = checkout.body.externalPaymentId as string;
    expect(paymentId).toBeTruthy();

    process.env.INTUIT_WEBHOOK_SECRET = 'smoke-secret';
    const payload = {
      eventId: 'smoke-evt-1',
      eventType: 'payment.succeeded',
      paymentId,
      appointmentId,
      amount: 140,
      currency: 'USD',
    };
    const headers = createWebhookHeaders(payload, 'smoke-secret', Math.floor(Date.now() / 1000));
    await request(app)
      .post('/api/webhooks/intuit')
      .set('intuit-signature', headers['intuit-signature'])
      .set('intuit-timestamp', headers['intuit-timestamp'])
      .send(payload)
      .expect(200);

    const updatedAppointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(updatedAppointment?.states).toBe('confirmed');
    expect(updatedAppointment?.paymentStatus).toBe('paid');
  });
});
