import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { appointmentSchema, appointmentConfirmationSchema } from '../validations/appointment.validation';
import { getValidMstBookingDate } from './utils/scheduling';

const prisma = new PrismaClient();

describe('Test Setup', () => {
  it('should clean up the database before each test', async () => {
    // Clean up in the correct order
    await prisma.appointment.deleteMany();
    await prisma.testimonial.deleteMany();
    await prisma.blogPost.deleteMany();
    await prisma.service.deleteMany();
    await prisma.client.deleteMany();
  });
});

describe('Appointment Validation', () => {
  const validData = {
    clientFirstName: 'John',
    clientLastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    date: getValidMstBookingDate(),
    serviceId: '123e4567-e89b-12d3-a456-426614174000', // Valid UUID format
    states: 'pending'
  };

  let serviceId: string;

  beforeEach(async () => {
    // Create a client and service for testing
    const client = await prisma.client.create({
      data: {
        name: 'Test Client',
        aboutMe: 'A professional massage therapist with years of experience.',
        email: 'test@example.com'
      }
    });

    const service = await prisma.service.create({
      data: {
        title: 'Test Service',
        description: 'A test service description that meets the minimum length requirement.',
        price: 99.99,
        clientId: client.id
      }
    });

    serviceId = service.id;
  });

  describe('POST /api/appointments', () => {
    it('should accept valid appointment data', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({ ...validData, serviceId })
        .expect(201);

      expect(response.body).toHaveProperty('clientFirstName', validData.clientFirstName);
      expect(response.body).toHaveProperty('clientLastName', validData.clientLastName);
      expect(response.body).toHaveProperty('email', validData.email);
      expect(response.body).toHaveProperty('phone', validData.phone);
    });

    it('should reject invalid first name', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({ ...validData, serviceId, clientFirstName: 'A' })
        .expect(400);

      expect(response.body.error).toContain('First name must be at least 2 characters long');
    });

    it('should reject invalid last name', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({ ...validData, serviceId, clientLastName: 'B' })
        .expect(400);

      expect(response.body.error).toContain('Last name must be at least 2 characters long');
    });

    it('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({ ...validData, serviceId, email: 'invalid-email' })
        .expect(400);

      expect(response.body.error).toContain('Please provide a valid email address');
    });

    it('should reject invalid phone number', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({ ...validData, serviceId, phone: '123' })
        .expect(400);

      expect(response.body.error).toContain('Please provide a valid phone number');
    });

    it('should reject missing phone number', async () => {
      const { phone, ...dataWithoutPhone } = validData;
      const response = await request(app)
        .post('/api/appointments')
        .send({ ...dataWithoutPhone, serviceId })
        .expect(400);

      expect(response.body.error).toContain('Phone number is required');
    });

    it('should reject appointment date too soon', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({ 
          ...validData, 
          serviceId,
          date: new Date(Date.now() + 12 * 60 * 60 * 1000)
        })
        .expect(400);

      expect(response.body.error).toContain('Appointments must be scheduled at least 24 hours in advance');
    });

    it('should reject invalid service ID', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({ ...validData, serviceId: 'invalid-uuid' })
        .expect(400);

      expect(response.body.error).toContain('Service ID must be a valid UUID');
    });

    it('should reject invalid appointment state', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .send({ ...validData, serviceId, states: 'invalid-state' })
        .expect(400);

      expect(response.body.error).toContain('Status must be one of: pending, confirmed, or cancelled');
    });
  });

  describe('Joi Schema Validation', () => {
    it('should validate correct data', () => {
      const { error } = appointmentSchema.validate(validData);
      expect(error).toBeUndefined();
    });

    it('should reject data with first name too long', () => {
      const { error } = appointmentSchema.validate({
        ...validData,
        clientFirstName: 'a'.repeat(51)
      });
      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('First name cannot exceed 50 characters');
    });

    it('should reject data with last name too long', () => {
      const { error } = appointmentSchema.validate({
        ...validData,
        clientLastName: 'a'.repeat(51)
      });
      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('Last name cannot exceed 50 characters');
    });

    it('should reject invalid email domain', () => {
      const { error } = appointmentSchema.validate({
        ...validData,
        email: 'test@invalid'
      });
      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('Please provide a valid email address');
    });

    it('should reject invalid phone format', () => {
      const { error } = appointmentSchema.validate({
        ...validData,
        phone: '123-456-7890' // Invalid format
      });
      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('Please provide a valid phone number');
    });
  });

  describe('Appointment Confirmation Validation', () => {
    it('should validate correct confirmation data', () => {
      const { error } = appointmentConfirmationSchema.validate({
        appointmentId: '123e4567-e89b-12d3-a456-426614174000',
        paymentStatus: 'completed'
      });
      expect(error).toBeUndefined();
    });

    it('should reject invalid appointment ID', () => {
      const { error } = appointmentConfirmationSchema.validate({
        appointmentId: 'invalid-uuid',
        paymentStatus: 'completed'
      });
      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('Appointment ID must be a valid UUID');
    });

    it('should reject invalid payment status', () => {
      const { error } = appointmentConfirmationSchema.validate({
        appointmentId: '123e4567-e89b-12d3-a456-426614174000',
        paymentStatus: 'invalid-status'
      });
      expect(error).toBeDefined();
      expect(error!.details[0].message).toContain('Payment status must be one of: completed, pending, or failed');
    });
  });
}); 