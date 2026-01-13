# Email Service Implementation

This document describes the email service implementation using Nodemailer.

## Overview

The email service has been integrated to send emails for:

1. **Contact Requests** - Notifies the business owner when someone submits a contact form
2. **Appointments** - Sends confirmation emails when appointments are:
   - Created (pending confirmation)
   - Rescheduled (when date is updated)
   - Confirmed (after payment)
   - Cancelled (when deleted)

## Environment Variables

Add these to your `.env` file:

```env
# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Email Display Settings
FROM_EMAIL=your-email@gmail.com
FROM_NAME=Your Business Name

# Business Owner Email (for contact request notifications)
# If not set, will use the first client's email from the database
BUSINESS_OWNER_EMAIL=owner@example.com
```

### Gmail Setup

If using Gmail, you'll need to:

1. Enable 2-factor authentication on your Google account
2. Generate an "App Password" at: https://myaccount.google.com/apppasswords
3. Use the app password (not your regular password) for `SMTP_PASS`

### Other Email Providers

For other providers (SendGrid, Mailgun, AWS SES, etc.), adjust the SMTP settings accordingly:

- **SendGrid**: `SMTP_HOST=smtp.sendgrid.net`, `SMTP_PORT=587`, `SMTP_USER=apikey`, `SMTP_PASS=your-sendgrid-api-key`
- **Mailgun**: `SMTP_HOST=smtp.mailgun.org`, `SMTP_PORT=587`
- **AWS SES**: Use your AWS SES SMTP credentials

## Email Templates

Email templates are located in `src/services/email.templates.ts`. All templates are HTML-formatted with inline CSS for better email client compatibility.

### Template Types

1. **appointmentConfirmationTemplate** - Sent when appointment is created
2. **appointmentRescheduleTemplate** - Sent when appointment date is updated
3. **appointmentCancellationTemplate** - Sent when appointment is deleted
4. **appointmentConfirmedTemplate** - Sent when appointment is confirmed (after payment)
5. **contactRequestNotificationTemplate** - Sent to business owner when contact form is submitted

## Implementation Details

### Non-Blocking Email Sending

All email sending is **non-blocking** - if an email fails to send, it won't break the API response. Errors are logged to the console but don't affect the HTTP response status.

### Service Structure

- `src/services/email.service.ts` - Core email service with nodemailer configuration
- `src/services/email.templates.ts` - HTML email templates
- Routes updated:
  - `src/routes/contact.routes.ts` - Contact form submissions
  - `src/routes/appointment.routes.ts` - Appointment CRUD operations

## Testing

To test the email service:

1. Set up your SMTP credentials in `.env`
2. Verify email configuration (you can add this to your startup code):

   ```typescript
   import { verifyEmailConfig } from "./services/email.service";
   verifyEmailConfig().then((isValid) => {
     console.log("Email config valid:", isValid);
   });
   ```

3. Test endpoints:
   - `POST /api/contact` - Submit a contact form
   - `POST /api/appointments` - Create an appointment
   - `PUT /api/appointments/:id` - Update/reschedule an appointment
   - `PUT /api/appointments/:id/confirm` - Confirm an appointment
   - `DELETE /api/appointments/:id` - Cancel an appointment

## Future Enhancements

Consider adding:

- Email delivery tracking/logging to database
- Retry logic for failed emails
- Email queue system (Redis/Bull) for high volume
- Template customization via admin panel
- Email bcc/cc options
- Plain text fallback improvements

## Payment Integration Note

When integrating Intuit API + OAuth 2.0 for payments:

- Intuit/QuickBooks Payments typically sends payment confirmation emails automatically
- The current implementation sends an "appointment confirmed" email when `PUT /api/appointments/:id/confirm` is called with `paymentStatus: 'completed'`
- You may want to trigger this endpoint after receiving payment confirmation webhook from Intuit
- Consider coordinating email sending to avoid duplicate confirmation emails
