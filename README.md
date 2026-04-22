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

## Test Commands

```bash
npm test
npm run test:watch
npm run test:coverage
```

