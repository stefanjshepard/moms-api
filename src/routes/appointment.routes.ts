import express, { Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import crypto from 'crypto';
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
  appointmentAcceptedTemplate,
  appointmentDeniedTemplate,
  appointmentDecisionPageHtml,
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
import { syncFlyerGoogleCalendarSafe } from './flyer.routes';
import { adminAuth } from '../middleware/auth';
import {
  CHECKOUT_TOKEN_TTL_SECONDS,
  DECISION_TOKEN_TTL_SECONDS,
  createBookingAccessToken,
  verifyBookingAccessToken,
} from '../services/booking-token.service';
import { captchaIfConfigured } from '../middleware/captcha';
import { hasSchedulingConflict, isInquireOnlyService } from '../services/scheduling-conflict.service';
import { getAppointmentDecisionUrl, getBookingPayUrl } from '../services/urls.service';

const appointmentRouter = express.Router();
const prisma = new PrismaClient();
const CANCELLATION_RESCHEDULE_HOURS = 24;
const hasValidServerPaymentConfirmationAuth = (req: Request): boolean => {
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.PAYMENT_CONFIRMATION_ENFORCE_IN_TEST !== 'true'
  ) {
    return true;
  }

  const adminHeader = req.headers['x-admin-key'];
  const providedAdminKey = typeof adminHeader === 'string' ? adminHeader : undefined;
  const expectedAdminKey = process.env.ADMIN_KEY;
  if (providedAdminKey && expectedAdminKey) {
    const providedBuffer = Buffer.from(providedAdminKey);
    const expectedBuffer = Buffer.from(expectedAdminKey);
    if (
      providedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      return true;
    }
  }

  const webhookHeader = req.headers['x-payment-confirmation-secret'];
  const providedWebhookSecret = typeof webhookHeader === 'string' ? webhookHeader : undefined;
  const expectedWebhookSecret = process.env.PAYMENT_CONFIRMATION_SECRET;
  if (!expectedWebhookSecret || !providedWebhookSecret) {
    return false;
  }

  const providedWebhookBuffer = Buffer.from(providedWebhookSecret);
  const expectedWebhookBuffer = Buffer.from(expectedWebhookSecret);
  if (providedWebhookBuffer.length !== expectedWebhookBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedWebhookBuffer, expectedWebhookBuffer);
};


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

const wantsJson = (req: Request): boolean => {
  if (typeof req.query.format === 'string' && req.query.format.toLowerCase() === 'json') {
    return true;
  }
  return req.accepts(['html', 'json']) === 'json';
};

const sendDecisionResponse = (
  req: Request,
  res: Response,
  status: number,
  page: { title: string; body: string; ok: boolean; calendarNote?: string },
  extra?: Record<string, unknown>
): void => {
  if (wantsJson(req)) {
    res.status(status).json({
      title: page.title,
      message: page.body,
      ok: page.ok,
      ...extra,
    });
    return;
  }
  res.status(status).type('html').send(appointmentDecisionPageHtml(page));
};

// Create a new appointment
appointmentRouter.post('/', appointmentLimiter, captchaIfConfigured, validateAppointment, async (req: Request, res: Response) => {
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

    if (isInquireOnlyService(service)) {
      res.status(400).json({
        error: 'This offering is inquire-only. Please use the contact form or the current circle flyer.',
      });
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

    let appointment;
    try {
      appointment = await prisma.$transaction(
        async (tx) => {
          const conflict = await hasSchedulingConflict(
            tx,
            service.clientId ?? null,
            appointmentDate,
            appointmentEndDate,
            { incomingKind: 'session' }
          );
          if (conflict) {
            const conflictError = new Error('SCHEDULING_CONFLICT');
            conflictError.name = 'SchedulingConflictError';
            throw conflictError;
          }

          return tx.appointment.create({
            data: {
              clientFirstName,
              clientLastName,
              email,
              phone,
              date: appointmentDate,
              endDate: appointmentEndDate,
              timezone: BOOKING_TIMEZONE,
              serviceId,
              kind: 'session',
              states: 'pending',
              paymentMethod: paymentMethod ?? null,
              paymentStatus: paymentStatus ?? 'pending',
              tipAmount: tipAmount ?? null,
            },
            include: { service: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      const prismaError = error as { code?: string; name?: string };
      if (
        prismaError.name === 'SchedulingConflictError' ||
        prismaError.code === 'P2034'
      ) {
        res.status(409).json({ error: 'Selected time conflicts with an existing appointment' });
        return;
      }
      throw error;
    }

    const emailHtml = appointmentConfirmationTemplate({
      clientFirstName,
      clientLastName,
      email,
      date: appointmentDate,
      serviceTitle: service.title,
      serviceDescription: service.description,
      appointmentId: appointment.id,
    });
    sendEmail(email, 'We received your appointment request', emailHtml).catch((err) => {
      console.error('Failed to send appointment confirmation email:', err);
    });

    getBusinessOwnerEmailForNotification(service).then((ownerEmail) => {
      if (ownerEmail) {
        let acceptUrl: string | null = null;
        let denyUrl: string | null = null;
        try {
          const decisionToken = createBookingAccessToken({
            appointmentId: appointment.id,
            email: appointment.email,
            purpose: 'decision',
            ttlSeconds: DECISION_TOKEN_TTL_SECONDS,
          });
          acceptUrl = getAppointmentDecisionUrl(appointment.id, 'accept', decisionToken);
          denyUrl = getAppointmentDecisionUrl(appointment.id, 'deny', decisionToken);
        } catch (tokenError) {
          console.error('Unable to create booking decision links:', tokenError);
        }

        const ownerHtml = appointmentNotificationToOwnerTemplate({
          customerFirstName: clientFirstName,
          customerLastName: clientLastName,
          customerEmail: email,
          customerPhone: phone ?? null,
          serviceTitle: service.title,
          date: appointmentDate,
          appointmentId: appointment.id,
          acceptUrl,
          denyUrl,
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
appointmentRouter.get('/', adminAuth, async (req: Request, res: Response) => {
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

    if (isInquireOnlyService(service)) {
      res.status(400).json({
        error: 'This offering is inquire-only. Please use the contact form or the current circle flyer.',
      });
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

appointmentRouter.get('/:id/decision', async (req: Request, res: Response): Promise<void> => {
  try {
    const appointmentId = req.params.id;
    const action = typeof req.query.action === 'string' ? req.query.action.toLowerCase() : '';
    const token = typeof req.query.token === 'string' ? req.query.token : '';

    if (action !== 'accept' && action !== 'deny') {
      sendDecisionResponse(req, res, 400, {
        title: 'Invalid decision',
        body: 'Use Accept or Deny from the booking email.',
        ok: false,
      });
      return;
    }
    if (!token) {
      sendDecisionResponse(req, res, 400, {
        title: 'Missing link',
        body: 'This decision link is incomplete. Open Accept or Deny from the original email.',
        ok: false,
      });
      return;
    }

    const tokenValidation = verifyBookingAccessToken(token, {
      expectedAppointmentId: appointmentId,
      expectedPurpose: 'decision',
    });
    if (!tokenValidation.valid) {
      sendDecisionResponse(req, res, 401, {
        title: 'Link expired',
        body: 'This Accept/Deny link is invalid or has expired. Ask for a new booking email if you still need to decide.',
        ok: false,
      });
      return;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true },
    });
    if (!appointment || !appointment.service) {
      sendDecisionResponse(req, res, 404, {
        title: 'Booking not found',
        body: 'That appointment is no longer in the system.',
        ok: false,
      });
      return;
    }

    if (appointment.kind === 'circle') {
      sendDecisionResponse(req, res, 400, {
        title: 'Circle registrations',
        body: 'Circle seats are reserved from the flyer and paid in person at the event.',
        ok: false,
      });
      return;
    }

    if (action === 'accept') {
      if (appointment.states === 'cancelled') {
        sendDecisionResponse(req, res, 409, {
          title: 'Already denied',
          body: 'This booking was denied. The time is free for someone else.',
          ok: false,
        });
        return;
      }

      let nextAppointment = appointment;
      if (appointment.states !== 'confirmed') {
        nextAppointment = await prisma.appointment.update({
          where: { id: appointment.id },
          data: { states: 'confirmed' },
          include: { service: true },
        });
      }

      let calendarSynced = false;
      let calendarNote = 'Google Calendar could not be updated. Connect Google Calendar OAuth on the API, then accept again or resave this booking.';
      try {
        const calendarEventId = await upsertGoogleCalendarEvent(nextAppointment, nextAppointment.service);
        if (calendarEventId) {
          calendarSynced = true;
          calendarNote = 'Google Calendar now has this session, including the customer name and service.';
          if (calendarEventId !== nextAppointment.calendarEventId) {
            nextAppointment = await prisma.appointment.update({
              where: { id: nextAppointment.id },
              data: { calendarEventId },
              include: { service: true },
            });
          }
        }
      } catch (err) {
        console.error('Failed to sync accepted appointment to Google Calendar:', err);
      }

      try {
        await scheduleAppointmentReminder(nextAppointment.id, nextAppointment.date);
      } catch (err) {
        console.error('Failed to schedule appointment reminder:', err);
      }

      let paymentToken: string | null = null;
      let payUrl: string | null = null;
      try {
        paymentToken = createBookingAccessToken({
          appointmentId: nextAppointment.id,
          email: nextAppointment.email,
          purpose: 'checkout',
          ttlSeconds: CHECKOUT_TOKEN_TTL_SECONDS,
        });
        payUrl = getBookingPayUrl(nextAppointment.id, paymentToken);
      } catch (tokenError) {
        console.error('Unable to create payment token after accept:', tokenError);
      }

      const emailHtml = appointmentAcceptedTemplate({
        clientFirstName: nextAppointment.clientFirstName,
        clientLastName: nextAppointment.clientLastName,
        email: nextAppointment.email,
        date: nextAppointment.date,
        serviceTitle: nextAppointment.service.title,
        appointmentId: nextAppointment.id,
        payUrl,
      });
      sendEmail(nextAppointment.email, 'Your session is accepted — complete payment', emailHtml).catch((err) => {
        console.error('Failed to send appointment accepted email:', err);
      });

      sendDecisionResponse(
        req,
        res,
        200,
        {
          title: 'Booking accepted',
          body: `${nextAppointment.clientFirstName} ${nextAppointment.clientLastName} is confirmed for ${nextAppointment.service.title}. They were emailed a payment link.`,
          ok: true,
          calendarNote,
        },
        {
          id: nextAppointment.id,
          states: nextAppointment.states,
          calendarEventId: nextAppointment.calendarEventId,
          calendarSynced,
          paymentToken,
        }
      );
      return;
    }

    if (appointment.states === 'cancelled') {
      sendDecisionResponse(req, res, 200, {
        title: 'Already denied',
        body: 'This booking was already denied. The time is available again.',
        ok: true,
      });
      return;
    }

    if (appointment.states === 'confirmed' && appointment.paymentStatus === 'paid') {
      sendDecisionResponse(req, res, 409, {
        title: 'Already paid',
        body: 'This booking is already paid. Cancel it from the usual cancellation flow if needed.',
        ok: false,
      });
      return;
    }

    await cancelAppointmentReminders(appointment.id);
    if (appointment.calendarEventId) {
      try {
        await deleteGoogleCalendarEvent(appointment.calendarEventId);
      } catch (err) {
        console.error('Failed to delete denied appointment from Google Calendar:', err);
      }
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        states: 'cancelled',
        cancelledAt: new Date(),
        calendarEventId: null,
      },
    });

    const denyHtml = appointmentDeniedTemplate({
      clientFirstName: appointment.clientFirstName,
      clientLastName: appointment.clientLastName,
      email: appointment.email,
      date: appointment.date,
      serviceTitle: appointment.service.title,
      appointmentId: appointment.id,
    });
    sendEmail(appointment.email, 'This requested time is not available', denyHtml).catch((err) => {
      console.error('Failed to send appointment denied email:', err);
    });

    sendDecisionResponse(req, res, 200, {
      title: 'Booking denied',
      body: 'This request was declined. The time is free for another client, and the customer was emailed.',
      ok: true,
    });
  } catch (error) {
    console.error(error);
    sendDecisionResponse(req, res, 500, {
      title: 'Something went wrong',
      body: 'The decision could not be saved. Try the email link again, or check the API logs.',
      ok: false,
    });
  }
});

// Get a specific appointment
appointmentRouter.get('/:id', adminAuth, async (req: Request, res: Response): Promise<void> => {
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
appointmentRouter.put('/:id', adminAuth, validateAppointmentUpdate, async (req: Request, res: Response): Promise<void> => {
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
        prisma,
        existingAppointment.service.clientId ?? null,
        effectiveDate,
        nextEndDate,
        { excludeAppointmentId: existingAppointment.id, incomingKind: existingAppointment.kind || 'session' }
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

    if (appointment.service && appointment.states === 'confirmed') {
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
    if (!hasValidServerPaymentConfirmationAuth(req)) {
      res.status(401).json({ error: 'Unauthorized payment confirmation source' });
      return;
    }

    const { paymentStatus } = req.body;
    if (paymentStatus !== 'completed') {
      res.status(400).json({ error: 'Invalid payment status' });
      return;
    }

    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { service: true },
    });
    if (!existingAppointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    const alreadyConfirmedAndPaid =
      existingAppointment.states === 'confirmed' && existingAppointment.paymentStatus === 'paid';

    if (alreadyConfirmedAndPaid) {
      res.json(existingAppointment);
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
appointmentRouter.delete('/:id', adminAuth, async (req: Request, res: Response) => {
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
    const isCircleSeat = appointment.kind === 'circle' && Boolean(appointment.circleFlyerId);
    if (appointment.calendarEventId && !isCircleSeat) {
      try {
        await deleteGoogleCalendarEvent(appointment.calendarEventId);
      } catch (err) {
        console.error('Failed to delete appointment from Google Calendar:', err);
      }
    }
    await prisma.appointment.delete({ where: { id: req.params.id } });
    if (appointment.circleFlyerId) {
      await syncFlyerGoogleCalendarSafe(appointment.circleFlyerId);
    }

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