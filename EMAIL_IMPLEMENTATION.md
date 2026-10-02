# Email

SMTP via Nodemailer. Templates live in `src/services/email.templates.ts`. Sending is non-blocking: a failed send is logged and does not fail the HTTP response.

API routes and payloads: [`openapi.yaml`](./openapi.yaml). Booking/calendar rules: [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md).

## Environment

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-business-email@gmail.com
SMTP_PASS=your-16-character-app-password
FROM_EMAIL=your-business-email@gmail.com
FROM_NAME=Oneness Center
BUSINESS_OWNER_EMAIL=your-business-email@gmail.com
```

Gmail needs an App Password, not the account password: enable 2FA, then [App passwords](https://myaccount.google.com/apppasswords). `SMTP_USER` and `FROM_EMAIL` must match. `USE_ETHEREAL=true` captures mail instead of sending (also used when `NODE_ENV=test`).

Admin checks: `POST /admin/email/verify`, `GET /admin/email/config/verify`, `POST /admin/email/reminders/dispatch`.

## When mail is sent

1:1 session (`POST /appointments`):

- Customer: request received (pending).
- Owner: new booking with Accept/Deny links (14-day decision token).
- Accept: customer pay-now email (checkout token, 7 days) plus Google Calendar for that session.
- Deny: customer declined email; slot frees.
- After Intuit success: customer confirmed + owner receipt.
- Reschedule / cancel / 24h reminder: customer and owner.

Circle seat (`POST /flyers/{id}/register`):

- Customer: seat reserved; pay in person at the event (no pay button).
- Owner: seat reserved; registrant is invited to the flyer Google Calendar event with name, email, and phone.

Contact form: owner notification only.

## Templates

| Export | Use |
| --- | --- |
| `appointmentConfirmationTemplate` | 1:1 created (pending) |
| `appointmentNotificationToOwnerTemplate` | 1:1 to owner, Accept/Deny |
| `appointmentAcceptedTemplate` | 1:1 accepted, pay link |
| `appointmentDeniedTemplate` | 1:1 denied |
| `appointmentConfirmedTemplate` | 1:1 paid |
| `appointmentPaymentReceiptToOwnerTemplate` | Owner payment receipt |
| `appointmentRescheduleTemplate` / `appointmentRescheduleNotificationToOwnerTemplate` | Date change |
| `appointmentCancellationTemplate` / `appointmentCancellationNotificationToOwnerTemplate` | Cancel |
| `appointmentReminderTemplate` / `appointmentReminderToOwnerTemplate` | 24h reminder |
| `circleRegistrationToCustomerTemplate` | Circle reserved, in-person pay |
| `circleRegistrationToOwnerTemplate` | Circle reserved, calendar note |
| `contactRequestNotificationTemplate` | Contact form |
| `appointmentDecisionPageHtml` | Browser Accept/Deny page |

## Tests

```bash
npm test -- email.ethereal.test.ts
```

Preview URLs print to the console (`https://ethereal.email/message/...`). Tests assert HTML escaping as well as send paths.
