import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';
import '../__tests__/setup';
import { getValidMstBookingDate } from './utils/scheduling';
import * as emailService from '../services/email.service';

const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

describe('Circle flyer routes', () => {
  beforeEach(() => {
    jest.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);
    process.env.BOOKING_TOKEN_SECRET = 'flyer-test-secret';
    process.env.BUSINESS_OWNER_EMAIL = 'owner@example.com';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.BOOKING_TOKEN_SECRET;
    delete process.env.BUSINESS_OWNER_EMAIL;
  });

  async function seedCircleService() {
    const client = await prisma.client.create({
      data: {
        name: 'Annette',
        aboutMe: 'Practitioner bio used while testing circle flyers.',
        email: 'owner@example.com',
      },
    });
    const service = await prisma.service.create({
      data: {
        title: 'Sistership Circle Session',
        description: 'Online and live circle sessions for testing flyers.',
        price: 25,
        durationMinutes: 90,
        isPublished: true,
        bookingMode: 'inquire',
        clientId: client.id,
      },
    });
    return { client, service };
  }

  it('publishes a flyer, blocks 1:1 overlap, and allows circle registrations with checkout', async () => {
    const { client, service } = await seedCircleService();
    const start = getValidMstBookingDate(10, 2);
    const end = new Date(start.getTime() + 90 * 60_000);

    const created = await request(app)
      .post('/api/admin/flyers')
      .set('x-admin-key', ADMIN_KEY)
      .send({
        title: 'September Sistership Circle',
        body: 'A trauma-aware evening for rest, ritual, and community.',
        eventStart: start.toISOString(),
        eventEnd: end.toISOString(),
        price: 25,
        serviceId: service.id,
        isPublished: true,
      })
      .expect(201);

    expect(created.body.availabilityExceptionId).toBeTruthy();

    const current = await request(app).get('/api/flyers/current').expect(200);
    expect(current.body.title).toBe('September Sistership Circle');

    const privateService = await prisma.service.create({
      data: {
        title: 'Somatic Emotional Release (60 minutes)',
        description: 'Private session that should not overlap the circle flyer',
        price: 140,
        isPublished: true,
        clientId: client.id,
      },
    });

    await request(app)
      .post('/api/appointments')
      .send({
        clientFirstName: 'One',
        clientLastName: 'One',
        email: 'one@example.com',
        phone: '+15555557777',
        date: start.toISOString(),
        serviceId: privateService.id,
      })
      .expect(409);

    const firstSeat = await request(app)
      .post(`/api/flyers/${created.body.id}/register`)
      .send({
        clientFirstName: 'Circle',
        clientLastName: 'One',
        email: 'circle.one@example.com',
        phone: '+15555551111',
      })
      .expect(201);
    expect(firstSeat.body.kind).toBe('circle');
    expect(firstSeat.body.checkoutToken).toBeTruthy();

    const secondSeat = await request(app)
      .post(`/api/flyers/${created.body.id}/register`)
      .send({
        clientFirstName: 'Circle',
        clientLastName: 'Two',
        email: 'circle.two@example.com',
        phone: '+15555552222',
      })
      .expect(201);
    expect(secondSeat.body.id).not.toBe(firstSeat.body.id);

    await request(app)
      .post('/api/payments/intuit/checkout-session')
      .set('x-booking-token', firstSeat.body.checkoutToken)
      .send({ appointmentId: firstSeat.body.id })
      .expect(201);
  });
});
