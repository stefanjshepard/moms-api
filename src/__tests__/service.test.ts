import request from 'supertest';
import { app } from '../index';
import { PrismaClient, Service } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

describe('Test Setup', () => {
  beforeEach(async () => {
    // Clean up the database before each test
    await prisma.service.deleteMany();
    await prisma.client.deleteMany();
  });

  it('should clean up the database before each test', async () => {
    const services = await prisma.service.findMany();
    expect(services).toHaveLength(0);
  });
});

describe('Service Routes', () => {
  let testService: {
    title: string;
    description: string;
    price: number;
    clientId: string;
  };

  beforeEach(async () => {
    // Create a test client first
    const testClient = await prisma.client.create({
      data: {
        name: 'Test Client',
        aboutMe: 'This is a test client for service testing',
        email: 'test@example.com'
      }
    });

    // Initialize test service with the client ID
    testService = {
      title: 'Test Service',
      description: 'Test Description',
      price: 100,
      clientId: testClient.id
    };
  });

  describe('POST /api/admin/services', () => {
    it('should create a new service', async () => {
      const response = await request(app)
        .post('/api/admin/services')
        .set('x-admin-key', ADMIN_KEY)
        .send({
          title: "DELEEETE MEEEEE",
          description: "1 Hour REIKI testetsttest!!!!",
          price: 250.00,
          clientId: testService.clientId
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe("DELEEETE MEEEEE");
      expect(response.body.description).toBe("1 Hour REIKI testetsttest!!!!");
      expect(response.body.price).toBe(250.00);
      expect(response.body.isPublished).toBe(false); // Should be unpublished by default
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/admin/services')
        .set('x-admin-key', ADMIN_KEY)
        .send({ title: 'Incomplete Service' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/services', () => {
    it('should return only published services', async () => {
      // Create a published service
      await prisma.service.create({
        data: { ...testService, isPublished: true }
      });

      // Create an unpublished service
      await prisma.service.create({
        data: { ...testService, title: 'Unpublished Service', isPublished: false }
      });

      const response = await request(app)
        .get('/api/services')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].isPublished).toBe(true);
    });
  });

  describe('GET /api/services/admin/all', () => {
    it('should return all services regardless of published status', async () => {
      // Create both published and unpublished services
      await prisma.service.create({
        data: { ...testService, isPublished: true }
      });
      await prisma.service.create({
        data: { ...testService, title: 'Unpublished Service', isPublished: false }
      });

      const response = await request(app)
        .get('/api/services/admin/all')
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body.some((service: Service) => service.isPublished)).toBe(true);
      expect(response.body.some((service: Service) => !service.isPublished)).toBe(true);
    });
  });

  describe('PATCH /api/services/:id/publish', () => {
    it('should update service published status', async () => {
      const service = await prisma.service.create({
        data: { ...testService, isPublished: false }
      });

      // Publish the service
      const response = await request(app)
        .patch(`/api/admin/services/${service.id}/publish`)
        .set('x-admin-key', ADMIN_KEY)
        .send({ isPublished: true })
        .expect(200);

      expect(response.body.isPublished).toBe(true);
    });

    it('should return 400 if isPublished is not provided', async () => {
      const service = await prisma.service.create({
        data: { ...testService, isPublished: false }
      });

      const response = await request(app)
        .patch(`/api/admin/services/${service.id}/publish`)
        .set('x-admin-key', ADMIN_KEY)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/services/:id', () => {
    it('should return a specific service', async () => {
      const createdService = await prisma.service.create({
        data: { ...testService, isPublished: true }
      });

      const response = await request(app)
        .get(`/api/services/${createdService.id}`)
        .expect(200);

      expect(response.body.id).toBe(createdService.id);
      expect(response.body.title).toBe(testService.title);
    });

    it('should return 404 if service not found', async () => {
      await request(app)
        .get('/api/services/non-existent-id')
        .expect(404);
    });
  });

  describe('PUT /api/services/:id', () => {
    it('should update a service', async () => {
      const createdService = await prisma.service.create({
        data: testService
      });

      const updatedData = {
        title: 'Updated Service',
        description: 'This is an updated service description that meets the minimum length requirement of 20 characters.',
        price: 200,
        clientId: testService.clientId
      };

      const response = await request(app)
        .put(`/api/admin/services/${createdService.id}`)
        .set('x-admin-key', ADMIN_KEY)
        .send(updatedData)
        .expect(200);

      expect(response.body.title).toBe(updatedData.title);
      expect(response.body.description).toBe(updatedData.description);
      expect(response.body.price).toBe(updatedData.price);
    });
  });

  describe('DELETE /api/services/:id', () => {
    it('should delete a service', async () => {
      const createdService = await prisma.service.create({
        data: testService
      });

      await request(app)
        .delete(`/api/admin/services/${createdService.id}`)
        .set('x-admin-key', ADMIN_KEY)
        .expect(204);

      // Verify the service is deleted
      const deletedService = await prisma.service.findUnique({
        where: { id: createdService.id }
      });
      expect(deletedService).toBeNull();
    });
  });
}); 