#!/usr/bin/env node
/*
 * Standalone visual regression snapshot script.
 *
 * Usage (from repo root):
 *   node scripts/visual-snapshot.mjs                # writes to .screenshots/baseline
 *   OUT_DIR=.screenshots/upgraded node scripts/visual-snapshot.mjs
 *
 * Spawns its own preview server against a throwaway sqlite database
 * (`./data/visual.db`) so the regular test/dev DBs are untouched.
 * Captures every main route at desktop / tablet / phone viewports.
 *
 * Pair before/after by running once on the baseline branch state, then
 * again post-upgrade with a different OUT_DIR.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const OUT_DIR = resolve(process.env.OUT_DIR ?? '.screenshots/baseline');
const DB_PATH = resolve('./data/visual.db');
const PORT = Number(process.env.PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'letmein';

const ROUTES = [
	{ name: 'login', path: '/login', requireAuth: false },
	{ name: 'tasks', path: '/', requireAuth: true },
	{ name: 'calendar', path: '/calendar', requireAuth: true },
	{ name: 'grocery', path: '/grocery', requireAuth: true },
	{ name: 'checklists', path: '/checklists', requireAuth: true },
	{ name: 'people', path: '/people', requireAuth: true }
];

const VIEWPORTS = [
	{ name: 'desktop', width: 1440, height: 900 },
	{ name: 'tablet', width: 1180, height: 820 },
	{ name: 'phone', width: 430, height: 932 }
];

async function waitForServer(url, timeoutMs = 120_000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.ok || res.status === 302) return;
		} catch {
			// not up yet
		}
		await sleep(500);
	}
	throw new Error(`server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function resetDb() {
	for (const suffix of ['', '-shm', '-wal']) {
		const p = DB_PATH + suffix;
		if (existsSync(p)) rmSync(p);
	}
	await new Promise((res, rej) => {
		const p = spawn('pnpm', ['run', 'db:reset'], {
			stdio: 'inherit',
			env: { ...process.env, DATABASE_URL: DB_PATH }
		});
		p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`db:reset exited ${code}`))));
	});
}

async function build() {
	await new Promise((res, rej) => {
		const p = spawn('pnpm', ['run', 'build'], { stdio: 'inherit' });
		p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`build exited ${code}`))));
	});
}

function startPreview() {
	// Call vite directly so we control --port — `pnpm run preview` hardcodes
	// 4173 in package.json and uses the first --port, ignoring overrides.
	return spawn(
		'pnpm',
		['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT)],
		{
			env: {
				...process.env,
				DATABASE_URL: DB_PATH,
				FAMILY_PASSWORD: PASSWORD
			},
			stdio: ['ignore', 'inherit', 'inherit']
		}
	);
}

async function captureAll() {
	mkdirSync(OUT_DIR, { recursive: true });
	const browser = await chromium.launch();

	for (const vp of VIEWPORTS) {
		const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
		const page = await ctx.newPage();

		// Login once per viewport (separate storage state each time).
		await page.goto(`${BASE_URL}/login`);
		await page.getByPlaceholder('Password').fill(PASSWORD);
		await page.getByRole('button', { name: 'Sign In' }).click();
		await page.waitForURL((url) => !url.pathname.startsWith('/login'));

		for (const route of ROUTES) {
			if (!route.requireAuth && route.name === 'login') {
				// Re-capture login in a fresh context so we shoot the form, not a redirect.
				const fresh = await browser.newContext({
					viewport: { width: vp.width, height: vp.height }
				});
				const freshPage = await fresh.newPage();
				await freshPage.goto(`${BASE_URL}${route.path}`);
				await freshPage.waitForLoadState('networkidle').catch(() => {});
				await freshPage.screenshot({
					path: `${OUT_DIR}/${vp.name}_${route.name}.png`,
					fullPage: true
				});
				await fresh.close();
				continue;
			}
			await page.goto(`${BASE_URL}${route.path}`);
			await page.waitForLoadState('networkidle').catch(() => {});
			// Give animations / fonts a moment to settle.
			await sleep(400);
			await page.screenshot({
				path: `${OUT_DIR}/${vp.name}_${route.name}.png`,
				fullPage: true
			});
			console.log(`captured ${vp.name}/${route.name}`);
		}

		await ctx.close();
	}

	await browser.close();
}

async function main() {
	console.log(`writing screenshots to ${OUT_DIR}`);
	if (process.env.SKIP_BUILD) {
		console.log('1/4 skipping build (SKIP_BUILD set)');
	} else {
		console.log('1/4 building app…');
		await build();
	}
	if (process.env.SKIP_DB_RESET) {
		console.log('2/4 skipping db:reset (SKIP_DB_RESET set)');
	} else {
		console.log('2/4 resetting visual.db…');
		await resetDb();
	}
	console.log('3/4 starting preview server…');
	const server = startPreview();
	const killServer = () => {
		try {
			server.kill('SIGTERM');
		} catch {
			// already gone
		}
	};
	process.on('exit', killServer);
	process.on('SIGINT', () => {
		killServer();
		process.exit(130);
	});
	try {
		await waitForServer(`${BASE_URL}/login`);
		console.log('4/4 capturing screenshots…');
		await captureAll();
		console.log('done.');
	} finally {
		killServer();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
