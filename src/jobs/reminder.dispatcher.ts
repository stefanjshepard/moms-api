import { dispatchDueAppointmentReminders } from '../services/reminder.service';
import { sendEmail } from '../services/email.service';

let reminderInterval: NodeJS.Timeout | null = null;

const getAlertRecipient = (): string | null =>
  process.env.REMINDER_ALERT_EMAIL || process.env.BUSINESS_OWNER_EMAIL || null;

const sendAlertEmail = async (subject: string, body: string): Promise<void> => {
  const recipient = getAlertRecipient();
  if (!recipient) {
    return;
  }
  await sendEmail(recipient, subject, body);
};

const runDispatchViaAdminEndpoint = async (): Promise<{ processed: number; sent: number; failed: number }> => {
  const adminKey = process.env.ADMIN_KEY;
  const apiBaseUrl = process.env.REMINDER_DISPATCH_BASE_URL;
  if (!adminKey || !apiBaseUrl) {
    throw new Error('Missing REMINDER_DISPATCH_BASE_URL or ADMIN_KEY for endpoint-based reminder dispatch.');
  }
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/admin/email/reminders/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': adminKey,
    },
  });
  if (!response.ok) {
    throw new Error(`Reminder dispatch endpoint returned ${response.status}.`);
  }
  const body = (await response.json()) as { processed: number; sent: number; failed: number };
  return {
    processed: body.processed ?? 0,
    sent: body.sent ?? 0,
    failed: body.failed ?? 0,
  };
};

const runDispatch = async (): Promise<void> => {
  try {
    const shouldUseEndpoint = process.env.REMINDER_DISPATCH_USE_ENDPOINT === 'true';
    const result = shouldUseEndpoint
      ? await runDispatchViaAdminEndpoint()
      : await dispatchDueAppointmentReminders();
    if (result.failed > 0) {
      console.error('Reminder dispatch completed with failures:', result);
      const html = `
        <p>Reminder dispatch completed with failed sends.</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Processed:</strong> ${result.processed}</p>
        <p><strong>Sent:</strong> ${result.sent}</p>
        <p><strong>Failed:</strong> ${result.failed}</p>
      `;
      await sendAlertEmail('Reminder Dispatch Warning', html);
    }
  } catch (error) {
    console.error('Reminder dispatch job failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown reminder dispatch error';
    const html = `
      <p>Reminder dispatch job failed.</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <p><strong>Error:</strong> ${message}</p>
    `;
    sendAlertEmail('Reminder Dispatch Failure Alert', html).catch((emailErr) => {
      console.error('Failed sending reminder failure alert email:', emailErr);
    });
  }
};

export const startReminderDispatchScheduler = (): void => {
  if (process.env.ENABLE_REMINDER_DISPATCH_SCHEDULER !== 'true') {
    return;
  }
  if (reminderInterval) {
    return;
  }

  const intervalMinutes = Math.max(
    1,
    parseInt(process.env.REMINDER_DISPATCH_INTERVAL_MINUTES || '5', 10)
  );
  const intervalMs = intervalMinutes * 60 * 1000;

  // Kick off once on startup so reminders are not delayed.
  void runDispatch();

  reminderInterval = setInterval(() => {
    void runDispatch();
  }, intervalMs);

  console.log(
    `Reminder dispatch scheduler started (interval=${intervalMinutes} minute${
      intervalMinutes === 1 ? '' : 's'
    }).`
  );
};

export const stopReminderDispatchScheduler = (): void => {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
};
