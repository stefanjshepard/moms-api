# API Documentation

Comprehensive documentation for the current `api` service.

## 1) Overview

- Runtime: Node.js + Express + TypeScript
- Database: PostgreSQL via Prisma ORM
- Security middleware: `helmet`, `cors`, `express-xss-sanitizer`, `hpp`, rate limiting
- Authentication model: header-based admin key (`x-admin-key`)
- Core domains:
  - Clients
  - Services
  - Appointments + availability + reminders
  - Testimonials
  - Blog posts
  - Contact requests
  - Email verification + reminder dispatch

OpenAPI contract:

- [`openapi.yaml`](./openapi.yaml)
- Postman collection: [`docs/postman_collection.json`](./docs/postman_collection.json)
- Frontend client starter: [`docs/frontend-api-client.ts`](./docs/frontend-api-client.ts)

Base URL:

- Local: `http://localhost:5001/api`

Health route:

- `GET /` -> `{ "message": "API is running" }`

## 2) Environment Variables

Required / commonly used:

- `DATABASE_URL` - PostgreSQL connection string
- `ADMIN_KEY` - required for admin routes (`x-admin-key` header)
- `PORT` - server port (default `5001`)
- `FRONTEND_URL` - CORS allowlist origin in production

Email:

- `SMTP_HOST` (default: `smtp.gmail.com`)
- `SMTP_PORT` (default: `587`)
- `SMTP_SECURE` (`true`/`false`)
- `SMTP_USER`
- `SMTP_PASS` (Google App Password for Gmail)
- `FROM_EMAIL` (fallbacks to `SMTP_USER`)
- `FROM_NAME` (default: `Business`)
- `BUSINESS_OWNER_EMAIL` (owner notification fallback)
- `USE_ETHEREAL` (`true` to force ethereal mode)

Runtime:

- `NODE_ENV` (`development` / `test` / `production`)

## 3) Authentication

Admin endpoints require:

- Header: `x-admin-key: <ADMIN_KEY>`

If missing/invalid:

- `401 { "error": "Unauthorized" }`

## 4) Global Behavior

## Rate Limiting

Applied to all `/api` routes:

- Production: `100 requests / 15 minutes / IP`
- Test: lower test window for deterministic tests

Too many requests:

- `429 Too Many Requests`

## Security

- Helmet security headers
- XSS sanitization on request payloads
- HPP protection (duplicate parameter hardening)
- JSON/body size limits (`10kb`)

## Error format

Typical error shape:

- `{ "error": "message" }`
- Some endpoints use `{ "message": "message" }` for server errors

## 5) Data Model Summary

Primary Prisma models:

- `Client`
  - `id`, `name`, `aboutMe`, `email`
- `Service`
  - `title`, `description`, `price`, `durationMinutes`, `bufferMinutes`, `isPublished`, `clientId`
- `Appointment`
  - client details, `date`, `endDate`, `timezone`, `states`, payment fields, reminder relation
- `AvailabilityRule`
  - weekly availability blocks by weekday
- `AvailabilityException`
  - blocked periods / overrides
- `ReminderJob`
  - queued/sent/failed reminder tracking
- `ContactRequest`, `Testimonial`, `BlogPost`

## 6) Scheduling Rules (Current Implementation)

- Timezone policy: **MST** (`timezone` defaults to `"MST"`)
- Allowed booking window: **Monday-Friday, 9:00 AM-5:00 PM MST**
- Minimum lead time to book: **24 hours**
- Cancellation/reschedule cutoff: **24 hours**
- Overlap protection: blocks conflicting appointment time ranges
- Slot endpoint returns available starts based on:
  - service duration + buffer
  - availability rules
  - blocked exceptions
  - existing appointments

## 7) API Endpoints

## Public Routes

### Appointments

- `POST /appointments`
  - Create appointment
  - Enforces booking rules and overlap checks
  - Sends customer + owner notifications
  - Schedules 24h reminder job
  - Body:
    - `clientFirstName`, `clientLastName`, `email`, `phone`, `date`, `serviceId`
    - Optional: `paymentMethod` (`venmo|credit_card`), `paymentStatus` (`pending|paid`), `tipAmount`
- `GET /appointments`
  - List appointments
  - Query support: `dateFrom`, `dateTo`, `serviceId`
- `GET /appointments/available?serviceId=<id>&date=YYYY-MM-DD`
  - Returns available slots for service/date in MST
- `GET /appointments/:id`
  - Get one appointment
- `PUT /appointments/:id`
  - Update appointment details
  - If date changes: revalidates policy + overlap, sends reschedule emails, reschedules reminder
- `PUT /appointments/:id/confirm`
  - Confirms appointment after payment event (`paymentStatus: completed`)
  - Sets state to confirmed + payment status to paid
- `DELETE /appointments/:id`
  - Cancels appointment (must be 24h in advance)
  - Cancels pending reminder jobs
  - Sends cancellation emails

### Services

- `GET /services`
  - List published services
- `GET /services/:id`
  - Get published service by id

### Testimonials

- `GET /testimonials`
  - List testimonials
- `GET /testimonials/:id`
  - Get one testimonial
- `POST /testimonials`
  - Create testimonial

### Blog

- `GET /blog`
  - List published blog posts (descending by `createdAt`)
- `GET /blog/:id`
  - Get one published blog post by id

### Contact

- `POST /contact`
  - Creates contact request
  - Sends owner notification email
- `GET /contact`
  - List contact requests
- `DELETE /contact/:id`
  - Delete contact request

## Admin Routes

All require `x-admin-key`.

### Clients

- `GET /admin/clients`
- `GET /admin/clients/:id`
- `POST /admin/clients`
- `PUT /admin/clients/:id`
- `DELETE /admin/clients/:id`

### Services

- `GET /admin/services/admin/all`
- `POST /admin/services`
- `PUT /admin/services/:id`
- `DELETE /admin/services/:id`
- `PATCH /admin/services/:id/publish`

### Testimonials

- `GET /admin/testimonials`
- `GET /admin/testimonials/:id`
- `POST /admin/testimonials`

### Blog Posts

- `GET /admin/blog-posts`
- `GET /admin/blog-posts/:id`
- `POST /admin/blog-posts`
- `PUT /admin/blog-posts/:id`
- `DELETE /admin/blog-posts/:id`
- `PATCH /admin/blog-posts/:id/publish`

### Email / Reminder Ops

- `POST /admin/email/verify`
  - Sends test email to provided address
- `GET /admin/email/config/verify`
  - Verifies configured transport
- `POST /admin/email/reminders/dispatch`
  - Dispatches due reminder jobs (cron-safe admin trigger)

## 8) Validation Rules

## Client Validation

- `name`: 2-100 chars
- `aboutMe`: 10-1000 chars
- `email`: valid email

## Service Validation

- `title`: 3-100 chars
- `description`: 20-1000 chars
- `price`: number >= 0 (max 2 decimals)
- `durationMinutes`: 15-240 (default 60)
- `bufferMinutes`: 0-60 (default 15)
- `clientId`: UUID

## Contact Validation

- `name`: 2-50
- `email`: valid email
- `message`: 10-1000

## Appointment Validation

- `clientFirstName`: 2-50
- `clientLastName`: 2-50
- `email`: valid email
- `phone`: international-like pattern (`+123...`)
- `serviceId`: UUID
- `date`: valid, >=24h ahead, Mon-Fri 9-5 MST
- `states`: `pending|confirmed|cancelled`
- `paymentMethod`: `venmo|credit_card` (optional)
- `paymentStatus`: `pending|paid` (optional)
- `tipAmount`: number >= 0 (optional)

## 9) Email & Reminder Flow

On appointment create:

- Customer receives confirmation email
- Owner receives new appointment email
- Reminder job queued for 24h before

On reschedule:

- Customer + owner reschedule emails
- Reminder job rescheduled

On cancel:

- Cancel blocked if under 24h
- Pending reminder jobs cancelled
- Customer + owner cancellation emails

Reminder dispatch:

- Trigger `POST /admin/email/reminders/dispatch`
- Sends customer and owner reminder emails for due jobs
- Marks jobs sent/failed with timestamps and error messages

## 10) Google Calendar Sync

Current API includes calendar-linked fields:

- `Appointment.calendarEventId`
- normalized start/end (`date`, `endDate`)
- timezone tracking

Calendar service:

- `src/services/calendar.service.ts`

Current behavior synchronizes events with Google Calendar during appointment lifecycle operations:

- create appointment -> create/update Google Calendar event
- update appointment -> update event (or recreate if missing)
- delete appointment -> delete Google Calendar event

Sync is best-effort and non-blocking (API success is not blocked by Calendar API failure).

### Required environment variables

```env
GOOGLE_CALENDAR_SYNC_ENABLED=true
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_AUTH_MODE=oauth
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5001/api/oauth/callback/google_calendar
```

Optional fallback: service account credentials (if `GOOGLE_CALENDAR_ALLOW_SERVICE_ACCOUNT_FALLBACK=true`):

```env
# Option A (recommended for deployment systems)
GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=...

# Option B
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Option C
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Google OAuth connection flow:

- `POST /api/oauth/google_calendar/authorize` (admin auth required)
- Redirect user to returned `authorizationUrl`
- Google callback hits `/api/oauth/callback/google_calendar`
- Appointment create/update/delete syncs use stored OAuth tokens

## 11) Project Commands

```bash
# Run API in development
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Prisma
npx prisma migrate dev
npx prisma generate
npx prisma db seed
```

## 12) File Map (Key Implementation Files)

- Entry: `src/index.ts`
- Router composition: `src/routes/index.ts`
- Auth middleware: `src/middleware/auth.ts`
- Rate limit middleware: `src/middleware/rateLimit.ts`
- Error handler: `src/middleware/errorHandler.ts`
- Appointment routes: `src/routes/appointment.routes.ts`
- Email routes/service/templates:
  - `src/routes/email.routes.ts`
  - `src/services/email.service.ts`
  - `src/services/email.templates.ts`
- Scheduling/reminder/calendar helpers:
  - `src/services/scheduling.service.ts`
  - `src/services/reminder.service.ts`
  - `src/services/calendar.service.ts`
- OAuth/integration helpers:
  - `src/routes/oauth.routes.ts`
  - `src/routes/integration.routes.ts`
  - `src/services/oauth/oauth.service.ts`
  - `src/services/oauth/oauth.providers.ts`

## 13) Integration OAuth Endpoints

Provider authorization and callback:

- `POST /api/oauth/:provider/authorize` (admin auth required)
- `GET /api/oauth/callback/:provider`
- `GET /api/oauth/:provider/status` (admin auth required)
- `DELETE /api/oauth/:provider/connection` (admin auth required)

Integration diagnostics:

- `GET /api/admin/integrations/:provider/status` (admin auth required)
- `POST /api/admin/integrations/:provider/refresh` (admin auth required)

Supported providers:

- `google_calendar`
- `intuit`
- Prisma schema + seed:
  - `prisma/schema.prisma`
  - `prisma/seed.ts`

