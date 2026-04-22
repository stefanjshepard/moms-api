import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

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

describe('Service Validation', () => {
  const validData = {
    title: 'Professional Massage',
    description: 'A relaxing full-body massage that helps relieve stress and tension. Perfect for those looking to unwind and rejuvenate.',
    price: 99.99
  };

  let clientId: string;

  beforeEach(async () => {
    // Create a client first
    const client = await prisma.client.create({
      data: {
        name: 'Test Client',
        aboutMe: 'A professional massage therapist with years of experience.',
        email: 'test@example.com'
      }
    });
    clientId = client.id;
  });

  describe('POST /api/admin/services', () => {
    it('should accept valid service data', async () => {
      const response = await request(app)
        .post('/api/admin/services')
        .set('x-admin-key', ADMIN_KEY)
        .send({ ...validData, clientId })
        .expect(201);

      expect(response.body).toHaveProperty('title', validData.title);
      expect(response.body).toHaveProperty('description', validData.description);
      expect(response.body).toHaveProperty('price', validData.price);
    });

    it('should reject invalid title', async () => {
      const response = await request(app)
        .post('/api/admin/services')
        .set('x-admin-key', ADMIN_KEY)
        .send({ ...validData, title: 'AB', clientId })
        .expect(400);

      expect(response.body.error).toContain('Title must be at least 3 characters long');
    });

    it('should reject invalid description', async () => {
      const response = await request(app)
        .post('/api/admin/services')
        .set('x-admin-key', ADMIN_KEY)
        .send({ ...validData, description: 'Too short', clientId })
        .expect(400);

      expect(response.body.error).toContain('Description must be at least 20 characters long');
    });

    it('should reject invalid price', async () => {
      const response = await request(app)
        .post('/api/admin/services')
        .set('x-admin-key', ADMIN_KEY)
        .send({ ...validData, price: -10, clientId })
        .expect(400);

      expect(response.body.error).toContain('Price cannot be negative');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/admin/services')
        .set('x-admin-key', ADMIN_KEY)
        .send({ title: 'Test Service', clientId })
        .expect(400);

      expect(response.body.error).toContain('Description is required');
      expect(response.body.error).toContain('Price is required');
    });

    it('should reject empty strings', async () => {
      const response = await request(app)
        .post('/api/admin/services')
        .set('x-admin-key', ADMIN_KEY)
        .send({
          title: '',
          description: '',
          price: 0,
          clientId
        })
        .expect(400);

      expect(response.body.error).toContain('Title is required');
      expect(response.body.error).toContain('Description is required');
    });

    it('should reject unauthorized requests', async () => {
      const response = await request(app)
        .post('/api/admin/services')
        .send({ ...validData, clientId })
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('Joi Schema Validation', () => {
    const { serviceSchema } = require('../validations/service.validation');

    it('should validate correct data', () => {
      const { error } = serviceSchema.validate({
        ...validData,
        clientId: '123e4567-e89b-12d3-a456-426614174000' // Valid UUID format
      });
      expect(error).toBeUndefined();
    });

    it('should reject data with title too long', () => {
      const { error } = serviceSchema.validate({
        ...validData,
        clientId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'a'.repeat(101)
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('Title cannot exceed 100 characters');
    });

    it('should reject data with description too long', () => {
      const { error } = serviceSchema.validate({
        ...validData,
        clientId: '123e4567-e89b-12d3-a456-426614174000',
        description: 'a'.repeat(1001)
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('Description cannot exceed 1000 characters');
    });

    it('should reject price with more than 2 decimal places', () => {
      const { error } = serviceSchema.validate({
        ...validData,
        clientId: '123e4567-e89b-12d3-a456-426614174000',
        price: 99.999
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('Price can have at most 2 decimal places');
    });

    it('should reject invalid UUID format', () => {
      const { error } = serviceSchema.validate({
        ...validData,
        clientId: 'invalid-uuid'
      });
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('Client ID must be a valid UUID');
    });
  });
}); 