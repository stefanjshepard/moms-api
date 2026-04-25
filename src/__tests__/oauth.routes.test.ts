import request from 'supertest';
import { app } from '../index';
import '../__tests__/setup';

if (!process.env.ADMIN_KEY) {
  process.env.ADMIN_KEY = 'test-admin-key';
}

describe('OAuth Routes', () => {
  describe('POST /api/oauth/:provider/authorize', () => {
    it('should require admin authentication', async () => {
      await request(app).post('/api/oauth/google_calendar/authorize').expect(401);
    });

    it('should reject unsupported provider', async () => {
      const response = await request(app)
        .post('/api/oauth/not-a-provider/authorize')
        .set('x-admin-key', process.env.ADMIN_KEY || '')
        .expect(400);

      expect(response.body.error).toBe('Unsupported OAuth provider');
    });
  });

  describe('GET /api/oauth/callback/:provider', () => {
    it('should reject unsupported provider', async () => {
      const response = await request(app)
        .get('/api/oauth/callback/not-a-provider')
        .query({ code: 'abc', state: 'def' })
        .expect(400);

      expect(response.body.error).toBe('Unsupported OAuth provider');
    });

    it('should require code and state parameters', async () => {
      const response = await request(app).get('/api/oauth/callback/google_calendar').expect(400);
      expect(response.body.error).toBe('Missing OAuth callback parameters');
    });
  });

  describe('GET /api/oauth/:provider/status', () => {
    it('should require admin authentication', async () => {
      await request(app).get('/api/oauth/google_calendar/status').expect(401);
    });
  });

  describe('DELETE /api/oauth/:provider/connection', () => {
    it('should require admin authentication', async () => {
      await request(app).delete('/api/oauth/google_calendar/connection').expect(401);
    });
  });
});
