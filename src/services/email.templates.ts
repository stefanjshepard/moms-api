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
