import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';
import '../__tests__/setup';
import { getValidMstBookingDate } from './utils/scheduling';

const prisma = new PrismaClient();

describe('Appointment confirmation auth hardening', () => {
  beforeEach(() => {
    process.env.PAYMENT_CONFIRMATION_ENFORCE_IN_TEST = 'true';
    process.env.PAYMENT_CONFIRMATION_SECRET = 'payment-confirm-secret';
  });

  afterEach(() => {
    delete process.env.PAYMENT_CONFIRMATION_ENFORCE_IN_TEST;
    delete process.env.PAYMENT_CONFIRMATION_SECRET;
  });

  it('rejects non-trusted caller and accepts trusted payment confirmation secret', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Confirm Auth Client',
        aboutMe: 'About text',
        email: 'owner-confirm-auth@example.com',
      },
    });

    const service = await prisma.service.create({
      data: {
        title: 'Confirmation Service',
        description: 'Service description',
        price: 100,
        isPublished: true,
        clientId: client.id,
      },
    });

    const appointment = await prisma.appointment.create({
      data: {
        clientFirstName: 'Secure',
        clientLastName: 'Caller',
        email: 'secure-caller@example.com',
        phone: '+15555559999',
        date: getValidMstBookingDate(15, 2),
        serviceId: service.id,
      },
    });

    await request(app)
      .put(`/api/appointments/${appointment.id}/confirm`)
      .send({ appointmentId: appointment.id, paymentStatus: 'completed' })
      .expect(401);

    const trustedResponse = await request(app)
      .put(`/api/appointments/${appointment.id}/confirm`)
      .set('x-payment-confirmation-secret', 'payment-confirm-secret')
      .send({ appointmentId: appointment.id, paymentStatus: 'completed' })
      .expect(200);

    expect(trustedResponse.body.states).toBe('confirmed');
    expect(trustedResponse.body.paymentStatus).toBe('paid');
  });
});
