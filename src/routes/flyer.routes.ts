import express, { Request, Response } from 'express';
import Joi from 'joi';
import { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { appointmentLimiter } from '../middleware/rateLimit';
import { captchaIfConfigured } from '../middleware/captcha';
import { sendEmail } from '../services/email.service';
import {
  circleRegistrationToCustomerTemplate,
  circleRegistrationToOwnerTemplate,
} from '../services/email.templates';
import { hasSchedulingConflict } from '../services/scheduling-conflict.service';
import { BOOKING_TIMEZONE } from '../services/scheduling.service';
import {
  buildCircleFlyerCalendarPayload,
  deleteGoogleCalendarEvent,
  upsertGoogleCalendarEventPayload,
} from '../services/calendar.service';

const flyerRouter = express.Router();
const prisma = new PrismaClient();

const isAdminMount = (req: Request): boolean => req.baseUrl.includes('/admin');

const flyerWriteSchema = Joi.object({
  title: Joi.string().min(3).max(120).required(),
  body: Joi.string().min(10).max(2000).required(),
  eventStart: Joi.date().required(),
  eventEnd: Joi.date().required(),
  price: Joi.number().min(0).required(),
  serviceId: Joi.string().uuid().optional(),
  isPublished: Joi.boolean().default(true),
});

const flyerPatchSchema = Joi.object({
  title: Joi.string().min(3).max(120),
  body: Joi.string().min(10).max(2000),
  eventStart: Joi.date(),
  eventEnd: Joi.date(),
  price: Joi.number().min(0),
  serviceId: Joi.string().uuid().allow(null),
  isPublished: Joi.boolean(),
}).min(1);

const registerSchema = Joi.object({
  clientFirstName: Joi.string().min(2).max(50).required(),
  clientLastName: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  phone: Joi.string()
    .pattern(/^\+?1?\d{9,15}$/)
    .required(),
});

async function getBusinessOwnerEmail(service: { Client?: { email: string } | null }): Promise<string | null> {
  if (service.Client?.email) {
    return service.Client.email;
  }
  if (process.env.BUSINESS_OWNER_EMAIL) {
    return process.env.BUSINESS_OWNER_EMAIL;
  }
  const client = await prisma.client.findFirst();
  return client?.email ?? null;
}

async function unpublishOtherFlyers(exceptId?: string): Promise<void> {
  const others = await prisma.circleFlyer.findMany({
    where: {
      isPublished: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    include: { service: true },
  });
  for (const flyer of others) {
    await prisma.circleFlyer.update({
      where: { id: flyer.id },
      data: { isPublished: false },
    });
    await syncFlyerException({
      flyerId: flyer.id,
      clientId: flyer.service?.clientId ?? null,
      eventStart: flyer.eventStart,
      eventEnd: flyer.eventEnd,
      isPublished: false,
      existingExceptionId: flyer.availabilityExceptionId,
    });
    await syncFlyerGoogleCalendarSafe(flyer.id);
  }
}

async function resolveCircleServiceId(explicitId?: string): Promise<string | null> {
  if (explicitId) {
    const service = await prisma.service.findUnique({ where: { id: explicitId } });
    return service?.id ?? null;
  }
  const inquire = await prisma.service.findFirst({
    where: { bookingMode: 'inquire', isPublished: true },
    orderBy: { title: 'asc' },
  });
  if (inquire) {
    return inquire.id;
  }
  const byTitle = await prisma.service.findFirst({
    where: { isPublished: true, title: { contains: 'Circle', mode: 'insensitive' } },
  });
  return byTitle?.id ?? null;
}

async function syncFlyerException(params: {
  flyerId: string;
  clientId: string | null;
  eventStart: Date;
  eventEnd: Date;
  isPublished: boolean;
  existingExceptionId: string | null;
}): Promise<string | null> {
  if (!params.isPublished) {
    if (params.existingExceptionId) {
      await prisma.availabilityException.deleteMany({ where: { id: params.existingExceptionId } });
    }
    await prisma.circleFlyer.update({
      where: { id: params.flyerId },
      data: { availabilityExceptionId: null },
    });
    return null;
  }

  if (params.existingExceptionId) {
    await prisma.availabilityException.update({
      where: { id: params.existingExceptionId },
      data: {
        startDateTime: params.eventStart,
        endDateTime: params.eventEnd,
        isBlocked: true,
        reason: 'Sistership Circle flyer',
      },
    });
    return params.existingExceptionId;
  }

  const created = await prisma.availabilityException.create({
    data: {
      startDateTime: params.eventStart,
      endDateTime: params.eventEnd,
      isBlocked: true,
      reason: 'Sistership Circle flyer',
      clientId: params.clientId,
    },
  });
  await prisma.circleFlyer.update({
    where: { id: params.flyerId },
    data: { availabilityExceptionId: created.id },
  });
  return created.id;
}

async function syncFlyerGoogleCalendar(flyerId: string): Promise<void> {
  const flyer = await prisma.circleFlyer.findUnique({ where: { id: flyerId } });
  if (!flyer) {
    return;
  }

  const attendees = await prisma.appointment.findMany({
    where: {
      circleFlyerId: flyer.id,
      kind: 'circle',
      states: { not: 'cancelled' },
    },
    orderBy: [{ clientLastName: 'asc' }, { clientFirstName: 'asc' }],
    select: {
      clientFirstName: true,
      clientLastName: true,
      email: true,
      phone: true,
    },
  });

  if (!flyer.isPublished && attendees.length === 0) {
    if (flyer.calendarEventId) {
      await deleteGoogleCalendarEvent(flyer.calendarEventId);
      await prisma.circleFlyer.update({
        where: { id: flyer.id },
        data: { calendarEventId: null },
      });
    }
    return;
  }

  const eventId = await upsertGoogleCalendarEventPayload(
    flyer.calendarEventId,
    buildCircleFlyerCalendarPayload({
      title: flyer.title,
      body: flyer.body,
      eventStart: flyer.eventStart,
      eventEnd: flyer.eventEnd,
      attendees,
    })
  );
  if (eventId && eventId !== flyer.calendarEventId) {
    await prisma.circleFlyer.update({
      where: { id: flyer.id },
      data: { calendarEventId: eventId },
    });
  }
}

export async function syncFlyerGoogleCalendarSafe(flyerId: string): Promise<void> {
  try {
    await syncFlyerGoogleCalendar(flyerId);
  } catch (error) {
    console.error('Failed to sync circle flyer to Google Calendar:', error);
  }
}

flyerRouter.get('/current', async (_req: Request, res: Response): Promise<void> => {
  try {
    const flyer = await prisma.circleFlyer.findFirst({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
      include: { service: true },
    });
    res.json(flyer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch current flyer' });
  }
});

flyerRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  if (!isAdminMount(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  try {
    const flyers = await prisma.circleFlyer.findMany({
      orderBy: { createdAt: 'desc' },
      include: { service: true },
    });
    res.json(flyers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch flyers' });
  }
});

flyerRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  if (!isAdminMount(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  try {
    const { error, value } = flyerWriteSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ error: error.details.map((detail) => detail.message).join(', ') });
      return;
    }
    const eventStart = new Date(value.eventStart);
    const eventEnd = new Date(value.eventEnd);
    if (!(eventEnd.getTime() > eventStart.getTime())) {
      res.status(400).json({ error: 'eventEnd must be after eventStart' });
      return;
    }

    const serviceId = await resolveCircleServiceId(value.serviceId);
    if (!serviceId) {
      res.status(400).json({ error: 'No inquire/circle service exists to attach this flyer to.' });
      return;
    }
    const service = await prisma.service.findUnique({ where: { id: serviceId } });

    if (value.isPublished) {
      await unpublishOtherFlyers();
    }

    const flyer = await prisma.circleFlyer.create({
      data: {
        title: value.title,
        body: value.body,
        eventStart,
        eventEnd,
        price: value.price,
        serviceId,
        isPublished: value.isPublished,
      },
      include: { service: true },
    });

    await syncFlyerException({
      flyerId: flyer.id,
      clientId: service?.clientId ?? null,
      eventStart,
      eventEnd,
      isPublished: value.isPublished,
      existingExceptionId: null,
    });

    await syncFlyerGoogleCalendarSafe(flyer.id);

    const saved = await prisma.circleFlyer.findUnique({
      where: { id: flyer.id },
      include: { service: true },
    });
    res.status(201).json(saved);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create flyer' });
  }
});

flyerRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  if (!isAdminMount(req)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  try {
    const { error, value } = flyerPatchSchema.validate(req.body, { abortEarly: false });
    if (error) {
      res.status(400).json({ error: error.details.map((detail) => detail.message).join(', ') });
      return;
    }

    const existing = await prisma.circleFlyer.findUnique({
      where: { id: req.params.id },
      include: { service: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Flyer not found' });
      return;
    }

    const eventStart = value.eventStart ? new Date(value.eventStart) : existing.eventStart;
    const eventEnd = value.eventEnd ? new Date(value.eventEnd) : existing.eventEnd;
    if (!(eventEnd.getTime() > eventStart.getTime())) {
      res.status(400).json({ error: 'eventEnd must be after eventStart' });
      return;
    }

    const isPublished = value.isPublished ?? existing.isPublished;
    if (isPublished) {
      await unpublishOtherFlyers(existing.id);
    }

    await prisma.circleFlyer.update({
      where: { id: existing.id },
      data: {
        title: value.title,
        body: value.body,
        eventStart,
        eventEnd,
        price: value.price,
        serviceId: value.serviceId === undefined ? existing.serviceId : value.serviceId,
        isPublished,
      },
    });

    await prisma.appointment.updateMany({
      where: { circleFlyerId: existing.id, kind: 'circle', states: { not: 'cancelled' } },
      data: { date: eventStart, endDate: eventEnd },
    });

    await syncFlyerException({
      flyerId: existing.id,
      clientId: existing.service?.clientId ?? null,
      eventStart,
      eventEnd,
      isPublished,
      existingExceptionId: existing.availabilityExceptionId,
    });

    await syncFlyerGoogleCalendarSafe(existing.id);

    const saved = await prisma.circleFlyer.findUnique({
      where: { id: existing.id },
      include: { service: true },
    });
    res.json(saved);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update flyer' });
  }
});

flyerRouter.post(
  '/:id/register',
  appointmentLimiter,
  captchaIfConfigured,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
      if (error) {
        res.status(400).json({ error: error.details.map((detail) => detail.message).join(', ') });
        return;
      }

      const flyer = await prisma.circleFlyer.findUnique({
        where: { id: req.params.id },
        include: { service: { include: { Client: true } } },
      });
      if (!flyer || !flyer.isPublished || !flyer.service) {
        res.status(404).json({ error: 'No published circle flyer found' });
        return;
      }

      let appointment;
      try {
        appointment = await prisma.$transaction(
          async (tx) => {
            const conflict = await hasSchedulingConflict(
              tx,
              flyer.service?.clientId ?? null,
              flyer.eventStart,
              flyer.eventEnd,
              { incomingKind: 'circle' }
            );
            if (conflict) {
              const conflictError = new Error('SCHEDULING_CONFLICT');
              conflictError.name = 'SchedulingConflictError';
              throw conflictError;
            }

            return tx.appointment.create({
              data: {
                clientFirstName: value.clientFirstName,
                clientLastName: value.clientLastName,
                email: value.email,
                phone: value.phone,
                date: flyer.eventStart,
                endDate: flyer.eventEnd,
                timezone: BOOKING_TIMEZONE,
                serviceId: flyer.serviceId as string,
                kind: 'circle',
                circleFlyerId: flyer.id,
                quotedAmount: flyer.price,
                states: 'confirmed',
                paymentStatus: 'pending',
                paymentMethod: 'in_person',
              },
              include: { service: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (createError) {
        const prismaError = createError as { code?: string; name?: string };
        if (prismaError.name === 'SchedulingConflictError' || prismaError.code === 'P2034') {
          res.status(409).json({
            error: 'This circle time overlaps a private session. Please inquire by email instead.',
          });
          return;
        }
        throw createError;
      }

      await syncFlyerGoogleCalendarSafe(flyer.id);

      sendEmail(
        appointment.email,
        `Circle registration: ${flyer.title}`,
        circleRegistrationToCustomerTemplate({
          clientFirstName: appointment.clientFirstName,
          clientLastName: appointment.clientLastName,
          email: appointment.email,
          date: appointment.date,
          serviceTitle: flyer.title,
          appointmentId: appointment.id,
        })
      ).catch((err) => {
        console.error('Failed to send circle registration email:', err);
      });

      getBusinessOwnerEmail(flyer.service).then((ownerEmail) => {
        if (!ownerEmail) {
          return;
        }
        sendEmail(
          ownerEmail,
          `Circle seat: ${appointment.clientFirstName} ${appointment.clientLastName} - ${flyer.title}`,
          circleRegistrationToOwnerTemplate({
            customerFirstName: appointment.clientFirstName,
            customerLastName: appointment.clientLastName,
            customerEmail: appointment.email,
            customerPhone: appointment.phone,
            serviceTitle: flyer.title,
            date: appointment.date,
            appointmentId: appointment.id,
          })
        ).catch((err) => {
          console.error('Failed to send circle owner email:', err);
        });
      }).catch((err) => {
        console.error('Error getting owner email for circle registration:', err);
      });

      res.status(201).json(appointment);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to register for this circle' });
    }
  }
);

export default flyerRouter;
