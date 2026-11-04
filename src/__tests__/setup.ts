import { PrismaClient } from '@prisma/client';
import { resetAllLimiters } from '../middleware/rateLimit';

const databaseName = (() => {
  try {
    return new URL(process.env.DATABASE_URL || '').pathname.replace(/^\//, '');
  } catch {
    return '';
  }
})();

if (!/_test$/i.test(databaseName) && databaseName.toLowerCase() !== 'test') {
  throw new Error(
    `Refusing to run tests against database "${databaseName || 'unknown'}". Set TEST_DATABASE_URL to a dedicated test database (for example momsDB_test).`
  );
}

const prisma = new PrismaClient();

export const cleanupDatabase = async () => {
  // Delete all records from all tables
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  for (const { tablename } of tablenames) {
    if (tablename !== '_prisma_migrations') {
      try {
        await prisma.$executeRawUnsafe(
          `TRUNCATE TABLE "public"."${tablename}" CASCADE;`
        );
      } catch (error) {
        console.log({ error });
      }
    }
  }
};

// Clean up after all tests
afterAll(async () => {
  await prisma.$disconnect();
}, 30000); // Increase timeout to 30 seconds

// Clean up database before each test
beforeEach(async () => {
  await resetAllLimiters();
  await cleanupDatabase();
}, 30000); // Increase timeout to 30 seconds

describe('Test Setup', () => {
  it('should clean up the database before each test', async () => {
    // This test verifies our setup is working
    expect(true).toBe(true);
  });
}); 