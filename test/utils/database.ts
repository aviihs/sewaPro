import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/infrastructure/prisma/generated/client.js';

/** Tables that are never truncated (migration history, PostGIS reference data). */
const KEEP = new Set(['_prisma_migrations', 'spatial_ref_sys']);

export function createTestPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('_test')) {
    throw new Error(`Refusing to run e2e tests against a non-test database: ${url}`);
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
}

/** Empties every application table in the test database. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const tables = rows.map((r) => r.tablename).filter((name) => !KEEP.has(name));
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
