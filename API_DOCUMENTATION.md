# API Documentation

The machine-readable contract is [`openapi.yaml`](./openapi.yaml). This file is an operator overview. Do not treat Postman or `docs/frontend-api-client.ts` as current.

Local base URL: `http://localhost:5001/api`. Health: `GET /` → `{ "message": "API is running" }`.

## Runtime

Node.js + Express + TypeScript. PostgreSQL via Prisma. Admin routes use `x-admin-key`. Public writes are rate-limited. Typical errors: `{ "error": "message" }`.

Core domains: clients, services, appointments, circle flyers, availability, testimonials, blog, contact, email/reminders, Google Calendar OAuth, Intuit checkout (1:1 only).

## Environment (names only)

Always: `DATABASE_URL`, `ADMIN_KEY`, `PORT` (default `5001`), `FRONTEND_URL`, `NODE_ENV`.

Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL`, `FROM_NAME`, `BUSINESS_OWNER_EMAIL`, `USE_ETHEREAL`.

Calendar (OAuth): `GOOGLE_CALENDAR_SYNC_ENABLED`, `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_AUTH_MODE=oauth`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `INTEGRATION_ENCRYPTION_KEY`.

Payments: Intuit mock/live vars in `.env.example`. Circle seats never use Intuit.

Connect Calendar with `POST /oauth/google_calendar/authorize` (admin). Callback: `/oauth/callback/google_calendar`.

## Scheduling (MST)

Timezone is the literal string `"MST"` (UTC-7, no DST). Google Calendar events use `America/Phoenix` because that IANA zone is MST year-round.

- 1:1 bookable window: Monday–Friday, 9:00 AM–5:00 PM MST
- Minimum lead time and cancel/reschedule cutoff: 24 hours
- Pending 1:1 bookings hold the slot (409 on overlap)
- Published circle flyers add an availability exception so 1:1 cannot overlap that window
- Circle registrations share the flyer time and do not 409 each other

## Booking modes

`Service.bookingMode`:

- `appointment` — 1:1 scheduler (`POST /appointments`). Stays `pending` until the owner Accept/Deny email. Accept writes a Google Calendar event for that session and emails the customer an Intuit checkout link. Deny frees the slot.
- `inquire` — Sistership Circle. Not bookable on `POST /appointments`. Seats use `POST /flyers/{id}/register`.

## Circles

- One published flyer at a time (`GET /flyers/current`, admin `POST/PATCH /admin/flyers`).
- Register confirms the seat immediately (`states: confirmed`, `kind: circle`, `paymentMethod: in_person`). No checkout token. Pay in person at the event.
- One Google Calendar event per flyer. Description lists name, email, and phone from the form plus “Pay in person at the event.” Registrants are added as Google invitees.
- Unpublishing keeps that calendar event while seats remain. The event is removed when no seats are left (cancelled or never reserved).
- Changing flyer dates updates linked circle appointments and the calendar event.

## Payments

- 1:1: `POST /payments/intuit/checkout-session` after Accept. Mock unless live Intuit is configured.
- Circles: in person only. Checkout for a circle appointment returns 400.

## Data model (high level)

See `prisma/schema.prisma` for fields. Notable: `Service.bookingMode`; `Appointment.kind` (`session` | `circle`), `quotedAmount`, `circleFlyerId`; `CircleFlyer` (`eventStart`/`eventEnd`, `price` as in-person amount, `calendarEventId`).

## Commands

```bash
npm run dev
npm test
npx prisma migrate dev
npx prisma generate
npx prisma db seed
```

Email operator notes: [`EMAIL_IMPLEMENTATION.md`](./EMAIL_IMPLEMENTATION.md).
