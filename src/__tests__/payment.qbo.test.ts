import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { app } from '../index';
import '../__tests__/setup';
import { getValidMstBookingDate } from './utils/scheduling';
import * as emailService from '../services/email.service';
import * as qboService from '../services/intuit-qbo.service';
import { createBookingAccessToken } from '../services/booking-token.service';

const prisma = new PrismaClient();

jest.mock('../services/intuit-qbo.service', () => {
  const actual = jest.requireActual('../services/intuit-qbo.service');
  return {
    ...actual,
    createQboInvoiceCheckout: jest.fn(),
    getQboInvoice: jest.fn(),
    getQboPayment: jest.fn(),
  };
});

describe('QBO invoice Pay Now checkout', () => {
  beforeEach(() => {
    jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
    process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.INTUIT_PAYMENT_MODE;
    delete process.env.BOOKING_TOKEN_SECRET;
    delete process.env.INTUIT_WEBHOOK_SECRET;
  });

  const seedConfirmedAppointment = async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Client Name',
        aboutMe: 'About text',
        email: 'owner@example.com',
      },
    });
    const service = await prisma.service.create({
      data: {
        title: 'Private session',
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
        states: 'confirmed',
      },
    });
    return appointment;
  };

  it('creates a QBO invoice checkout URL when INTUIT_PAYMENT_MODE=qbo', async () => {
    const appointment = await seedConfirmedAppointment();
    process.env.INTUIT_PAYMENT_MODE = 'qbo';
    (qboService.createQboInvoiceCheckout as jest.Mock).mockResolvedValue({
      invoiceId: '42',
      checkoutUrl: 'https://sandbox.qbo.intuit.com/app/payinvoice?invoiceId=42',
      raw: { Invoice: { Id: '42' } },
    });

    const response = await request(app)
      .post('/api/payments/intuit/checkout-session')
      .set(
        'x-booking-token',
        createBookingAccessToken({ appointmentId: appointment.id, email: appointment.email })
      )
      .send({ appointmentId: appointment.id })
      .expect(201);

    expect(response.body.mode).toBe('qbo');
    expect(response.body.externalPaymentId).toBe('42');
    expect(response.body.checkoutUrl).toContain('payinvoice');
    expect(qboService.createQboInvoiceCheckout).toHaveBeenCalled();
  });

  it('marks a booking paid from a QBO invoice webhook when Balance is 0', async () => {
    const appointment = await seedConfirmedAppointment();
    await prisma.paymentTransaction.create({
      data: {
        appointmentId: appointment.id,
        provider: 'intuit',
        externalPaymentId: '42',
        status: 'pending',
        amount: 150,
        currency: 'USD',
        checkoutUrl: 'https://sandbox.qbo.intuit.com/app/payinvoice?invoiceId=42',
      },
    });
    (qboService.getQboInvoice as jest.Mock).mockResolvedValue({
      Id: '42',
      Balance: 0,
      TotalAmt: 150,
      CurrencyRef: { value: 'USD' },
    });

    const payload = {
      eventNotifications: [
        {
          realmId: '9341454387816593',
          dataChangeEvent: {
            entities: [{ name: 'Invoice', id: '42', operation: 'Update', lastUpdated: '2026-10-21T00:00:00Z' }],
          },
        },
      ],
    };

    const response = await request(app).post('/api/webhooks/intuit').send(payload).expect(200);
    expect(response.body.status).toBe('confirmed');

    const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(updated?.paymentStatus).toBe('paid');
    expect(emailService.sendEmail).toHaveBeenCalled();
  });

  it('accepts official QBO webhook signatures without a timestamp header', async () => {
    process.env.INTUIT_WEBHOOK_SECRET = 'qbo-verifier-token';
    const payload = {
      eventNotifications: [
        {
          realmId: '9341454387816593',
          dataChangeEvent: { entities: [{ name: 'Invoice', id: '99', operation: 'Update' }] },
        },
      ],
    };
    const raw = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', 'qbo-verifier-token').update(raw, 'utf8').digest('base64');
    (qboService.getQboInvoice as jest.Mock).mockResolvedValue({
      Id: '99',
      Balance: 12,
      TotalAmt: 12,
      CurrencyRef: { value: 'USD' },
    });

    await request(app)
      .post('/api/webhooks/intuit')
      .set('intuit-signature', signature)
      .send(payload)
      .expect(200);
  });
});
