import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Must resolve to the same absolute file as src/lib/db.ts, or the CLI and the app
// would silently work against two different SQLite databases.
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  if (!raw.startsWith('file:')) return raw;
  const candidate = raw.slice('file:'.length);
  return path.isAbsolute(candidate) ? raw : `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: resolveDatabaseUrl(),
  },
});
