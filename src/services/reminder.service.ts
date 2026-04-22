import { PrismaClient } from '@prisma/client';
import { sendEmail } from './email.service';
import {
  appointmentReminderTemplate,
  appointmentReminderToOwnerTemplate,
} from './email.templates';
import { getReminderSendAt } from './scheduling.service';

const prisma = new PrismaClient();

const REMINDER_TYPE_24H = 'appointment_24h';

const getBusinessOwnerEmail = async (clientEmail?: string | null): Promise<string | null> => {
  if (clientEmail) {
    return clientEmail;
  }
  if (process.env.BUSINESS_OWNER_EMAIL) {
    return process.env.BUSINESS_OWNER_EMAIL;
  }
  const firstClient = await prisma.client.findFirst();
  return firstClient?.email ?? null;
};

export const scheduleAppointmentReminder = async (appointmentId: string, appointmentDate: Date): Promise<void> => {
  const sendAt = getReminderSendAt(appointmentDate);
  await prisma.reminderJob.deleteMany({
    where: {
      appointmentId,
      reminderType: REMINDER_TYPE_24H,
      status: { in: ['pending', 'failed'] },
    },
  });
  await prisma.reminderJob.create({
    data: {
      appointmentId,
      reminderType: REMINDER_TYPE_24H,
      sendAt,
      status: 'pending',
    },
  });
};

export const cancelAppointmentReminders = async (appointmentId: string): Promise<void> => {
  await prisma.reminderJob.updateMany({
    where: {
      appointmentId,
      status: 'pending',
    },
    data: {
      status: 'cancelled',
    },
  });
};

export const dispatchDueAppointmentReminders = async (): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> => {
  const jobs = await prisma.reminderJob.findMany({
    where: {
      status: 'pending',
      reminderType: REMINDER_TYPE_24H,
      sendAt: { lte: new Date() },
    },
    include: {
      appointment: {
        include: {
          service: {
            include: {
              Client: true,
            },
          },
        },
      },
    },
    orderBy: {
      sendAt: 'asc',
    },
  });

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const appointment = job.appointment;
      const service = appointment.service;

      const customerHtml = appointmentReminderTemplate({
        clientFirstName: appointment.clientFirstName,
        clientLastName: appointment.clientLastName,
        email: appointment.email,
        phone: appointment.phone,
        date: appointment.date,
        serviceTitle: service.title,
        appointmentId: appointment.id,
      });
      await sendEmail(appointment.email, 'Appointment Reminder - 24 Hours', customerHtml);

      const ownerEmail = await getBusinessOwnerEmail(service.Client?.email);
      if (ownerEmail) {
        const ownerHtml = appointmentReminderToOwnerTemplate({
          customerFirstName: appointment.clientFirstName,
          customerLastName: appointment.clientLastName,
          customerEmail: appointment.email,
          customerPhone: appointment.phone,
          date: appointment.date,
          serviceTitle: service.title,
          appointmentId: appointment.id,
        });
        await sendEmail(ownerEmail, 'Client Appointment Reminder (24h)', ownerHtml);
      }

      await prisma.reminderJob.update({
        where: { id: job.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          errorMessage: null,
        },
      });
      sent += 1;
    } catch (error) {
      await prisma.reminderJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      failed += 1;
    }
  }

  return {
    processed: jobs.length,
    sent,
    failed,
  };
};
