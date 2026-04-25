import { Appointment, Service } from '@prisma/client';
import { google, calendar_v3 } from 'googleapis';
import { BOOKING_TIMEZONE_GOOGLE } from './scheduling.service';
import { getAccessTokenForProvider } from './oauth/oauth.service';

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

const DEFAULT_CALENDAR_ID = 'primary';
let hasWarnedMissingCalendarAuth = false;

const getConfiguredCalendarId = (): string =>
  process.env.GOOGLE_CALENDAR_ID?.trim() || DEFAULT_CALENDAR_ID;

const isCalendarSyncEnabled = (): boolean => process.env.GOOGLE_CALENDAR_SYNC_ENABLED === 'true';
const canFallbackToServiceAccount = (): boolean =>
  process.env.GOOGLE_CALENDAR_ALLOW_SERVICE_ACCOUNT_FALLBACK === 'true';

const getGoogleCalendarAuthMode = (): 'oauth' | 'service_account' => {
  const mode = process.env.GOOGLE_CALENDAR_AUTH_MODE;
  return mode === 'service_account' ? 'service_account' : 'oauth';
};

const getServiceAccountCredentials = (): { client_email: string; private_key: string } | null => {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (encoded) {
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      if (parsed?.client_email && parsed?.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
        };
      }
    } catch (error) {
      console.error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON_BASE64:', error);
      return null;
    }
  }

  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed?.client_email && parsed?.private_key) {
        return {
          client_email: parsed.client_email,
          private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
        };
      }
    } catch (error) {
      console.error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON:', error);
      return null;
    }
  }

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    return {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  return null;
};

const getServiceAccountCalendarClient = (): calendar_v3.Calendar | null => {
  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
};

const getOAuthCalendarClient = async (): Promise<calendar_v3.Calendar | null> => {
  let accessToken: string | null = null;
  try {
    accessToken = await getAccessTokenForProvider('google_calendar');
  } catch (error: any) {
    if (error?.code !== 'P2021') {
      throw error;
    }
    // Older DB/test snapshots may not yet include oauth tables.
    return null;
  }
  if (!accessToken) {
    return null;
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth });
};

const getCalendarClient = async (): Promise<calendar_v3.Calendar | null> => {
  if (!isCalendarSyncEnabled()) {
    return null;
  }

  const mode = getGoogleCalendarAuthMode();
  if (mode === 'service_account') {
    const serviceAccountClient = getServiceAccountCalendarClient();
    if (!serviceAccountClient && process.env.NODE_ENV !== 'test' && !hasWarnedMissingCalendarAuth) {
      console.warn('Google Calendar sync enabled but service account credentials are missing.');
      hasWarnedMissingCalendarAuth = true;
    }
    return serviceAccountClient;
  }

  const oauthClient = await getOAuthCalendarClient();
  if (oauthClient) {
    return oauthClient;
  }

  if (canFallbackToServiceAccount()) {
    const fallbackClient = getServiceAccountCalendarClient();
    if (fallbackClient) {
      return fallbackClient;
    }
  }

  if (process.env.NODE_ENV !== 'test' && !hasWarnedMissingCalendarAuth) {
    console.warn(
      'Google Calendar sync enabled but no OAuth connection is active. Complete /api/oauth/google_calendar/authorize.'
    );
    hasWarnedMissingCalendarAuth = true;
  }
  return null;
};

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

export const upsertGoogleCalendarEvent = async (
  appointment: Appointment,
  service: Service
): Promise<string | null> => {
  const calendar = await getCalendarClient();
  if (!calendar) {
    return null;
  }

  const payload = buildGoogleCalendarEventPayload(appointment, service);
  const calendarId = getConfiguredCalendarId();

  if (appointment.calendarEventId) {
    try {
      await calendar.events.update({
        calendarId,
        eventId: appointment.calendarEventId,
        requestBody: payload,
      });
      return appointment.calendarEventId;
    } catch (error: any) {
      const status = error?.code || error?.response?.status;
      if (status !== 404) {
        throw error;
      }
    }
  }

  const created = await calendar.events.insert({
    calendarId,
    requestBody: payload,
  });

  return created.data.id ?? null;
};

export const deleteGoogleCalendarEvent = async (calendarEventId: string): Promise<void> => {
  const calendar = await getCalendarClient();
  if (!calendar) {
    return;
  }

  try {
    await calendar.events.delete({
      calendarId: getConfiguredCalendarId(),
      eventId: calendarEventId,
    });
  } catch (error: any) {
    const status = error?.code || error?.response?.status;
    if (status === 404) {
      return;
    }
    throw error;
  }
};
