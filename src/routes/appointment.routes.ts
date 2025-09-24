import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateAppointment, validateAppointmentUpdate, validateAppointmentConfirmation } from '../validations/appointment.validation';

const appointmentRouter = express.Router();
const prisma = new PrismaClient();

// Create a new appointment
appointmentRouter.post('/', validateAppointment, async (req: Request, res: Response) => {
  try {
    const { clientFirstName, clientLastName, email, phone, date, serviceId } = req.body;
    
    // Check if service exists
    const service = await prisma.service.findUnique({
      where: { id: serviceId }
    });

    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    const appointment = await prisma.appointment.create({
      data: {
        clientFirstName,
        clientLastName,
        email,
        phone,
        date: new Date(date),
        serviceId,
        states: 'pending'
      }
    });
    res.status(201).json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all appointments
appointmentRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const appointments = await prisma.appointment.findMany();
    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get a specific appointment
appointmentRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id }
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update an appointment
appointmentRouter.put('/:id', validateAppointmentUpdate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientFirstName, clientLastName, email, phone, date } = req.body;
    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        clientFirstName,
        clientLastName,
        email,
        phone,
        date: date ? new Date(date) : undefined
      }
    });
    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Confirm appointment (update state after payment)
appointmentRouter.put('/:id/confirm', validateAppointmentConfirmation, async (req: Request, res: Response) => {
  try {
    const { paymentStatus } = req.body;
    
    if (paymentStatus !== 'completed') {
      res.status(400).json({ error: 'Invalid payment status' });
      return;
    }

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        states: 'confirmed'
      }
    });
    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete an appointment
appointmentRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.appointment.delete({
      where: { id: req.params.id }
    });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default appointmentRouter;