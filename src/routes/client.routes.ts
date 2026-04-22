import express, { Request, Response, Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateClient } from '../validations/client.validation';
import { adminAuth } from '../middleware/auth';

const clientRouter: Router = express.Router();
const prisma = new PrismaClient();

// Get all clients (admin)
clientRouter.get('/', adminAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const clients = await prisma.client.findMany();
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get client by ID (admin)
clientRouter.get('/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id }
    });
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Create new client (admin)
clientRouter.post('/', adminAuth, validateClient, async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await prisma.client.create({
      data: req.body
    });
    res.status(201).json(client);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client (admin)
clientRouter.put('/:id', adminAuth, validateClient, async (req: Request, res: Response): Promise<void> => {
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Delete client (admin)
clientRouter.delete('/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.client.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

export default clientRouter;