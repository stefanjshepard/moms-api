import request from 'supertest';
import { app } from '../index';
import { resetAllLimiters } from '../middleware/rateLimit';
import '../__tests__/setup';

// Ensure ADMIN_KEY is set for tests
if (!process.env.ADMIN_KEY) {
  process.env.ADMIN_KEY = 'test-admin-key';
}

describe('Security Measures', () => {
  beforeEach(async () => {
    // Reset rate limiters before each test
    await resetAllLimiters();
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const response = await request(app)
        .get('/api/services')
        .set('x-admin-key', process.env.ADMIN_KEY || '')
        .expect(200);

      expect(response.status).toBe(200);
    });

    it('should block requests exceeding rate limit', async () => {
      // Make multiple requests quickly in sequence to exceed the limit
      // Test environment allows 10 requests per 1 second window
      for (let i = 0; i < 11; i++) {
        await request(app)
          .get('/api/services');
      }

      // This request should be blocked (11th request)
      const response = await request(app)
        .get('/api/services');

      expect(response.status).toBe(429);
      // The rate limiter returns the message directly, not in an error object
      expect(response.text).toBe('Too many requests from this IP, please try again later.');
    });
  });

  describe('CORS', () => {
    it('should allow requests from allowed origins', async () => {
      const response = await request(app)
        .get('/api/services')
        .set('Origin', 'http://localhost:3000')
        .set('x-admin-key', process.env.ADMIN_KEY || '')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('should block requests from disallowed origins', async () => {
      const response = await request(app)
        .get('/api/services')
        .set('Origin', 'http://malicious-site.com')
        .set('x-admin-key', process.env.ADMIN_KEY || '')
        .expect(200); // CORS is handled by browser, so server still responds

      expect(response.headers['access-control-allow-origin']).not.toBe('http://malicious-site.com');
    });
  });

  describe('Admin Authentication', () => {
    it('should allow access with valid admin key', async () => {
      const response = await request(app)
        .get('/api/services/admin/all')
        .set('x-admin-key', process.env.ADMIN_KEY || '')
        .expect(200);

      expect(response.status).toBe(200);
    });

    it('should block access without admin key', async () => {
      const response = await request(app)
        .get('/api/services/admin/all')
        .expect(401);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should block access with invalid admin key', async () => {
      const response = await request(app)
        .get('/api/services/admin/all')
        .set('x-admin-key', 'invalid-key')
        .expect(401);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('Public vs Protected Routes', () => {
    it('should allow public access to appointments', async () => {
      const response = await request(app)
        .get('/api/appointments')
        .expect(200);

      expect(response.status).toBe(200);
    });

    it('should allow public access to services', async () => {
      const response = await request(app)
        .get('/api/services')
        .expect(200);

      expect(response.status).toBe(200);
    });

    it('should require admin key for protected routes', async () => {
      const response = await request(app)
        .get('/api/services/admin/all')
        .expect(401);

      expect(response.status).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('should not expose internal errors in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const response = await request(app)
        .get('/api/non-existent-route')
        .expect(404);

      expect(response.body.error).toBe('Resource not found');
      
      process.env.NODE_ENV = originalEnv;
    });
  });
}); 