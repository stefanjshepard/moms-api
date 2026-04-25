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

## Intuit Payments + Webhooks (v1)

```env
# payment checkout mode: mock (default) or live
INTUIT_PAYMENT_MODE=mock

# optional checkout redirect base (mock/demo)
INTUIT_CHECKOUT_BASE_URL=https://sandbox.intuit.com/mock-checkout

# webhook shared secret (optional but recommended)
INTUIT_WEBHOOK_SECRET=replace-me

# server-side appointment confirmation secret (for /appointments/:id/confirm)
PAYMENT_CONFIRMATION_SECRET=replace-me
```

Payment endpoints:

- `POST /api/payments/intuit/checkout-session`
- `POST /api/webhooks/intuit`

## Test Commands

```bash
npm test
npm run test:watch
npm run test:coverage
```

