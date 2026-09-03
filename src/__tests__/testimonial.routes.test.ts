import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import { resetAllLimiters } from '../middleware/rateLimit';
import '../__tests__/setup';

const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

describe('Testimonial Routes', () => {
  beforeEach(async () => {
    // Reset rate limiters before each test
    await resetAllLimiters();
    
    // Clean up the database before each test
    await prisma.testimonial.deleteMany();
  });

  describe('GET /api/testimonials', () => {
    it('should return all testimonials', async () => {
      // Create test testimonials
      await prisma.testimonial.create({
        data: {
          title: 'Great Service',
          author: 'John Doe',
          content: 'Great service!'
        }
      });

      await prisma.testimonial.create({
        data: {
          title: 'Excellent Experience',
          author: 'Jane Smith',
          content: 'Excellent experience'
        }
      });

      const response = await request(app).get('/api/testimonials');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('title');
      expect(response.body[0]).toHaveProperty('author');
      expect(response.body[0]).toHaveProperty('content');
    });

    it('should return empty array when no testimonials exist', async () => {
      const response = await request(app).get('/api/testimonials');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('POST /api/testimonials', () => {
    it('should reject unauthenticated writes on the public mount', async () => {
      const response = await request(app)
        .post('/api/testimonials')
        .send({
          title: 'Great Service',
          author: 'John Doe',
          content: 'Great service!'
        });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Unauthorized' });
    });
  });

  describe('POST /api/admin/testimonials', () => {
    it('should create a new testimonial', async () => {
      const newTestimonial = {
        title: 'Great Service',
        author: 'John Doe',
        content: 'Great service!'
      };

      const response = await request(app)
        .post('/api/admin/testimonials')
        .set('x-admin-key', ADMIN_KEY)
        .send(newTestimonial);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('Great Service');
      expect(response.body.author).toBe('John Doe');
      expect(response.body.content).toBe('Great service!');
      expect(response.body).toHaveProperty('isPublished', false);
    });
  });
}); 