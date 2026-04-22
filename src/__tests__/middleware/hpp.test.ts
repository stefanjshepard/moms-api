import request from 'supertest';
import { app } from '../../index';
import { PrismaClient } from '@prisma/client';
import { getValidMstBookingDate } from '../utils/scheduling';

const prisma = new PrismaClient();

describe('HPP Middleware', () => {
  let testServiceId: string;
  let testClientId: string;

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
    await prisma.service.deleteMany();
    await prisma.client.deleteMany();

    const client = await prisma.client.create({
      data: {
        name: 'Test Client',
        aboutMe: 'Test Description',
        email: 'test@example.com'
      }
    });
    testClientId = client.id;

    const service = await prisma.service.create({
      data: {
        title: 'Test Service',
        description: 'Test Description',
        price: 100,
        isPublished: true,
        clientId: testClientId
      }
    });
    testServiceId = service.id;
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany();
    await prisma.service.deleteMany();
    await prisma.client.deleteMany();
    await prisma.$disconnect();
  });

  it('should handle duplicate query parameters', async () => {
    const response = await request(app)
      .get('/api/services?title=first&title=second');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    // Just verify the request was processed successfully
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('should handle duplicate body parameters', async () => {
    const date = encodeURIComponent(getValidMstBookingDate().toISOString());
    const response = await request(app)
      .post('/api/appointments')
      .type('form')
      .send(
        `clientFirstName=John&clientFirstName=Jane&clientLastName=Doe&email=john.doe@example.com&phone=%2B1234567890&date=${date}&serviceId=${testServiceId}`
      );

    if (response.status !== 201) {
      console.log('Validation error:', response.body);
    }

    expect(response.status).toBe(201);
    const appointment = await prisma.appointment.findFirst({
      where: { email: 'john.doe@example.com' }
    });
    // Should only use the last value
    expect(appointment?.clientFirstName).toBe('Jane');
  });

  it('should handle duplicate array parameters', async () => {
    const response = await request(app)
      .get('/api/services?title=first&title=second&title=third');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    // Just verify the request was processed successfully
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('should handle mixed parameter types', async () => {
    const date = encodeURIComponent(getValidMstBookingDate().toISOString());
    const response = await request(app)
      .post('/api/appointments')
      .type('form')
      .send(
        `clientFirstName=John&clientFirstName=Jane&clientLastName=Doe&clientLastName=Smith&email=john.doe@example.com&phone=%2B1234567890&phone=%2B19876543210&date=${date}&serviceId=${testServiceId}`
      );

    if (response.status !== 201) {
      console.log('Validation error:', response.body);
    }

    expect(response.status).toBe(201);
    const appointment = await prisma.appointment.findFirst({
      where: { email: 'john.doe@example.com' }
    });
    // Should only use the last values
    expect(appointment?.clientFirstName).toBe('Jane');
    expect(appointment?.clientLastName).toBe('Smith');
    expect(appointment?.phone).toBe('+19876543210');
  });
}); 