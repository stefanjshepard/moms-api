import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

describe('Client Routes', () => {
  // Test data
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

  const testBlogPost = {
    title: 'Test Blog Post',
    content: 'This is a test blog post',
  };

  let createdClientId: string;

  beforeEach(async () => {
    try {
      // Clean up in reverse order to avoid foreign key constraints
      await prisma.appointment.deleteMany();
      await prisma.testimonial.deleteMany();
      await prisma.blogPost.deleteMany();
      await prisma.service.deleteMany();
      await prisma.client.deleteMany();

      // Create a client for tests
      const client = await prisma.client.create({
        data: testClient,
      });
      createdClientId = client.id;

      // Create testimonial for the client
      await prisma.testimonial.create({
        data: {
          ...testTestimonial,
          clientId: createdClientId,
        },
      });

      // Create blog post for the client
      await prisma.blogPost.create({
        data: {
          ...testBlogPost,
          clientId: createdClientId,
        },
      });

      // Verify that all records were created
      const createdClient = await prisma.client.findUnique({
        where: { id: createdClientId },
        include: {
          testimonials: true,
          blogPosts: true,
        },
      });

      if (!createdClient) {
        throw new Error('Client was not created properly');
      }

      if (createdClient.testimonials.length === 0) {
        throw new Error('Testimonial was not created properly');
      }

      if (createdClient.blogPosts.length === 0) {
        throw new Error('Blog post was not created properly');
      }
    } catch (error) {
      console.error('Error in beforeEach:', error);
      throw error;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/admin/clients', () => {
    it('should return all clients', async () => {
      const response = await request(app)
        .get('/api/admin/clients')
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0].name).toBe(testClient.name);
    });

    it('should reject unauthorized requests', async () => {
      const response = await request(app)
        .get('/api/admin/clients')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/admin/clients/:id', () => {
    it('should return client by ID', async () => {
      const response = await request(app)
        .get(`/api/admin/clients/${createdClientId}`)
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);

      expect(response.body.id).toBe(createdClientId);
      expect(response.body.name).toBe(testClient.name);
      expect(response.body.aboutMe).toBe(testClient.aboutMe);
      expect(response.body.email).toBe(testClient.email);
    });

    it('should return 404 if client not found', async () => {
      const response = await request(app)
        .get('/api/admin/clients/non-existent-id')
        .set('x-admin-key', ADMIN_KEY)
        .expect(404);

      expect(response.body.error).toBe('Client not found');
    });
  });

  describe('POST /api/admin/clients', () => {
    it('should create a new client', async () => {
      const newClient = {
        name: 'New Client',
        aboutMe: 'This is a new test client',
        email: 'new@example.com',
      };

      const response = await request(app)
        .post('/api/admin/clients')
        .set('x-admin-key', ADMIN_KEY)
        .send(newClient)
        .expect(201);

      expect(response.body.name).toBe(newClient.name);
      expect(response.body.aboutMe).toBe(newClient.aboutMe);
      expect(response.body.email).toBe(newClient.email);
    });

    it('should return 400 if required fields are missing', async () => {
      const response = await request(app)
        .post('/api/admin/clients')
        .set('x-admin-key', ADMIN_KEY)
        .send({ name: 'Incomplete Client' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('PUT /api/admin/clients/:id', () => {
    it('should update client', async () => {
      const updatedData = {
        name: 'Updated Client',
        aboutMe: 'This is an updated client',
        email: 'updated@example.com',
      };

      const response = await request(app)
        .put(`/api/admin/clients/${createdClientId}`)
        .set('x-admin-key', ADMIN_KEY)
        .send(updatedData)
        .expect(200);

      expect(response.body.name).toBe(updatedData.name);
      expect(response.body.aboutMe).toBe(updatedData.aboutMe);
      expect(response.body.email).toBe(updatedData.email);
    });
  });

  describe('DELETE /api/admin/clients/:id', () => {
    it('should delete client', async () => {
      await request(app)
        .delete(`/api/admin/clients/${createdClientId}`)
        .set('x-admin-key', ADMIN_KEY)
        .expect(204);

      const deletedClient = await prisma.client.findUnique({
        where: { id: createdClientId }
      });
      expect(deletedClient).toBeNull();
    });
  });
}); 