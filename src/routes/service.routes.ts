import express, { Request, Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateService } from '../validations/service.validation';
import { adminAuth } from '../middleware/auth';
import Joi from 'joi';

const serviceRouter: Router = express.Router();
const prisma = new PrismaClient();

// Validation schema for publish/unpublish
const publishSchema = Joi.object({
  isPublished: Joi.boolean().required()
});

// **********Public routes**********
// Get all published services
serviceRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const services = await prisma.service.findMany({
      where: { isPublished: true }
    });
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// **********Admin routes**********
// Get all services (admin) - must be before /:id route
serviceRouter.get('/admin/all', adminAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const services = await prisma.service.findMany();
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Get published service by ID
serviceRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await prisma.service.findUnique({
      where: { 
        id: req.params.id,
        isPublished: true
      }
    });
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch service' });
  }
});

// Create new service (admin)
serviceRouter.post('/', adminAuth, validateService, async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await prisma.service.create({
      data: {
        ...req.body,
        isPublished: false // Default to unpublished
      }
    });
    res.status(201).json(service);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// Update service (admin)
serviceRouter.put('/:id', adminAuth, validateService, async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(service);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Delete service (admin)
serviceRouter.delete('/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    // First check if the service exists
    const service = await prisma.service.findUnique({
      where: { id: req.params.id }
    });

    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // If service exists, delete it
    await prisma.service.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// Publish/unpublish service (admin)
serviceRouter.patch('/:id/publish', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { error, value } = publishSchema.validate(req.body);
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: { isPublished: value.isPublished }
    });
    res.json(service);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update service status' });
  }
});

export default serviceRouter;