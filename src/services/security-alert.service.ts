import { sendEmail } from './email.service';

const getSecurityAlertRecipient = (): string | null =>
  process.env.SECURITY_ALERT_EMAIL || process.env.BUSINESS_OWNER_EMAIL || null;

export const sendSecurityAlert = async (params: {
  subject: string;
  summary: string;
  details?: Record<string, unknown>;
}): Promise<void> => {
  const recipient = getSecurityAlertRecipient();
  if (!recipient) {
    return;
  }

  const detailsHtml = params.details
    ? `<pre style="white-space:pre-wrap;font-family:monospace;">${JSON.stringify(params.details, null, 2)}</pre>`
    : '';
  const html = `
    <h3>Security Alert</h3>
    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    <p><strong>Summary:</strong> ${params.summary}</p>
    ${detailsHtml}
  `;

  await sendEmail(recipient, params.subject, html, undefined, false);
};
