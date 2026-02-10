import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { validateAppointment, validateAppointmentUpdate, validateAppointmentConfirmation } from '../validations/appointment.validation';
import { sendEmail } from '../services/email.service';
import {
  appointmentConfirmationTemplate,
  appointmentRescheduleTemplate,
  appointmentCancellationTemplate,
  appointmentConfirmedTemplate,
  appointmentNotificationToOwnerTemplate,
  appointmentRescheduleNotificationToOwnerTemplate,
  appointmentCancellationNotificationToOwnerTemplate,
} from '../services/email.templates';

const appointmentRouter = express.Router();
const prisma = new PrismaClient();

/** Resolve email for business owner: service owner, then env, then first client in DB */
async function getBusinessOwnerEmailForNotification(service: { Client?: { email: string } | null }): Promise<string | null> {
  if (service.Client?.email) {
    return service.Client.email;
  }
  if (process.env.BUSINESS_OWNER_EMAIL) {
    return process.env.BUSINESS_OWNER_EMAIL;
  }
  try {
    const client = await prisma.client.findFirst();
    return client?.email ?? null;
  } catch (error) {
    console.error('Error fetching business owner email:', error);
    return null;
  }
}

// Create a new appointment
appointmentRouter.post('/', validateAppointment, async (req: Request, res: Response) => {
  try {
    const { clientFirstName, clientLastName, email, phone, date, serviceId } = req.body;
    
    // Check if service exists and include Client for owner notification
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { Client: true },
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

    // Send confirmation email to customer (non-blocking)
    const emailHtml = appointmentConfirmationTemplate({
      clientFirstName,
      clientLastName,
      email,
      date: new Date(date),
      serviceTitle: service.title,
      serviceDescription: service.description,
      appointmentId: appointment.id,
    });
    sendEmail(email, 'Appointment Confirmation', emailHtml).catch((err) => {
      console.error('Failed to send appointment confirmation email:', err);
    });

    // Notify business owner with customer contact info so they can reach out if needed (non-blocking)
    getBusinessOwnerEmailForNotification(service).then((ownerEmail) => {
      if (ownerEmail) {
        const ownerHtml = appointmentNotificationToOwnerTemplate({
          customerFirstName: clientFirstName,
          customerLastName: clientLastName,
          customerEmail: email,
          customerPhone: phone ?? null,
          serviceTitle: service.title,
          date: new Date(date),
          appointmentId: appointment.id,
        });
        sendEmail(
          ownerEmail,
          `New appointment: ${clientFirstName} ${clientLastName} – ${service.title}`,
          ownerHtml
        ).catch((err) => {
          console.error('Failed to send appointment notification to business owner:', err);
        });
      }
    }).catch((err) => {
      console.error('Error getting business owner email for appointment notification:', err);
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
    // Get existing appointment to check if date changed (include Client for owner notification)
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { service: { include: { Client: true } } }
    });

    if (!existingAppointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    const { clientFirstName, clientLastName, email, phone, date } = req.body;
    const oldDate = existingAppointment.date;
    const newDate = date ? new Date(date) : undefined;
    const dateChanged = newDate && newDate.getTime() !== oldDate.getTime();

    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        clientFirstName,
        clientLastName,
        email,
        phone,
        date: newDate
      },
      include: { service: true }
    });

    // Send reschedule email if date changed (non-blocking)
    if (dateChanged && appointment.service) {
      const emailHtml = appointmentRescheduleTemplate({
        clientFirstName: appointment.clientFirstName,
        clientLastName: appointment.clientLastName,
        email: appointment.email,
        date: appointment.date,
        oldDate: oldDate,
        serviceTitle: appointment.service.title,
        serviceDescription: appointment.service.description,
        appointmentId: appointment.id,
      });
      sendEmail(appointment.email, 'Appointment Rescheduled', emailHtml).catch((err) => {
        console.error('Failed to send reschedule email:', err);
      });

      // Notify business owner of reschedule (non-blocking)
      getBusinessOwnerEmailForNotification(existingAppointment.service).then((ownerEmail) => {
        if (ownerEmail) {
          const ownerHtml = appointmentRescheduleNotificationToOwnerTemplate({
            customerFirstName: appointment.clientFirstName,
            customerLastName: appointment.clientLastName,
            customerEmail: appointment.email,
            customerPhone: appointment.phone ?? null,
            serviceTitle: appointment.service.title,
            date: appointment.date,
            oldDate: oldDate,
            appointmentId: appointment.id,
          });
          sendEmail(
            ownerEmail,
            `Appointment rescheduled: ${appointment.clientFirstName} ${appointment.clientLastName} – ${appointment.service.title}`,
            ownerHtml
          ).catch((err) => {
            console.error('Failed to send reschedule notification to business owner:', err);
          });
        }
      }).catch((err) => {
        console.error('Error getting business owner email for reschedule notification:', err);
      });
    }

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
      },
      include: { service: true }
    });

    // Send confirmation email to customer (non-blocking)
    if (appointment.service) {
      const emailHtml = appointmentConfirmedTemplate({
        clientFirstName: appointment.clientFirstName,
        clientLastName: appointment.clientLastName,
        email: appointment.email,
        date: appointment.date,
        serviceTitle: appointment.service.title,
        serviceDescription: appointment.service.description,
        appointmentId: appointment.id,
      });
      sendEmail(appointment.email, 'Appointment Confirmed!', emailHtml).catch((err) => {
        console.error('Failed to send appointment confirmed email:', err);
      });
    }

    res.json(appointment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete an appointment
appointmentRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    // Get appointment details before deleting (for email; include Client for owner notification)
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { service: { include: { Client: true } } }
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    await prisma.appointment.delete({
      where: { id: req.params.id }
    });

    // Send cancellation email to customer (non-blocking)
    if (appointment.service) {
      const emailHtml = appointmentCancellationTemplate({
        clientFirstName: appointment.clientFirstName,
        clientLastName: appointment.clientLastName,
        email: appointment.email,
        date: appointment.date,
        serviceTitle: appointment.service.title,
        serviceDescription: appointment.service.description,
        appointmentId: appointment.id,
      });
      sendEmail(appointment.email, 'Appointment Cancelled', emailHtml).catch((err) => {
        console.error('Failed to send cancellation email:', err);
      });

      // Notify business owner of cancellation (non-blocking)
      getBusinessOwnerEmailForNotification(appointment.service).then((ownerEmail) => {
        if (ownerEmail) {
          const ownerHtml = appointmentCancellationNotificationToOwnerTemplate({
            customerFirstName: appointment.clientFirstName,
            customerLastName: appointment.clientLastName,
            customerEmail: appointment.email,
            customerPhone: appointment.phone ?? null,
            serviceTitle: appointment.service.title,
            date: appointment.date,
            appointmentId: appointment.id,
          });
          sendEmail(
            ownerEmail,
            `Appointment cancelled: ${appointment.clientFirstName} ${appointment.clientLastName} – ${appointment.service.title}`,
            ownerHtml
          ).catch((err) => {
            console.error('Failed to send cancellation notification to business owner:', err);
          });
        }
      }).catch((err) => {
        console.error('Error getting business owner email for cancellation notification:', err);
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default appointmentRouter;