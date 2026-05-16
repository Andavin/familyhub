/*
 * Standalone migration runner used by the Docker entrypoint.
 *
 * Equivalent to `src/lib/server/migrate.ts` but written as plain ESM
 * JavaScript so it can run with just the production `node_modules`
 * tree (better-sqlite3 + drizzle-orm) and no `tsx` / TypeScript
 * tooling in the runtime image.
 *
 * The src/-side script is kept around for local dev (`pnpm tsx
 * src/lib/server/migrate.ts`) — they read the same `drizzle/`
 * migrations folder, so the two stay in sync trivially.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const dbUrl = process.env.DATABASE_URL ?? './data/familyhub.db';
const dbPath = resolve(dbUrl);
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: './drizzle' });
sqlite.close();
console.log('migrations applied');
