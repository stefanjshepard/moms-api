import request from 'supertest';
import { app } from '../../index';
import { PrismaClient } from '@prisma/client';
import { getValidMstBookingDate } from '../utils/scheduling';

const prisma = new PrismaClient();

describe('XSS Sanitizer Middleware', () => {
  let testServiceId: string;
  let testClientId: string;

  beforeEach(async () => {
    // Clean up all related data
    await prisma.appointment.deleteMany();
    await prisma.service.deleteMany();
    await prisma.client.deleteMany();

    // Create a test client
    const client = await prisma.client.create({
      data: {
        name: 'Test Client',
        aboutMe: 'Test Description',
        email: 'test@example.com'
      }
    });
    testClientId = client.id;

    // Create a test service for appointments, linked to the client
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

  it('should sanitize XSS in request body', async () => {
    const maliciousInput = {
      clientFirstName: '<script>alert("XSS")</script>John',
      clientLastName: 'Doe<script>alert("XSS")</script>',
      email: 'john.doe@example.com',
      phone: '+1234567890', // Valid phone format
      date: getValidMstBookingDate(),
      serviceId: testServiceId
    };

    const response = await request(app)
      .post('/api/appointments')
      .send(maliciousInput);

    expect(response.status).toBe(201);
    const appointment = await prisma.appointment.findFirst({
      where: { email: 'john.doe@example.com' }
    });
    expect(appointment?.clientFirstName).toBe('John');
    expect(appointment?.clientLastName).toBe('Doe');
  });

  it('should sanitize XSS in query parameters', async () => {
    const response = await request(app)
      .get('/api/services?title=<script>alert("XSS")</script>test');

    expect(response.status).toBe(200);
    const services = response.body;
    expect(services).toBeInstanceOf(Array);
    // Verify no XSS in the response
    services.forEach((service: any) => {
      expect(service.title).not.toContain('<script>');
    });
  });

  it('should sanitize XSS in URL parameters', async () => {
    const response = await request(app)
      .get('/api/services/<script>alert("XSS")</script>test-id');

    expect(response.status).toBe(404);
    // The URL parameter should be sanitized in the error message
    expect(response.body.error).not.toContain('<script>');
  });

  it('should handle nested objects with XSS', async () => {
    const maliciousInput = {
      clientFirstName: 'John',
      clientLastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+1234567890', // Valid phone format
      date: getValidMstBookingDate(),
      serviceId: testServiceId,
      notes: {
        text: '<script>alert("XSS")</script>Some notes',
        priority: '<img src="x" onerror="alert(\'XSS\')">high'
      }
    };

    const response = await request(app)
      .post('/api/appointments')
      .send(maliciousInput);

    expect(response.status).toBe(201);
    const appointment = await prisma.appointment.findFirst({
      where: { email: 'john.doe@example.com' }
    });
    expect(appointment?.clientFirstName).toBe('John');
    expect(appointment?.clientLastName).toBe('Doe');
  });
}); 