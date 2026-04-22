import { Appointment, Service } from '@prisma/client';
import { BOOKING_TIMEZONE_GOOGLE } from './scheduling.service';

export interface CalendarEventPayload {
  summary: string;
  description: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
}

export const buildGoogleCalendarEventPayload = (
  appointment: Appointment,
  service: Service
): CalendarEventPayload => {
  const customerName = `${appointment.clientFirstName} ${appointment.clientLastName}`.trim();
  const description = [
    `Service: ${service.title}`,
    `Client: ${customerName}`,
    `Email: ${appointment.email}`,
    `Phone: ${appointment.phone || 'Not provided'}`,
    `Appointment ID: ${appointment.id}`,
  ].join('\n');

  return {
    summary: `${service.title} - ${customerName}`,
    description,
    start: {
      dateTime: appointment.date.toISOString(),
      timeZone: BOOKING_TIMEZONE_GOOGLE,
    },
    end: {
      dateTime: (appointment.endDate ?? appointment.date).toISOString(),
      timeZone: BOOKING_TIMEZONE_GOOGLE,
    },
  };
};
