import { Prisma, PrismaClient } from '@prisma/client';
import { getEffectiveEndDate, rangesOverlap } from './scheduling.service';

type SchedulingDb = PrismaClient | Prisma.TransactionClient;

export const isInquireOnlyService = (service: { bookingMode?: string | null; title?: string }): boolean => {
  if (service.bookingMode === 'inquire') {
    return true;
  }
  if (service.bookingMode === 'appointment') {
    return false;
  }
  return /sistership|circle/i.test(service.title ?? '');
};

export const hasSchedulingConflict = async (
  db: SchedulingDb,
  serviceClientId: string | null,
  startDate: Date,
  endDate: Date,
  options?: {
    excludeAppointmentId?: string;
    incomingKind?: string;
  }
): Promise<boolean> => {
  const incomingKind = options?.incomingKind ?? 'session';

  if (incomingKind !== 'circle') {
    const exceptions = await db.availabilityException.findMany({
      where: {
        isBlocked: true,
        startDateTime: { lt: endDate },
        endDateTime: { gt: startDate },
        ...(serviceClientId ? { clientId: serviceClientId } : {}),
      },
    });
    const blockedByException = exceptions.some((exception) =>
      rangesOverlap(startDate, endDate, exception.startDateTime, exception.endDateTime)
    );
    if (blockedByException) {
      return true;
    }
  }

  const where: Prisma.AppointmentWhereInput = {
    states: { not: 'cancelled' },
    id: options?.excludeAppointmentId ? { not: options.excludeAppointmentId } : undefined,
    date: { lt: endDate },
    service: serviceClientId ? { clientId: serviceClientId } : undefined,
    OR: [{ endDate: { gt: startDate } }, { endDate: null }],
  };

  const existingAppointments = await db.appointment.findMany({
    where,
    include: { service: true },
  });

  return existingAppointments.some((existing) => {
    const existingKind = existing.kind || 'session';
    if (incomingKind === 'circle' && existingKind === 'circle') {
      return false;
    }
    const existingEnd = getEffectiveEndDate(
      existing.date,
      existing.endDate,
      existing.service.durationMinutes,
      existing.service.bufferMinutes
    );
    return rangesOverlap(existing.date, existingEnd, startDate, endDate);
  });
};
