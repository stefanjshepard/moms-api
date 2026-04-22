import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { contactSchema } from '../validations/contact.validation';
import { sendEmail } from '../services/email.service';
import { contactRequestNotificationTemplate } from '../services/email.templates';
import dotenv from 'dotenv';

dotenv.config();

const contactRouter = express.Router();
const prisma = new PrismaClient();

// Helper function to get business owner email
const getBusinessOwnerEmail = async (): Promise<string | null> => {
  // First try environment variable
  if (process.env.BUSINESS_OWNER_EMAIL) {
    return process.env.BUSINESS_OWNER_EMAIL;
  }

  // Fallback to first client email in database
  try {
    const client = await prisma.client.findFirst();
    return client?.email || null;
  } catch (error) {
    console.error('Error fetching business owner email:', error);
    return null;
  }
};

contactRouter.post('/', async (req: Request, res: Response) => {
  const { error, value } = contactSchema.validate(req.body, { abortEarly: false });

  if (error) {
    res.status(400).json({ 
      message: error.details[0].message 
    });
    return;
  }

  try {
    const contactRequest = await prisma.contactRequest.create({
      data: value,
    });

    // Send email notification to business owner (non-blocking)
    getBusinessOwnerEmail().then((ownerEmail) => {
      if (ownerEmail) {
        const emailHtml = contactRequestNotificationTemplate({
          name: value.name,
          email: value.email,
          message: value.message,
        });
        sendEmail(
          ownerEmail,
          `New Contact Request from ${value.name}`,
          emailHtml
        ).catch((err) => {
          console.error('Failed to send contact request email:', err);
        });
      }
    }).catch((err) => {
      console.error('Error getting business owner email:', err);
    });

    res.status(201).json(contactRequest);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

contactRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const contactRequests = await prisma.contactRequest.findMany();
    res.json(contactRequests);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

contactRouter.delete('/:id', async (req: Request, res: Response) => {
  await prisma.contactRequest.delete({
    where: { id: req.params.id }
  });
  res.status(204).send();
});

export default contactRouter;