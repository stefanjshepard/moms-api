import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';
import '../__tests__/setup';
import { getValidMstBookingDate } from './utils/scheduling';
import * as emailService from '../services/email.service';

const prisma = new PrismaClient();

describe('Smoke E2E: book -> checkout -> webhook -> reminder queued', () => {
  beforeEach(() => {
    jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.INTUIT_WEBHOOK_SECRET;
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
    expect(appointmentId).toBeTruthy();

    const reminder = await prisma.reminderJob.findFirst({
      where: { appointmentId, status: 'pending' },
    });
    expect(reminder).not.toBeNull();

    const checkout = await request(app)
      .post('/api/payments/intuit/checkout-session')
      .send({ appointmentId })
      .expect(201);
    const paymentId = checkout.body.externalPaymentId as string;
    expect(paymentId).toBeTruthy();

    process.env.INTUIT_WEBHOOK_SECRET = 'smoke-secret';
    await request(app)
      .post('/api/webhooks/intuit')
      .set('x-intuit-webhook-secret', 'smoke-secret')
      .send({
        eventId: 'smoke-evt-1',
        eventType: 'payment.succeeded',
        paymentId,
        appointmentId,
      })
      .expect(200);

    const updatedAppointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(updatedAppointment?.states).toBe('confirmed');
    expect(updatedAppointment?.paymentStatus).toBe('paid');
  });
});
