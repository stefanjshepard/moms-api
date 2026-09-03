import express, { Request, Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { adminAuth } from '../middleware/auth';

const blogPostRouter: Router = express.Router();
const prisma = new PrismaClient();

// Public routes
// Get all published blog posts
blogPostRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const blogPosts = await prisma.blogPost.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(blogPosts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blog posts' });
  }
});

// Get published blog post by ID
blogPostRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const blogPost = await prisma.blogPost.findFirst({
      where: { 
        id: req.params.id,
        isPublished: true
      }
    });
    if (!blogPost) {
      res.status(404).json({ error: 'Blog post not found' });
      return;
    }
    res.json(blogPost);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
});

// Admin routes — also guarded here so the public /blog mount cannot write.
blogPostRouter.post('/', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const blogPost = await prisma.blogPost.create({
      data: {
        ...req.body,
        isPublished: false // Default to unpublished
      }
    });
    res.status(201).json(blogPost);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create blog post' });
  }
});

blogPostRouter.put('/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const blogPost = await prisma.blogPost.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(blogPost);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update blog post' });
  }
});

blogPostRouter.delete('/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.blogPost.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete blog post' });
  }
});

blogPostRouter.patch('/:id/publish', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const blogPost = await prisma.blogPost.update({
      where: { id: req.params.id },
      data: { isPublished: req.body.isPublished }
    });
    res.json(blogPost);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update blog post status' });
  }
});

export default blogPostRouter; 