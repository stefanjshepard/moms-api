import dotenv from 'dotenv';

dotenv.config();

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Never inherit sandbox/live payment mode from the developer .env.
process.env.INTUIT_PAYMENT_MODE = 'mock';

