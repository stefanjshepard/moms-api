import request from 'supertest';
import { app } from '../index';
import '../__tests__/setup';

if (!process.env.ADMIN_KEY) {
  process.env.ADMIN_KEY = 'test-admin-key';
}

describe('Integration Routes', () => {
  it('should require admin auth for provider status', async () => {
    await request(app).get('/api/admin/integrations/intuit/status').expect(401);
  });

  it('should return disconnected status for intuit when not connected', async () => {
    const response = await request(app)
      .get('/api/admin/integrations/intuit/status')
      .set('x-admin-key', process.env.ADMIN_KEY || '')
      .expect(200);

    expect(response.body.provider).toBe('intuit');
    expect(response.body.connected).toBe(false);
  });

  it('should reject unsupported provider on status endpoint', async () => {
    const response = await request(app)
      .get('/api/admin/integrations/notreal/status')
      .set('x-admin-key', process.env.ADMIN_KEY || '')
      .expect(400);

    expect(response.body.error).toBe('Unsupported provider');
  });

  it('should reject unsupported provider on refresh endpoint', async () => {
    const response = await request(app)
      .post('/api/admin/integrations/notreal/refresh')
      .set('x-admin-key', process.env.ADMIN_KEY || '')
      .send({})
      .expect(400);

    expect(response.body.error).toBe('Unsupported provider');
  });
});
