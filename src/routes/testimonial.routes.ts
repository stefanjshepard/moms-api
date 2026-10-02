import express, { Request, Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { adminAuth } from '../middleware/auth';

const testimonialRouter: Router = express.Router();
const prisma = new PrismaClient();

// Get all testimonials
testimonialRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const publishedOnly = !req.baseUrl.includes('/admin');
    const testimonials = await prisma.testimonial.findMany({
      where: publishedOnly ? { isPublished: true } : undefined,
    });
    res.json(testimonials);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch testimonials' });
  }
});

// Get a specific testimonial by ID
testimonialRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const publishedOnly = !req.baseUrl.includes('/admin');
    const testimonial = await prisma.testimonial.findUnique({
      where: { id: req.params.id }
    });
    
    if (!testimonial || (publishedOnly && !testimonial.isPublished)) {
      res.status(404).json({ error: 'Testimonial not found' });
      return;
    }
    
    res.json(testimonial);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch testimonial' });
  }
});

// Create is admin-only even on the public mount.
testimonialRouter.post('/', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const testimonial = await prisma.testimonial.create({
      data: req.body
    });
    res.status(201).json(testimonial);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create testimonial' });
  }
});

export default testimonialRouter; 