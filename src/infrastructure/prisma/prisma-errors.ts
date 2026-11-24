import { Prisma } from './generated/client.js';

/** Unique constraint violation (P2002), optionally on a specific constraint/field. */
export function isUniqueViolation(error: unknown, target?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  if (target === undefined) return true;
  return JSON.stringify(error.meta ?? {}).includes(target);
}

/** Foreign key violation (P2003). */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/** PostgreSQL exclusion constraint violation (SQLSTATE 23P01), e.g. booking overlap. */
export function isExclusionViolation(error: unknown, constraint: string): boolean {
  return error instanceof Error && error.message.includes(constraint);
}
