# Moms Website API

Express + TypeScript + Prisma API for appointments, services, content, contact requests, and admin workflows.

## Documentation

- Full API documentation: [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md)
- OpenAPI spec: [`openapi.yaml`](./openapi.yaml)
- Email implementation details: [`EMAIL_IMPLEMENTATION.md`](./EMAIL_IMPLEMENTATION.md)
- Postman collection: [`docs/postman_collection.json`](./docs/postman_collection.json)
- Frontend API client starter: [`docs/frontend-api-client.ts`](./docs/frontend-api-client.ts)

## Quick Start

```bash
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Server defaults:

- App URL: `http://localhost:5001`
- API base: `http://localhost:5001/api`

## Google Calendar Sync (Optional)

Set these environment variables to enable real Google Calendar event sync for appointment create/update/delete flows:

```env
GOOGLE_CALENDAR_SYNC_ENABLED=true
GOOGLE_CALENDAR_ID=primary
GOOGLE_CALENDAR_AUTH_MODE=oauth

# Required for OAuth mode:
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5001/api/oauth/callback/google_calendar
# Optional override:
# GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email

# Optional service-account fallback:
# GOOGLE_CALENDAR_ALLOW_SERVICE_ACCOUNT_FALLBACK=true
# GOOGLE_SERVICE_ACCOUNT_JSON_BASE64=...

# Alternate service-account formats:
# GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
# GOOGLE_SERVICE_ACCOUNT_EMAIL=...
# GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Intuit OAuth Connection (Preparation)

```env
INTUIT_OAUTH_CLIENT_ID=...
INTUIT_OAUTH_CLIENT_SECRET=...
INTUIT_OAUTH_REDIRECT_URI=http://localhost:5001/api/oauth/callback/intuit
# Optional:
# INTUIT_OAUTH_AUTHORIZE_URL=https://appcenter.intuit.com/connect/oauth2
# INTUIT_OAUTH_TOKEN_URL=https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
# INTUIT_OAUTH_SCOPES=com.intuit.quickbooks.accounting com.intuit.quickbooks.payment
```

New admin diagnostics endpoints:

- `GET /api/admin/integrations/intuit/status`
- `POST /api/admin/integrations/intuit/refresh`

## Intuit Payments + Webhooks

```env
# payment checkout mode: mock (default) or live
INTUIT_PAYMENT_MODE=mock

# required in live mode: Intuit payment creation endpoint
# INTUIT_PAYMENTS_CREATE_URL=https://...

# optional checkout redirect base (mock/demo mode)
INTUIT_CHECKOUT_BASE_URL=https://sandbox.intuit.com/mock-checkout

# webhook signature secret (required in production)
INTUIT_WEBHOOK_SECRET=replace-me
INTUIT_WEBHOOK_MAX_AGE_SECONDS=300
# optional allowlist override:
# INTUIT_SUCCESS_EVENT_TYPES=payment.succeeded,payment.success,charge.succeeded

# checkout token signing (required for /payments/intuit/checkout-session)
BOOKING_TOKEN_SECRET=replace-me

# server-side appointment confirmation secret (for /appointments/:id/confirm)
PAYMENT_CONFIRMATION_SECRET=replace-me

# tests only: enforce confirmation auth even in NODE_ENV=test
# PAYMENT_CONFIRMATION_ENFORCE_IN_TEST=false

# security alert destination (defaults to BUSINESS_OWNER_EMAIL)
# SECURITY_ALERT_EMAIL=security@example.com
```

Payment endpoints:

- `POST /api/payments/intuit/checkout-session` (requires `x-booking-token`)
- `POST /api/webhooks/intuit` (requires `intuit-signature` + `intuit-timestamp`)

Public route hardening:

- public: `POST /api/appointments`, `GET /api/appointments/available`, `POST /api/contact`
- admin-only: appointment list/detail/update/delete and contact list/delete

Optional bot mitigation for public create routes:

```env
# enable CAPTCHA checks for POST /api/appointments and POST /api/contact
CAPTCHA_SECRET=...
# optional: turnstile (default) or hcaptcha
# CAPTCHA_PROVIDER=turnstile
# CAPTCHA_VERIFY_URL=https://challenges.cloudflare.com/turnstile/v0/siteverify
```

Distributed abuse controls:

```env
# enables Redis-backed rate limiting when set
REDIS_URL=redis://localhost:6379
```

## Reminder Dispatch Automation

The API schedules a 24h reminder job when appointments are created/updated. To automatically send due reminders without manually calling the admin endpoint, enable the built-in scheduler:

```env
ENABLE_REMINDER_DISPATCH_SCHEDULER=true
REMINDER_DISPATCH_INTERVAL_MINUTES=5

# Optional endpoint-based dispatch (calls POST /api/admin/email/reminders/dispatch)
REMINDER_DISPATCH_USE_ENDPOINT=true
REMINDER_DISPATCH_BASE_URL=https://your-api-domain

# Optional alert target when reminder dispatch has failures
REMINDER_ALERT_EMAIL=owner@example.com
```

Manual dispatch endpoint (admin-protected) still exists:

- `POST /api/admin/email/reminders/dispatch`

## Data Retention

Run cleanup manually (admin-protected):

- `POST /api/admin/security/retention/run`

Optional scheduler:

```env
ENABLE_DATA_RETENTION_SCHEDULER=true
DATA_RETENTION_INTERVAL_HOURS=24
RETENTION_CONTACT_REQUEST_DAYS=90
RETENTION_WEBHOOK_EVENT_DAYS=90
RETENTION_SECURITY_AUDIT_DAYS=180
```

## Test Commands

```bash
npm test
npm run test:watch
npm run test:coverage
```

