import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import '../__tests__/setup';

const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

describe('Contact Request Routes', () => {
  //Test data
  const testContactRequest = {
    name: 'John Doe',
    email: 'john.doe@example.com',
    message: 'This is a test message'
  };
  describe('POST /api/contact', () => {
    it('should create a new contact request', async () => {
      const response = await request(app).post('/api/contact').send(testContactRequest);
      expect(response.status).toBe(201);
      expect(response.body.name).toBe(testContactRequest.name);
      expect(response.body.email).toBe(testContactRequest.email);
      expect(response.body.message).toBe(testContactRequest.message);
    });
  });

  describe('GET /api/contact', () => {
    it('should get all contact requests', async () => {
      await prisma.contactRequest.create({
        data: testContactRequest
      });
      const response = await request(app)
        .get('/api/contact')
        .set('x-admin-key', ADMIN_KEY);
      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
    });
  });

  describe('DELETE /api/contact/:id', () => {
    it('should delete a contact request', async () => {
      const contactRequest = await prisma.contactRequest.create({
        data: testContactRequest
      });
      
      const response = await request(app)
        .delete(`/api/contact/${contactRequest.id}`)
        .set('x-admin-key', ADMIN_KEY);
      expect(response.status).toBe(204);
    });
  });
});