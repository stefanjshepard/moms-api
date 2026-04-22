import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

describe('Blog Post Routes', () => {
  const testClient = {
    name: 'Test Client',
    aboutMe: 'This is a test client',
    email: 'test@example.com',
  };

  const testBlogPost = {
    title: 'Test Blog Post',
    content: 'This is a test blog post',
  };

  let createdClientId: string;
  let createdBlogPostId: string;

  beforeEach(async () => {
    try {
      await prisma.blogPost.deleteMany();
      await prisma.client.deleteMany();

      const client = await prisma.client.create({
        data: testClient,
      });
      createdClientId = client.id;

      const blogPost = await prisma.blogPost.create({
        data: {
          ...testBlogPost,
          clientId: createdClientId,
          isPublished: true,
        },
      });
      createdBlogPostId = blogPost.id;
    } catch (error) {
      console.error('Error in beforeEach:', error);
      throw error;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/admin/blog-posts', () => {
    it('should return all blog posts', async () => {
      const response = await request(app)
        .get('/api/admin/blog-posts')
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0].title).toBe(testBlogPost.title);
    });

    it('should reject unauthorized requests', async () => {
      const response = await request(app)
        .get('/api/admin/blog-posts')
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
    });
  });

  describe('GET /api/admin/blog-posts/:id', () => {
    it('should return blog post by ID', async () => {
      const response = await request(app)
        .get(`/api/admin/blog-posts/${createdBlogPostId}`)
        .set('x-admin-key', ADMIN_KEY)
        .expect(200);

      expect(response.body.id).toBe(createdBlogPostId);
      expect(response.body.title).toBe(testBlogPost.title);
      expect(response.body.content).toBe(testBlogPost.content);
    });

    it('should return 404 if blog post not found', async () => {
      const response = await request(app)
        .get('/api/admin/blog-posts/non-existent-id')
        .set('x-admin-key', ADMIN_KEY)
        .expect(404);

      expect(response.body.error).toBe('Blog post not found');
    });
  });

  describe('POST /api/admin/blog-posts', () => {
    it('should create a new blog post', async () => {
      const newBlogPost = {
        title: 'New Blog Post',
        content: 'This is a new blog post',
        clientId: createdClientId,
      };

      const response = await request(app)
        .post('/api/admin/blog-posts')
        .set('x-admin-key', ADMIN_KEY)
        .send(newBlogPost)
        .expect(201);

      expect(response.body.title).toBe(newBlogPost.title);
      expect(response.body.content).toBe(newBlogPost.content);
      expect(response.body.clientId).toBe(createdClientId);
      expect(response.body.isPublished).toBe(false);
    });
  });

  describe('PATCH /api/admin/blog-posts/:id/publish', () => {
    it('should publish a blog post', async () => {
      const response = await request(app)
        .patch(`/api/admin/blog-posts/${createdBlogPostId}/publish`)
        .set('x-admin-key', ADMIN_KEY)
        .send({ isPublished: true })
        .expect(200);

      expect(response.body.isPublished).toBe(true);
    });
  });
}); 