import request from 'supertest';
import { app } from '../index';
import { PrismaClient } from '@prisma/client';
import '../__tests__/setup';

const prisma = new PrismaClient();
const mockDate = new Date('2024-05-08T19:05:39.861Z');

describe('Blog Post Routes', () => {
  beforeEach(async () => {
    // Clean up the database before each test
    await prisma.blogPost.deleteMany();
    jest.useFakeTimers();
    jest.setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('GET /api/blog', () => {
    it('should return all published blog posts', async () => {
      // Create test blog posts
      await prisma.blogPost.create({
        data: {
          title: 'Test Post 1',
          content: 'Content 1',
          isPublished: true
        }
      });

      await prisma.blogPost.create({
        data: {
          title: 'Test Post 2',
          content: 'Content 2',
          isPublished: true
        }
      });

      // Create an unpublished post that shouldn't be returned
      await prisma.blogPost.create({
        data: {
          title: 'Unpublished Post',
          content: 'This should not appear',
          isPublished: false
        }
      });

      const response = await request(app).get('/api/blog');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('title');
      expect(response.body[0]).toHaveProperty('content');
      expect(response.body[0]).toHaveProperty('isPublished', true);
    });

    it('should return empty array when no published blog posts exist', async () => {
      const response = await request(app).get('/api/blog');
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/blog/:id', () => {
    it('should return a single published blog post', async () => {
      const blogPost = await prisma.blogPost.create({
        data: {
          title: 'Test Post',
          content: 'Test Content',
          isPublished: true
        }
      });

      const response = await request(app).get(`/api/blog/${blogPost.id}`);
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(blogPost.id);
      expect(response.body.title).toBe('Test Post');
      expect(response.body.content).toBe('Test Content');
      expect(response.body.isPublished).toBe(true);
    });

    it('should return 404 when blog post is not found', async () => {
      const response = await request(app).get('/api/blog/00000000-0000-0000-0000-000000000000');
      
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Blog post not found' });
    });

    it('should return 404 when blog post is not published', async () => {
      const blogPost = await prisma.blogPost.create({
        data: {
          title: 'Unpublished Post',
          content: 'This should not be accessible',
          isPublished: false
        }
      });

      const response = await request(app).get(`/api/blog/${blogPost.id}`);
      
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Blog post not found' });
    });
  });

  describe('POST /api/blog', () => {
    it('should create a new blog post', async () => {
      const newBlogPost = {
        title: 'New Post',
        content: 'New Content'
      };

      const response = await request(app)
        .post('/api/blog')
        .send(newBlogPost);
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('New Post');
      expect(response.body.content).toBe('New Content');
      expect(response.body.isPublished).toBe(false); // Default to unpublished
      expect(response.body).toHaveProperty('createdAt');
    });
  });

  describe('PUT /api/blog/:id', () => {
    it('should update an existing blog post', async () => {
      const blogPost = await prisma.blogPost.create({
        data: {
          title: 'Original Title',
          content: 'Original Content',
          isPublished: false
        }
      });

      const updateData = {
        title: 'Updated Title',
        content: 'Updated Content'
      };

      const response = await request(app)
        .put(`/api/blog/${blogPost.id}`)
        .send(updateData);
      
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(blogPost.id);
      expect(response.body.title).toBe('Updated Title');
      expect(response.body.content).toBe('Updated Content');
    });

    it('should return 500 when updating non-existent blog post', async () => {
      const response = await request(app)
        .put('/api/blog/00000000-0000-0000-0000-000000000000')
        .send({ title: 'Updated Title' });
      
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update blog post' });
    });
  });
});