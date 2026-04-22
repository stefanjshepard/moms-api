import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { resetAllLimiters } from '../middleware/rateLimit';
import dotenv from 'dotenv';
import '../__tests__/setup';

dotenv.config();

const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

describe('Testimonial Routes', () => {
  const testClient = {
    name: 'Test Client',
    aboutMe: 'This is a test client',
    email: 'test@example.com',
  };

  const testTestimonial = {
    title: 'Great Experience',
    content: 'Great service!',
    author: 'Test Author',
  };

  let createdClientId: string;
  let createdTestimonialId: string;

  beforeEach(async () => {
    try {
      // Reset rate limiters before each test
      await resetAllLimiters();
      
      await prisma.testimonial.deleteMany();
      await prisma.client.deleteMany();

      const client = await prisma.client.create({
        data: testClient,
      });
      createdClientId = client.id;

      const testimonial = await prisma.testimonial.create({
        data: {
          ...testTestimonial,
          clientId: createdClientId,
        },
      });
      createdTestimonialId = testimonial.id;
    } catch (error) {
      console.error('Error in beforeEach:', error);
      throw error;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/admin/testimonials', () => {
    it('should return all testimonials', async () => {
      const response = await request(app)
        .get('/api/admin/testimonials')
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0].title).toBe(testTestimonial.title);
    });

    it('should reject unauthorized requests', async () => {
      const response = await request(app)
        .get('/api/admin/testimonials')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/admin/testimonials/:id', () => {
    it('should return testimonial by ID', async () => {
      const response = await request(app)
        .get(`/api/admin/testimonials/${createdTestimonialId}`)
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);

      expect(response.body.id).toBe(createdTestimonialId);
      expect(response.body.title).toBe(testTestimonial.title);
      expect(response.body.content).toBe(testTestimonial.content);
      expect(response.body.author).toBe(testTestimonial.author);
    });

    it('should return 404 if testimonial not found', async () => {
      const response = await request(app)
        .get('/api/admin/testimonials/non-existent-id')
        .set('x-admin-key', ADMIN_KEY)
        .expect(404);

      expect(response.body.error).toBe('Testimonial not found');
    });
  });

  describe('POST /api/admin/testimonials', () => {
    it('should create a new testimonial', async () => {
      const newTestimonial = {
        title: 'New Testimonial',
        content: 'Great experience!',
        author: 'New Author',
        clientId: createdClientId,
      };

      const response = await request(app)
        .post('/api/admin/testimonials')
        .set('x-admin-key', ADMIN_KEY)
        .send(newTestimonial)
        .expect(201);

      expect(response.body.title).toBe(newTestimonial.title);
      expect(response.body.content).toBe(newTestimonial.content);
      expect(response.body.author).toBe(newTestimonial.author);
      expect(response.body.clientId).toBe(createdClientId);
    });
  });
}); 