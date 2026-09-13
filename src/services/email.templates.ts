// Email templates for different scenarios

// HTML escape function to prevent XSS attacks
const escapeHtml = (text: string): string => {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
};

// Escape HTML and preserve newlines as <br> tags
const escapeHtmlWithLineBreaks = (text: string): string => {
  return escapeHtml(text).replace(/\n/g, '<br>');
};

interface AppointmentData {
  clientFirstName: string;
  clientLastName: string;
  email: string;
  date: Date;
  serviceTitle: string;
  serviceDescription?: string;
  appointmentId?: string;
  oldDate?: Date; // For reschedule emails
  payUrl?: string | null;
}

interface ContactRequestData {
  name: string;
  email: string;
  message: string;
}

/** Data for the email sent to the business owner when a customer books an appointment */
interface AppointmentNotificationToOwnerData {
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone?: string | null;
  serviceTitle: string;
  date: Date;
  appointmentId: string;
  acceptUrl?: string | null;
  denyUrl?: string | null;
}

/** Data for owner notification when a customer reschedules */
interface AppointmentRescheduleNotificationToOwnerData extends AppointmentNotificationToOwnerData {
  oldDate: Date;
}

/** Data for owner notification when an appointment is cancelled */
interface AppointmentCancellationNotificationToOwnerData {
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone?: string | null;
  serviceTitle: string;
  date: Date;
  appointmentId: string;
}

interface AppointmentReminderData {
  clientFirstName: string;
  clientLastName: string;
  email: string;
  phone?: string | null;
  date: Date;
  serviceTitle: string;
  appointmentId: string;
}

interface AppointmentPaymentReceiptToOwnerData {
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone?: string | null;
  serviceTitle: string;
  date: Date;
  appointmentId: string;
  paymentExternalId: string;
  amountPaid: number;
  currency: string;
}

// Appointment Confirmation Email (when appointment is created)
export const appointmentConfirmationTemplate = (data: AppointmentData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4a90e2; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #4a90e2; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>We received your request</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(data.clientFirstName)},</p>
          <p>Thank you for requesting a session. Annette will review this time and email you when it is accepted. Please wait to pay until you receive that email.</p>
          <div class="details">
            <h3>Appointment Details:</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date & Time:</strong> ${formattedDate}</p>
            <p><strong>Status:</strong> Pending Confirmation</p>
          </div>
          <p>If this time no longer works, reply to Annette or send a note through the website.</p>
          <p>We look forward to seeing you!</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Appointment Reschedule Email (when appointment date is updated)
export const appointmentRescheduleTemplate = (data: AppointmentData): string => {
  const formattedNewDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const formattedOldDate = data.oldDate
    ? new Date(data.oldDate).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #ff9800; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #ff9800; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Rescheduled</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(data.clientFirstName)},</p>
          <p>Your appointment has been rescheduled. Please see the updated details below.</p>
          <div class="details">
            <h3>Updated Appointment Details:</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            ${formattedOldDate ? `<p><strong>Previous Date:</strong> ${formattedOldDate}</p>` : ''}
            <p><strong>New Date & Time:</strong> ${formattedNewDate}</p>
          </div>
          <p>If you need to make any further changes, please contact us as soon as possible.</p>
          <p>We look forward to seeing you!</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Appointment Cancellation Email (when appointment is deleted)
export const appointmentCancellationTemplate = (data: AppointmentData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #e74c3c; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #e74c3c; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Cancelled</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(data.clientFirstName)},</p>
          <p>Your appointment has been cancelled as requested.</p>
          <div class="details">
            <h3>Cancelled Appointment Details:</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date & Time:</strong> ${formattedDate}</p>
          </div>
          <p>If you would like to schedule a new appointment, please feel free to book through our website.</p>
          <p>We hope to serve you in the future!</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Appointment Confirmed Email (after payment confirmation)
export const appointmentConfirmedTemplate = (data: AppointmentData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #27ae60; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #27ae60; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Confirmed!</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(data.clientFirstName)},</p>
          <p>Great news! Your appointment has been confirmed.</p>
          <div class="details">
            <h3>Confirmed Appointment Details:</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date & Time:</strong> ${formattedDate}</p>
            <p><strong>Status:</strong> Confirmed</p>
          </div>
          <p>We're looking forward to meeting with you. If you need to make any changes, please contact us at least 24 hours in advance.</p>
          <p>See you soon!</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// New Appointment Notification Email (to business owner – so they can see customer contact info)
export const appointmentNotificationToOwnerTemplate = (data: AppointmentNotificationToOwnerData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const fullName = `${escapeHtml(data.customerFirstName)} ${escapeHtml(data.customerLastName)}`.trim();
  const phoneLine = data.customerPhone
    ? `<p><strong>Phone:</strong> <a href="tel:${escapeHtml(data.customerPhone)}">${escapeHtml(data.customerPhone)}</a></p>`
    : '<p><strong>Phone:</strong> Not provided</p>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4a90e2; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #4a90e2; }
        .contact-box { margin-top: 12px; padding: 12px; background-color: #f0f7ff; border-radius: 6px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Appointment Request</h1>
        </div>
        <div class="content">
          <p>A new appointment has been requested on your site. Accepting it holds the time on your Google Calendar and emails the customer a payment link.</p>
          <div class="details">
            <h3>Appointment details</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date &amp; time:</strong> ${formattedDate}</p>
            <p><strong>Appointment ID:</strong> ${escapeHtml(data.appointmentId)}</p>
            <h3 style="margin-top: 16px;">Customer contact information</h3>
            <div class="contact-box">
              <p><strong>Name:</strong> ${fullName}</p>
              <p><strong>Email:</strong> <a href="mailto:${escapeHtml(data.customerEmail)}">${escapeHtml(data.customerEmail)}</a></p>
              ${phoneLine}
            </div>
          </div>
          ${
            data.acceptUrl && data.denyUrl
              ? `<p style="margin: 24px 0;">
                  <a href="${escapeHtml(data.acceptUrl)}" style="display:inline-block;background:#2f6f5e;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:999px;margin-right:12px;">Accept booking</a>
                  <a href="${escapeHtml(data.denyUrl)}" style="display:inline-block;background:#9b2c2c;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:999px;">Deny booking</a>
                </p>
                <p>These links confirm or release this time. The slot stays held until you decide.</p>`
              : '<p>You can use the details above to reach out to your client if needed.</p>'
          }
        </div>
        <div class="footer">
          <p>This is an automated message from your booking system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Appointment Reschedule Notification (to business owner)
export const appointmentRescheduleNotificationToOwnerTemplate = (
  data: AppointmentRescheduleNotificationToOwnerData
): string => {
  const formattedNewDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const formattedOldDate = new Date(data.oldDate).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const fullName = `${escapeHtml(data.customerFirstName)} ${escapeHtml(data.customerLastName)}`.trim();
  const phoneLine = data.customerPhone
    ? `<p><strong>Phone:</strong> <a href="tel:${escapeHtml(data.customerPhone)}">${escapeHtml(data.customerPhone)}</a></p>`
    : '<p><strong>Phone:</strong> Not provided</p>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #ff9800; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #ff9800; }
        .contact-box { margin-top: 12px; padding: 12px; background-color: #fff8f0; border-radius: 6px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Rescheduled</h1>
        </div>
        <div class="content">
          <p>A client has rescheduled an appointment.</p>
          <div class="details">
            <h3>Appointment details</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Previous date:</strong> ${formattedOldDate}</p>
            <p><strong>New date &amp; time:</strong> ${formattedNewDate}</p>
            <p><strong>Appointment ID:</strong> ${escapeHtml(data.appointmentId)}</p>
            <h3 style="margin-top: 16px;">Customer contact information</h3>
            <div class="contact-box">
              <p><strong>Name:</strong> ${fullName}</p>
              <p><strong>Email:</strong> <a href="mailto:${escapeHtml(data.customerEmail)}">${escapeHtml(data.customerEmail)}</a></p>
              ${phoneLine}
            </div>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated message from your booking system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Appointment Cancellation Notification (to business owner)
export const appointmentCancellationNotificationToOwnerTemplate = (
  data: AppointmentCancellationNotificationToOwnerData
): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const fullName = `${escapeHtml(data.customerFirstName)} ${escapeHtml(data.customerLastName)}`.trim();
  const phoneLine = data.customerPhone
    ? `<p><strong>Phone:</strong> <a href="tel:${escapeHtml(data.customerPhone)}">${escapeHtml(data.customerPhone)}</a></p>`
    : '<p><strong>Phone:</strong> Not provided</p>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #e74c3c; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #e74c3c; }
        .contact-box { margin-top: 12px; padding: 12px; background-color: #fef0ef; border-radius: 6px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Cancelled</h1>
        </div>
        <div class="content">
          <p>An appointment has been cancelled.</p>
          <div class="details">
            <h3>Cancelled appointment details</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date &amp; time:</strong> ${formattedDate}</p>
            <p><strong>Appointment ID:</strong> ${escapeHtml(data.appointmentId)}</p>
            <h3 style="margin-top: 16px;">Customer contact information</h3>
            <div class="contact-box">
              <p><strong>Name:</strong> ${fullName}</p>
              <p><strong>Email:</strong> <a href="mailto:${escapeHtml(data.customerEmail)}">${escapeHtml(data.customerEmail)}</a></p>
              ${phoneLine}
            </div>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated message from your booking system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Appointment Reminder Email (24h before appointment)
export const appointmentReminderTemplate = (data: AppointmentReminderData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #7b61ff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #7b61ff; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Appointment Reminder</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(data.clientFirstName)},</p>
          <p>This is a friendly reminder that your appointment is in 24 hours.</p>
          <div class="details">
            <h3>Appointment Details:</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date & Time:</strong> ${formattedDate}</p>
            <p><strong>Appointment ID:</strong> ${escapeHtml(data.appointmentId)}</p>
          </div>
          <p>If you need to reschedule or cancel, please do so at least 24 hours in advance.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Appointment Reminder Email (to business owner, 24h before appointment)
export const appointmentReminderToOwnerTemplate = (data: AppointmentNotificationToOwnerData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const fullName = `${escapeHtml(data.customerFirstName)} ${escapeHtml(data.customerLastName)}`.trim();
  const phoneLine = data.customerPhone
    ? `<p><strong>Phone:</strong> <a href="tel:${escapeHtml(data.customerPhone)}">${escapeHtml(data.customerPhone)}</a></p>`
    : '<p><strong>Phone:</strong> Not provided</p>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #7b61ff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #7b61ff; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Upcoming Appointment Reminder (24h)</h1>
        </div>
        <div class="content">
          <p>You have an appointment coming up in 24 hours.</p>
          <div class="details">
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date & Time:</strong> ${formattedDate}</p>
            <p><strong>Client:</strong> ${fullName}</p>
            <p><strong>Email:</strong> <a href="mailto:${escapeHtml(data.customerEmail)}">${escapeHtml(data.customerEmail)}</a></p>
            ${phoneLine}
            <p><strong>Appointment ID:</strong> ${escapeHtml(data.appointmentId)}</p>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated message from your booking system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Payment receipt notification (to business owner after successful payment webhook)
export const appointmentPaymentReceiptToOwnerTemplate = (
  data: AppointmentPaymentReceiptToOwnerData
): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const fullName = `${escapeHtml(data.customerFirstName)} ${escapeHtml(data.customerLastName)}`.trim();
  const phoneLine = data.customerPhone
    ? `<p><strong>Phone:</strong> <a href="tel:${escapeHtml(data.customerPhone)}">${escapeHtml(data.customerPhone)}</a></p>`
    : '<p><strong>Phone:</strong> Not provided</p>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2d9cdb; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #2d9cdb; }
        .contact-box { margin-top: 12px; padding: 12px; background-color: #eff8ff; border-radius: 6px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Payment Received</h1>
        </div>
        <div class="content">
          <p>A payment has been successfully received for an appointment.</p>
          <div class="details">
            <h3>Payment details</h3>
            <p><strong>Amount:</strong> ${escapeHtml(data.currency)} ${escapeHtml(data.amountPaid.toFixed(2))}</p>
            <p><strong>Payment ID:</strong> ${escapeHtml(data.paymentExternalId)}</p>
            <p><strong>Appointment ID:</strong> ${escapeHtml(data.appointmentId)}</p>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Appointment Date & Time:</strong> ${formattedDate}</p>
            <h3 style="margin-top: 16px;">Client contact information</h3>
            <div class="contact-box">
              <p><strong>Name:</strong> ${fullName}</p>
              <p><strong>Email:</strong> <a href="mailto:${escapeHtml(data.customerEmail)}">${escapeHtml(data.customerEmail)}</a></p>
              ${phoneLine}
            </div>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated message from your booking system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Contact Request Notification Email (to business owner)
export const contactRequestNotificationTemplate = (data: ContactRequestData): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4a90e2; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #4a90e2; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Contact Request</h1>
        </div>
        <div class="content">
          <p>You have received a new contact request from your website.</p>
          <div class="details">
            <h3>Contact Details:</h3>
            <p><strong>Name:</strong> ${escapeHtml(data.name)}</p>
            <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
            <p><strong>Message:</strong></p>
            <p>${escapeHtmlWithLineBreaks(data.message)}</p>
          </div>
          <p>Please respond to this inquiry at your earliest convenience.</p>
        </div>
        <div class="footer">
          <p>This is an automated message from your website contact form.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const appointmentAcceptedTemplate = (data: AppointmentData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const payButton = data.payUrl
    ? `<p style="margin: 24px 0;">
        <a href="${escapeHtml(data.payUrl)}" style="display:inline-block;background:#2f6f5e;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:999px;">Complete payment</a>
      </p>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2f6f5e; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #2f6f5e; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Your session is accepted</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(data.clientFirstName)},</p>
          <p>Annette has accepted your booking. Please complete payment to finish holding this time.</p>
          <div class="details">
            <h3>Appointment Details:</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date & Time:</strong> ${formattedDate}</p>
            <p><strong>Status:</strong> Accepted — payment due</p>
          </div>
          ${payButton}
          <p>If the payment button does not work, reply to this email and we will send another link.</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const appointmentDeniedTemplate = (data: AppointmentData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #9b2c2c; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #9b2c2c; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>This time is not available</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(data.clientFirstName)},</p>
          <p>Thank you for requesting a session. This particular time could not be confirmed. Please choose another opening on the booking page, or send a note if you would like help finding a time.</p>
          <div class="details">
            <h3>Requested time:</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date & Time:</strong> ${formattedDate}</p>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const circleRegistrationToCustomerTemplate = (data: AppointmentData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const payButton = data.payUrl
    ? `<p style="margin: 24px 0;">
        <a href="${escapeHtml(data.payUrl)}" style="display:inline-block;background:#2f6f5e;color:#ffffff;padding:12px 20px;text-decoration:none;border-radius:999px;">Pay for this circle</a>
      </p>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2f6f5e; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #2f6f5e; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Circle registration received</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(data.clientFirstName)},</p>
          <p>Your seat request for this Sistership Circle is in. Complete payment with the button below. This beta checkout is labeled as a demo until live cards are enabled.</p>
          <div class="details">
            <p><strong>Circle:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date & Time:</strong> ${formattedDate}</p>
          </div>
          ${payButton}
        </div>
        <div class="footer">
          <p>This is an automated message from Oneness Center.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const circleRegistrationToOwnerTemplate = (data: AppointmentNotificationToOwnerData): string => {
  const formattedDate = new Date(data.date).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  const fullName = `${escapeHtml(data.customerFirstName)} ${escapeHtml(data.customerLastName)}`.trim();
  const phoneLine = data.customerPhone
    ? `<p><strong>Phone:</strong> ${escapeHtml(data.customerPhone)}</p>`
    : '<p><strong>Phone:</strong> Not provided</p>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2f6f5e; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .details { background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #2f6f5e; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Circle seat requested</h1>
        </div>
        <div class="content">
          <p>Someone requested a seat for a published Sistership Circle flyer.</p>
          <div class="details">
            <p><strong>Circle:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date &amp; time:</strong> ${formattedDate}</p>
            <p><strong>Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${escapeHtml(data.customerEmail)}</p>
            ${phoneLine}
          </div>
        </div>
        <div class="footer">
          <p>This is an automated message from your booking system.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const appointmentDecisionPageHtml = (params: {
  title: string;
  body: string;
  ok: boolean;
  calendarNote?: string;
}): string => {
  const accent = params.ok ? '#2f6f5e' : '#9b2c2c';
  const calendarLine = params.calendarNote
    ? `<p>${escapeHtml(params.calendarNote)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
  <style>
    body { font-family: Georgia, serif; background: #f7f8f6; color: #1a2420; margin: 0; padding: 40px 20px; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; padding: 32px; border: 1px solid rgba(26,36,32,0.1); }
    h1 { color: ${accent}; font-size: 28px; }
    p { line-height: 1.6; color: #5c6b63; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(params.title)}</h1>
    <p>${escapeHtml(params.body)}</p>
    ${calendarLine}
  </div>
</body>
</html>`;
};
