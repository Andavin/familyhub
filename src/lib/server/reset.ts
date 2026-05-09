// Wipes the SQLite file, applies the current schema via drizzle-kit push, then seeds.
// Use this whenever the schema changes during dev — no migrations to manage.
import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const dbUrl = process.env.DATABASE_URL ?? './data/familyhub.db';
const dbPath = resolve(dbUrl);

for (const suffix of ['', '-shm', '-wal']) {
	const p = dbPath + suffix;
	if (existsSync(p)) {
		rmSync(p);
		console.log('removed', p);
	}
}

console.log('applying schema with drizzle-kit push…');
execSync('pnpm exec drizzle-kit push --force', {
	stdio: 'inherit',
	env: { ...process.env, DATABASE_URL: dbUrl }
});

console.log('seeding…');
execSync('pnpm exec tsx src/lib/server/seed.ts', {
	stdio: 'inherit',
	env: { ...process.env, DATABASE_URL: dbUrl }
});

console.log('done.');
