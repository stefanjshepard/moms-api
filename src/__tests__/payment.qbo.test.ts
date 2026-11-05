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

if (!process.env.ADMIN_KEY) {
  process.env.ADMIN_KEY = 'test-admin-key';
}

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
  const originalOwnerEmail = process.env.BUSINESS_OWNER_EMAIL;

  beforeEach(() => {
    jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
    process.env.BOOKING_TOKEN_SECRET = 'test-booking-token-secret';
    process.env.BUSINESS_OWNER_EMAIL = 'owner@example.com';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.INTUIT_PAYMENT_MODE;
    delete process.env.BOOKING_TOKEN_SECRET;
    delete process.env.INTUIT_WEBHOOK_SECRET;
    if (originalOwnerEmail === undefined) {
      delete process.env.BUSINESS_OWNER_EMAIL;
    } else {
      process.env.BUSINESS_OWNER_EMAIL = originalOwnerEmail;
    }
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
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'Your payment was received — session is booked',
      expect.stringContaining('We received your payment')
    );
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'owner@example.com',
      'Payment received: Jane Doe',
      expect.any(String)
    );
  });

  it('does not email when a QBO invoice webhook still has a remaining Balance', async () => {
    const appointment = await seedConfirmedAppointment();
    await prisma.paymentTransaction.create({
      data: {
        appointmentId: appointment.id,
        provider: 'intuit',
        externalPaymentId: '43',
        status: 'pending',
        amount: 150,
        currency: 'USD',
        checkoutUrl: 'https://sandbox.qbo.intuit.com/app/payinvoice?invoiceId=43',
      },
    });
    (qboService.getQboInvoice as jest.Mock).mockResolvedValue({
      Id: '43',
      Balance: 150,
      TotalAmt: 150,
      CurrencyRef: { value: 'USD' },
    });

    const response = await request(app)
      .post('/api/webhooks/intuit')
      .send({
        eventNotifications: [
          {
            realmId: '9341454387816593',
            dataChangeEvent: {
              entities: [{ name: 'Invoice', id: '43', operation: 'Update', lastUpdated: '2026-10-21T01:00:00Z' }],
            },
          },
        ],
      })
      .expect(200);

    expect(response.body.status).toBe('invoice_unpaid');
    expect(emailService.sendEmail).not.toHaveBeenCalled();
  });

  it('marks a booking paid from a QBO Payment webhook linked to an invoice', async () => {
    const appointment = await seedConfirmedAppointment();
    await prisma.paymentTransaction.create({
      data: {
        appointmentId: appointment.id,
        provider: 'intuit',
        externalPaymentId: '44',
        status: 'pending',
        amount: 150,
        currency: 'USD',
        checkoutUrl: 'https://sandbox.qbo.intuit.com/app/payinvoice?invoiceId=44',
      },
    });
    (qboService.getQboPayment as jest.Mock).mockResolvedValue({
      Id: 'pay-44',
      TotalAmt: 150,
      LinkedTxn: [{ TxnId: '44', TxnType: 'Invoice' }],
    });
    (qboService.getQboInvoice as jest.Mock).mockResolvedValue({
      Id: '44',
      Balance: 0,
      TotalAmt: 150,
      CurrencyRef: { value: 'USD' },
    });

    const response = await request(app)
      .post('/api/webhooks/intuit')
      .send({
        eventNotifications: [
          {
            realmId: '9341454387816593',
            dataChangeEvent: {
              entities: [{ name: 'Payment', id: 'pay-44', operation: 'Create', lastUpdated: '2026-10-21T02:00:00Z' }],
            },
          },
        ],
      })
      .expect(200);

    expect(response.body.status).toBe('confirmed');
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'Your payment was received — session is booked',
      expect.any(String)
    );
  });

  it('confirms payment using the invoice PrivateNote when the stored invoice id drifted', async () => {
    const appointment = await seedConfirmedAppointment();
    await prisma.paymentTransaction.create({
      data: {
        appointmentId: appointment.id,
        provider: 'intuit',
        externalPaymentId: 'stale-invoice-id',
        status: 'pending',
        amount: 150,
        currency: 'USD',
        checkoutUrl: 'https://sandbox.qbo.intuit.com/app/payinvoice?invoiceId=stale-invoice-id',
      },
    });
    (qboService.getQboInvoice as jest.Mock).mockResolvedValue({
      Id: '45',
      Balance: 0,
      TotalAmt: 150,
      CurrencyRef: { value: 'USD' },
      PrivateNote: appointment.id,
    });

    const response = await request(app)
      .post('/api/webhooks/intuit')
      .send({
        eventNotifications: [
          {
            realmId: '9341454387816593',
            dataChangeEvent: {
              entities: [{ name: 'Invoice', id: '45', operation: 'Update', lastUpdated: '2026-10-21T03:00:00Z' }],
            },
          },
        ],
      })
      .expect(200);

    expect(response.body.status).toBe('confirmed');
    const updated = await prisma.appointment.findUnique({ where: { id: appointment.id } });
    expect(updated?.paymentStatus).toBe('paid');
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'Your payment was received — session is booked',
      expect.any(String)
    );
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

  it('rewrites sandbox comingSoon InvoiceLinks to a Connect Pay Now URL', () => {
    expect(
      qboService.normalizeQboInvoiceLink(
        'https://developer.intuit.com/comingSoon/scs-v1-abc123?locale=en_US&cta=v3invoicelink'
      )
    ).toBe('https://connect.intuit.com/t/scs-v1-abc123');
    expect(
      qboService.normalizeQboInvoiceLink('https://developer.intuit.com/comingSoonview/scs-v1-xyz')
    ).toBe('https://connect.intuit.com/t/scs-v1-xyz');
  });

  it('returns a rewritten Pay Now URL for an existing pending sandbox invoice', async () => {
    const appointment = await seedConfirmedAppointment();
    await prisma.paymentTransaction.create({
      data: {
        appointmentId: appointment.id,
        provider: 'intuit',
        externalPaymentId: '146',
        status: 'pending',
        amount: 150,
        currency: 'USD',
        checkoutUrl:
          'https://developer.intuit.com/comingSoon/scs-v1-abc123?locale=en_US&cta=v3invoicelink',
      },
    });

    const response = await request(app)
      .post('/api/payments/intuit/checkout-session')
      .set(
        'x-booking-token',
        createBookingAccessToken({ appointmentId: appointment.id, email: appointment.email })
      )
      .send({ appointmentId: appointment.id })
      .expect(201);

    expect(response.body.checkoutUrl).toBe('https://connect.intuit.com/t/scs-v1-abc123');
  });

  it('syncs a paid pending invoice from the admin endpoint', async () => {
    const appointment = await seedConfirmedAppointment();
    await prisma.paymentTransaction.create({
      data: {
        appointmentId: appointment.id,
        provider: 'intuit',
        externalPaymentId: '46',
        status: 'pending',
        amount: 150,
        currency: 'USD',
        checkoutUrl: 'https://sandbox.qbo.intuit.com/app/payinvoice?invoiceId=46',
      },
    });
    (qboService.getQboInvoice as jest.Mock).mockResolvedValue({
      Id: '46',
      Balance: 0,
      TotalAmt: 150,
      CurrencyRef: { value: 'USD' },
    });

    const response = await request(app)
      .post('/api/admin/integrations/intuit/sync-paid-invoices')
      .set('x-admin-key', process.env.ADMIN_KEY || 'test-admin-key')
      .expect(200);

    expect(response.body.checked).toBe(1);
    expect(response.body.results).toEqual([{ invoiceId: '46', status: 'confirmed' }]);
    expect(emailService.sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'Your payment was received — session is booked',
      expect.any(String)
    );
  });
});
