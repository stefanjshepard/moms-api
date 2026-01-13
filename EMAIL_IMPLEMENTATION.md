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
SMTP_USER=your-business-email@gmail.com
SMTP_PASS=your-16-character-app-password

# Email Display Settings
FROM_EMAIL=your-business-email@gmail.com
FROM_NAME=Your Business Name

# Business Owner Email (for contact request notifications)
# If not set, will use the first client's email from the database
BUSINESS_OWNER_EMAIL=your-business-email@gmail.com
```

### Gmail Setup

**IMPORTANT: For Gmail, you need an "App Password" - NOT your regular Gmail password!**

For Gmail, you'll typically use the **same email address** for all three:

- `SMTP_USER` - The Gmail account that sends emails (authenticates with SMTP)
- `FROM_EMAIL` - The "from" address shown in emails (must match `SMTP_USER` - Gmail doesn't allow spoofing)
- `BUSINESS_OWNER_EMAIL` - The email address that receives contact request notifications (usually the same)

**Setup Steps:**

1. Use your business Gmail account (e.g., `yourbusiness@gmail.com`)
2. Enable 2-factor authentication on your Google account (required for app passwords)
3. Generate an "App Password":
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)" - name it something like "Website API"
   - Google will generate a 16-character password (looks like: `abcd efgh ijkl mnop`)
   - **Copy this app password** (you won't see it again!)
4. Use this app password (remove spaces) for `SMTP_PASS` - **NOT your regular Gmail password**

**Example `.env` configuration:**

```env
SMTP_USER=business@gmail.com
SMTP_PASS=abcdefghijklmnop
FROM_EMAIL=business@gmail.com
BUSINESS_OWNER_EMAIL=business@gmail.com
```

**Note:** All three can be the same email address for simplicity. `BUSINESS_OWNER_EMAIL` could theoretically be different if you want notifications sent to a different inbox, but typically you'll want them all the same.

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
