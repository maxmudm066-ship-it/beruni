import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * SQLite resolves relative paths against the process CWD, which differs between the
 * Prisma CLI and the Next.js runtime, so the URL is pinned to an absolute file here.
 * Kept statically scoped: Turbopack traces a dynamic path.resolve() back to the whole project.
 * Production targets PostgreSQL, where DATABASE_URL is used verbatim.
 */
export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  if (!raw.startsWith('file:')) return raw;
  const candidate = raw.slice('file:'.length);
  return path.isAbsolute(candidate) ? raw : `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`;
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
  return new PrismaClient({ adapter, log: ['warn', 'error'] });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
