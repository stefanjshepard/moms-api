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
          <h1>Appointment Confirmation</h1>
        </div>
        <div class="content">
          <p>Hi ${escapeHtml(data.clientFirstName)},</p>
          <p>Thank you for booking an appointment with us! Your appointment has been successfully scheduled.</p>
          <div class="details">
            <h3>Appointment Details:</h3>
            <p><strong>Service:</strong> ${escapeHtml(data.serviceTitle)}</p>
            <p><strong>Date & Time:</strong> ${formattedDate}</p>
            <p><strong>Status:</strong> Pending Confirmation</p>
          </div>
          <p>We'll send you a confirmation email once your appointment is confirmed. If you need to make any changes, please contact us as soon as possible.</p>
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
          <h1>New Appointment Booked</h1>
        </div>
        <div class="content">
          <p>A new appointment has been requested on your site.</p>
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
          <p>You can use the details above to reach out to your client if needed.</p>
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
