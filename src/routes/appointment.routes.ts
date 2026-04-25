import express, { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
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
import {
  BOOKING_TIMEZONE,
  DEFAULT_BUSINESS_END_MINUTES,
  DEFAULT_BUSINESS_START_MINUTES,
  DEFAULT_MIN_ADVANCE_HOURS,
  generateMstDaySlotStarts,
  getEffectiveEndDate,
  getMstDayBoundsUtc,
  getMstWeekday,
  isAtLeastHoursInAdvance,
  isWithinMstBusinessHours,
  rangesOverlap,
} from '../services/scheduling.service';
import { scheduleAppointmentReminder, cancelAppointmentReminders } from '../services/reminder.service';
import { appointmentLimiter } from '../middleware/rateLimit';
import {
  deleteGoogleCalendarEvent,
  upsertGoogleCalendarEvent,
} from '../services/calendar.service';

const appointmentRouter = express.Router();
const prisma = new PrismaClient();
const CANCELLATION_RESCHEDULE_HOURS = 24;

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

const hasSchedulingConflict = async (
  serviceClientId: string | null,
  startDate: Date,
  endDate: Date,
  excludeAppointmentId?: string
): Promise<boolean> => {
  const where: Prisma.AppointmentWhereInput = {
    states: { not: 'cancelled' },
    id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
    date: { lt: endDate },
    service: serviceClientId ? { clientId: serviceClientId } : undefined,
    OR: [{ endDate: { gt: startDate } }, { endDate: null }],
  };

  const existingAppointments = await prisma.appointment.findMany({
    where,
    include: { service: true },
  });

  return existingAppointments.some((existing) => {
    const existingEnd = getEffectiveEndDate(
      existing.date,
      existing.endDate,
      existing.service.durationMinutes,
      existing.service.bufferMinutes
    );
    return rangesOverlap(existing.date, existingEnd, startDate, endDate);
  });
};

// Create a new appointment
appointmentRouter.post('/', appointmentLimiter, validateAppointment, async (req: Request, res: Response) => {
  try {
    const {
      clientFirstName,
      clientLastName,
      email,
      phone,
      date,
      serviceId,
      paymentMethod,
      paymentStatus,
      tipAmount,
    } = req.body;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { Client: true },
    });

    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    const appointmentDate = new Date(date);
    const appointmentEndDate = getEffectiveEndDate(
      appointmentDate,
      null,
      service.durationMinutes,
      service.bufferMinutes
    );

    if (!isWithinMstBusinessHours(appointmentDate, DEFAULT_BUSINESS_START_MINUTES, DEFAULT_BUSINESS_END_MINUTES)) {
      res.status(400).json({ error: 'Appointments can only be scheduled Monday-Friday between 9:00 AM and 5:00 PM MST' });
      return;
    }

    if (!isAtLeastHoursInAdvance(appointmentDate, DEFAULT_MIN_ADVANCE_HOURS)) {
      res.status(400).json({ error: 'Appointments must be scheduled at least 24 hours in advance' });
      return;
    }

    const conflict = await hasSchedulingConflict(service.clientId ?? null, appointmentDate, appointmentEndDate);
    if (conflict) {
      res.status(409).json({ error: 'Selected time conflicts with an existing appointment' });
      return;
    }

    let appointment = await prisma.appointment.create({
      data: {
        clientFirstName,
        clientLastName,
        email,
        phone,
        date: appointmentDate,
        endDate: appointmentEndDate,
        timezone: BOOKING_TIMEZONE,
        serviceId,
        states: 'pending',
        paymentMethod: paymentMethod ?? null,
        paymentStatus: paymentStatus ?? 'pending',
        tipAmount: tipAmount ?? null,
      },
      include: { service: true },
    });

    const emailHtml = appointmentConfirmationTemplate({
      clientFirstName,
      clientLastName,
      email,
      date: appointmentDate,
      serviceTitle: service.title,
      serviceDescription: service.description,
      appointmentId: appointment.id,
    });
    sendEmail(email, 'Appointment Confirmation', emailHtml).catch((err) => {
      console.error('Failed to send appointment confirmation email:', err);
    });

    try {
      await scheduleAppointmentReminder(appointment.id, appointment.date);
    } catch (err) {
      console.error('Failed to schedule appointment reminder:', err);
    }

    // Sync with Google Calendar when enabled.
    try {
      const calendarEventId = await upsertGoogleCalendarEvent(appointment, service);
      if (calendarEventId && calendarEventId !== appointment.calendarEventId) {
        appointment = await prisma.appointment.update({
          where: { id: appointment.id },
          data: { calendarEventId },
          include: { service: true },
        });
      }
    } catch (err) {
      console.error('Failed to sync appointment to Google Calendar:', err);
    }

    getBusinessOwnerEmailForNotification(service).then((ownerEmail) => {
      if (ownerEmail) {
        const ownerHtml = appointmentNotificationToOwnerTemplate({
          customerFirstName: clientFirstName,
          customerLastName: clientLastName,
          customerEmail: email,
          customerPhone: phone ?? null,
          serviceTitle: service.title,
          date: appointmentDate,
          appointmentId: appointment.id,
        });
        sendEmail(
          ownerEmail,
          `New appointment: ${clientFirstName} ${clientLastName} - ${service.title}`,
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
appointmentRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, serviceId } = req.query;
    const where: Prisma.AppointmentWhereInput = {};

    if (typeof serviceId === 'string' && serviceId.trim()) {
      where.serviceId = serviceId;
    }
    if (typeof dateFrom === 'string' || typeof dateTo === 'string') {
      where.date = {};
      if (typeof dateFrom === 'string') {
        where.date.gte = new Date(dateFrom);
      }
      if (typeof dateTo === 'string') {
        where.date.lte = new Date(dateTo);
      }
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: { service: true },
      orderBy: { date: 'asc' },
    });
    res.json(appointments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get available appointment slots for a specific date in MST
appointmentRouter.get('/available', async (req: Request, res: Response): Promise<void> => {
  try {
    const { serviceId, date } = req.query;
    if (typeof serviceId !== 'string' || !serviceId) {
      res.status(400).json({ error: 'serviceId query parameter is required' });
      return;
    }
    if (typeof date !== 'string' || !date) {
      res.status(400).json({ error: 'date query parameter is required in YYYY-MM-DD format' });
      return;
    }

    const dayBounds = getMstDayBoundsUtc(date);
    if (!dayBounds) {
      res.status(400).json({ error: 'date must be in YYYY-MM-DD format' });
      return;
    }

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { Client: true },
    });
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    const weekday = getMstWeekday(dayBounds.startUtc);
    const clientScopedRules = await prisma.availabilityRule.findMany({
      where: { clientId: service.clientId ?? undefined, weekday, isActive: true },
    });
    const defaultRules = await prisma.availabilityRule.findMany({
      where: { clientId: null, weekday, isActive: true },
    });

    const activeRuleRanges: Array<{ startMinutes: number; endMinutes: number }> =
      clientScopedRules.length > 0
        ? clientScopedRules
        : defaultRules.length > 0
          ? defaultRules
          : [{ startMinutes: DEFAULT_BUSINESS_START_MINUTES, endMinutes: DEFAULT_BUSINESS_END_MINUTES }];

    const exceptions = await prisma.availabilityException.findMany({
      where: {
        clientId: service.clientId ?? undefined,
        isBlocked: true,
        startDateTime: { lt: dayBounds.endUtc },
        endDateTime: { gt: dayBounds.startUtc },
      },
    });

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        states: { not: 'cancelled' },
        service: service.clientId ? { clientId: service.clientId } : undefined,
        date: { lt: dayBounds.endUtc },
        OR: [{ endDate: { gt: dayBounds.startUtc } }, { endDate: null }],
      },
      include: { service: true },
    });

    const potentialSlots = activeRuleRanges.flatMap((rule) =>
      generateMstDaySlotStarts(date, rule.startMinutes, rule.endMinutes, service.durationMinutes)
    );

    const availableSlotDates = potentialSlots.filter((slotStart) => {
      if (!isAtLeastHoursInAdvance(slotStart, DEFAULT_MIN_ADVANCE_HOURS)) {
        return false;
      }
      if (!isWithinMstBusinessHours(slotStart, DEFAULT_BUSINESS_START_MINUTES, DEFAULT_BUSINESS_END_MINUTES)) {
        return false;
      }

      const slotEnd = getEffectiveEndDate(slotStart, null, service.durationMinutes, service.bufferMinutes);
      const blockedByException = exceptions.some((exception) =>
        rangesOverlap(slotStart, slotEnd, exception.startDateTime, exception.endDateTime)
      );
      if (blockedByException) {
        return false;
      }

      const overlapsExisting = existingAppointments.some((existing) => {
        const existingEnd = getEffectiveEndDate(
          existing.date,
          existing.endDate,
          existing.service.durationMinutes,
          existing.service.bufferMinutes
        );
        return rangesOverlap(slotStart, slotEnd, existing.date, existingEnd);
      });
      return !overlapsExisting;
    });

    res.json({
      date,
      timezone: BOOKING_TIMEZONE,
      serviceId,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      slots: availableSlotDates.map((slot) => slot.toISOString()),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get a specific appointment
appointmentRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { service: true },
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
    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { service: { include: { Client: true } } },
    });

    if (!existingAppointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    const { clientFirstName, clientLastName, email, phone, date, paymentMethod, paymentStatus, tipAmount } = req.body;
    const oldDate = existingAppointment.date;
    const newDate = date ? new Date(date) : undefined;
    const dateChanged = !!newDate && newDate.getTime() !== oldDate.getTime();
    const effectiveDate = newDate ?? existingAppointment.date;

    if (dateChanged && !isAtLeastHoursInAdvance(existingAppointment.date, CANCELLATION_RESCHEDULE_HOURS)) {
      res.status(400).json({
        error: 'Appointments must be rescheduled at least 24 hours in advance to avoid forfeiting advance payment',
      });
      return;
    }

    if (!isWithinMstBusinessHours(effectiveDate, DEFAULT_BUSINESS_START_MINUTES, DEFAULT_BUSINESS_END_MINUTES)) {
      res.status(400).json({ error: 'Appointments can only be scheduled Monday-Friday between 9:00 AM and 5:00 PM MST' });
      return;
    }

    const nextEndDate = getEffectiveEndDate(
      effectiveDate,
      null,
      existingAppointment.service.durationMinutes,
      existingAppointment.service.bufferMinutes
    );

    if (dateChanged) {
      const conflict = await hasSchedulingConflict(
        existingAppointment.service.clientId ?? null,
        effectiveDate,
        nextEndDate,
        existingAppointment.id
      );
      if (conflict) {
        res.status(409).json({ error: 'Selected time conflicts with an existing appointment' });
        return;
      }
    }

    let appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        clientFirstName,
        clientLastName,
        email,
        phone,
        date: newDate,
        endDate: dateChanged ? nextEndDate : existingAppointment.endDate,
        timezone: BOOKING_TIMEZONE,
        paymentMethod,
        paymentStatus,
        tipAmount,
        rescheduledAt: dateChanged ? new Date() : existingAppointment.rescheduledAt,
      },
      include: { service: true },
    });

    if (dateChanged && appointment.service) {
      const emailHtml = appointmentRescheduleTemplate({
        clientFirstName: appointment.clientFirstName,
        clientLastName: appointment.clientLastName,
        email: appointment.email,
        date: appointment.date,
        oldDate,
        serviceTitle: appointment.service.title,
        serviceDescription: appointment.service.description,
        appointmentId: appointment.id,
      });
      sendEmail(appointment.email, 'Appointment Rescheduled', emailHtml).catch((err) => {
        console.error('Failed to send reschedule email:', err);
      });

      getBusinessOwnerEmailForNotification(existingAppointment.service).then((ownerEmail) => {
        if (ownerEmail) {
          const ownerHtml = appointmentRescheduleNotificationToOwnerTemplate({
            customerFirstName: appointment.clientFirstName,
            customerLastName: appointment.clientLastName,
            customerEmail: appointment.email,
            customerPhone: appointment.phone ?? null,
            serviceTitle: appointment.service.title,
            date: appointment.date,
            oldDate,
            appointmentId: appointment.id,
          });
          sendEmail(
            ownerEmail,
            `Appointment rescheduled: ${appointment.clientFirstName} ${appointment.clientLastName} - ${appointment.service.title}`,
            ownerHtml
          ).catch((err) => {
            console.error('Failed to send reschedule notification to business owner:', err);
          });
        }
      }).catch((err) => {
        console.error('Error getting business owner email for reschedule notification:', err);
      });

      try {
        await scheduleAppointmentReminder(appointment.id, appointment.date);
      } catch (err) {
        console.error('Failed to reschedule appointment reminder:', err);
      }
    }

    if (appointment.service && appointment.states !== 'cancelled') {
      try {
        const calendarEventId = await upsertGoogleCalendarEvent(appointment, appointment.service);
        if (calendarEventId && calendarEventId !== appointment.calendarEventId) {
          appointment = await prisma.appointment.update({
            where: { id: appointment.id },
            data: { calendarEventId },
            include: { service: true },
          });
        }
      } catch (err) {
        console.error('Failed to sync updated appointment to Google Calendar:', err);
      }
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
        states: 'confirmed',
        paymentStatus: 'paid',
      },
      include: { service: true },
    });

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
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { service: { include: { Client: true } } },
    });

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    if (!isAtLeastHoursInAdvance(appointment.date, CANCELLATION_RESCHEDULE_HOURS)) {
      res.status(400).json({
        error: 'Appointments must be cancelled at least 24 hours in advance to avoid forfeiting advance payment',
      });
      return;
    }

    await cancelAppointmentReminders(appointment.id);
    if (appointment.calendarEventId) {
      try {
        await deleteGoogleCalendarEvent(appointment.calendarEventId);
      } catch (err) {
        console.error('Failed to delete appointment from Google Calendar:', err);
      }
    }
    await prisma.appointment.delete({ where: { id: req.params.id } });

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
            `Appointment cancelled: ${appointment.clientFirstName} ${appointment.clientLastName} - ${appointment.service.title}`,
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