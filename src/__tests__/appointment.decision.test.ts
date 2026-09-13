jest.mock('../services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  verifyEmailConfig: jest.fn().mockResolvedValue(true),
}));

jest.mock('../services/calendar.service', () => ({
  upsertGoogleCalendarEvent: jest.fn().mockResolvedValue('cal-event-1'),
  deleteGoogleCalendarEvent: jest.fn().mockResolvedValue(undefined),
  buildGoogleCalendarEventPayload: jest.fn(),
}));

import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../index';
import '../__tests__/setup';
import { getValidMstBookingDate } from './utils/scheduling';
import * as emailService from '../services/email.service';
import * as calendarService from '../services/calendar.service';
import { createBookingAccessToken } from '../services/booking-token.service';

const prisma = new PrismaClient();

describe('Appointment accept/deny + inquire-only services', () => {
  beforeEach(() => {
    (emailService.sendEmail as jest.Mock).mockResolvedValue(undefined);
    (calendarService.upsertGoogleCalendarEvent as jest.Mock).mockResolvedValue('cal-event-1');
    process.env.BOOKING_TOKEN_SECRET = 'decision-test-secret';
    process.env.BUSINESS_OWNER_EMAIL = 'owner@example.com';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.BOOKING_TOKEN_SECRET;
    delete process.env.BUSINESS_OWNER_EMAIL;
  });

  it('rejects inquire-only services on the 1:1 booker', async () => {
    const service = await prisma.service.create({
      data: {
        title: 'Sistership Circle Session',
        description: 'Circle offering that should not use the scheduler',
        price: 25,
        isPublished: true,
        bookingMode: 'inquire',
      },
    });

    const response = await request(app)
      .post('/api/appointments')
      .send({
        clientFirstName: 'Pat',
        clientLastName: 'Lee',
        email: 'pat@example.com',
        phone: '+15555551212',
        date: getValidMstBookingDate().toISOString(),
        serviceId: service.id,
      })
      .expect(400);

    expect(response.body.error).toContain('inquire-only');
  });

  it('accepts a booking, writes calendar, and issues a payment token', async () => {
    const service = await prisma.service.create({
      data: {
        title: 'Somatic Emotional Release (60 minutes)',
        description: 'A one to one session for testing accept',
        price: 140,
        isPublished: true,
        bookingMode: 'appointment',
      },
    });

    const created = await request(app)
      .post('/api/appointments')
      .send({
        clientFirstName: 'Sam',
        clientLastName: 'River',
        email: 'sam@example.com',
        phone: '+15555553333',
        date: getValidMstBookingDate().toISOString(),
        serviceId: service.id,
      })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const ownerCall = (emailService.sendEmail as jest.Mock).mock.calls.find(
      (call) => call[0] === 'owner@example.com'
    );
    expect(ownerCall?.[2]).toContain('Accept booking');
    expect(ownerCall?.[2]).toContain('Deny booking');

    const token = createBookingAccessToken({
      appointmentId: created.body.id,
      email: 'sam@example.com',
      purpose: 'decision',
    });

    const accepted = await request(app)
      .get(`/api/appointments/${created.body.id}/decision`)
      .query({ action: 'accept', token, format: 'json' })
      .set('Accept', 'application/json')
      .expect(200);

    expect(accepted.body.states).toBe('confirmed');
    expect(accepted.body.calendarSynced).toBe(true);
    expect(accepted.body.paymentToken).toBeTruthy();
    expect(calendarService.upsertGoogleCalendarEvent).toHaveBeenCalled();

    const stored = await prisma.appointment.findUnique({ where: { id: created.body.id } });
    expect(stored?.calendarEventId).toBe('cal-event-1');

    const reminders = await prisma.reminderJob.findMany({
      where: { appointmentId: created.body.id },
    });
    expect(reminders.length).toBeGreaterThan(0);

    await request(app)
      .post('/api/payments/intuit/checkout-session')
      .set('x-booking-token', accepted.body.paymentToken)
      .send({ appointmentId: created.body.id })
      .expect(201);
  });

  it('denies a booking and frees the slot', async () => {
    const service = await prisma.service.create({
      data: {
        title: 'Somatic Emotional Release (60 minutes)',
        description: 'A one to one session for testing deny',
        price: 140,
        isPublished: true,
      },
    });
    const slot = getValidMstBookingDate();
    const created = await request(app)
      .post('/api/appointments')
      .send({
        clientFirstName: 'Alex',
        clientLastName: 'Kim',
        email: 'alex@example.com',
        phone: '+15555554444',
        date: slot.toISOString(),
        serviceId: service.id,
      })
      .expect(201);

    const token = createBookingAccessToken({
      appointmentId: created.body.id,
      email: 'alex@example.com',
      purpose: 'decision',
    });

    await request(app)
      .get(`/api/appointments/${created.body.id}/decision`)
      .query({ action: 'deny', token, format: 'json' })
      .set('Accept', 'application/json')
      .expect(200);

    const stored = await prisma.appointment.findUnique({ where: { id: created.body.id } });
    expect(stored?.states).toBe('cancelled');

    await request(app)
      .post('/api/appointments')
      .send({
        clientFirstName: 'Jordan',
        clientLastName: 'Cole',
        email: 'jordan@example.com',
        phone: '+15555555555',
        date: slot.toISOString(),
        serviceId: service.id,
      })
      .expect(201);
  });

  it('blocks a 1:1 booking that overlaps a flyer exception', async () => {
    const client = await prisma.client.create({
      data: {
        name: 'Annette',
        aboutMe: 'Practitioner bio for testing flyer blocking of private sessions.',
        email: 'owner@example.com',
      },
    });
    const service = await prisma.service.create({
      data: {
        title: 'Somatic Emotional Release (60 minutes)',
        description: 'A one to one session overlapping a circle',
        price: 140,
        isPublished: true,
        clientId: client.id,
      },
    });
    const slot = getValidMstBookingDate();
    const end = new Date(slot.getTime() + 90 * 60_000);
    await prisma.availabilityException.create({
      data: {
        startDateTime: slot,
        endDateTime: end,
        isBlocked: true,
        reason: 'Sistership Circle flyer',
        clientId: client.id,
      },
    });

    const response = await request(app)
      .post('/api/appointments')
      .send({
        clientFirstName: 'Taylor',
        clientLastName: 'Ng',
        email: 'taylor@example.com',
        phone: '+15555556666',
        date: slot.toISOString(),
        serviceId: service.id,
      })
      .expect(409);

    expect(response.body.error).toContain('conflicts');
  });
});
