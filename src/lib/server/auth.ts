import { db } from './db';
import { sessions } from './schema';
import { eq, lt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

const SESSION_TTL_DAYS = 60;
export const SESSION_COOKIE = 'fh_session';

export function familyPassword(): string {
	const pw = process.env.FAMILY_PASSWORD;
	if (!pw) {
		throw new Error(
			'FAMILY_PASSWORD environment variable must be set. ' +
				'See .env.example for the expected shape.'
		);
	}
	return pw;
}

/**
 * Failed-login tracker, per client IP, in process memory. Resets on
 * server restart; that's fine — a brute-forcer who has to restart the
 * server first has bigger problems.
 *
 * Window: count failures inside MAX_WINDOW_MS. Hitting MAX_FAILS within
 * the window locks the IP out until the window closes.
 */
const MAX_FAILS = 10;
const MAX_WINDOW_MS = 15 * 60_000;
// Sweep expired buckets when the Map crosses this size. Keeps memory
// bounded against an adversary trying to grow it forever by hitting
// /api/login from a fresh IP each time.
const SWEEP_AT_SIZE = 1024;
type Bucket = { count: number; firstAt: number };
const failedLogins = new Map<string, Bucket>();

export type LoginRateLimit = { allowed: true } | { allowed: false; retryAfterSec: number };

function sweepExpired(now: number): void {
	for (const [ip, rec] of failedLogins) {
		if (now - rec.firstAt > MAX_WINDOW_MS) failedLogins.delete(ip);
	}
}

export function checkLoginRateLimit(ip: string, now = Date.now()): LoginRateLimit {
	const rec = failedLogins.get(ip);
	if (!rec) return { allowed: true };
	if (now - rec.firstAt > MAX_WINDOW_MS) {
		failedLogins.delete(ip);
		return { allowed: true };
	}
	if (rec.count >= MAX_FAILS) {
		return {
			allowed: false,
			retryAfterSec: Math.max(1, Math.ceil((rec.firstAt + MAX_WINDOW_MS - now) / 1000))
		};
	}
	return { allowed: true };
}

export function recordLoginFailure(ip: string, now = Date.now()): void {
	if (failedLogins.size >= SWEEP_AT_SIZE) sweepExpired(now);
	const rec = failedLogins.get(ip);
	if (!rec || now - rec.firstAt > MAX_WINDOW_MS) {
		failedLogins.set(ip, { count: 1, firstAt: now });
	} else {
		rec.count++;
	}
}

export function clearLoginFailures(ip: string): void {
	failedLogins.delete(ip);
}

/** Test-only: reset the entire counter map. */
export function _resetLoginRateLimit(): void {
	failedLogins.clear();
}

export async function createSession(): Promise<string> {
	const id = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
	await db.insert(sessions).values({ id, expiresAt });
	return id;
}

export async function validateSession(id: string | undefined): Promise<boolean> {
	if (!id) return false;
	const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
	if (!row) return false;
	if (row.expiresAt.getTime() < Date.now()) {
		await db.delete(sessions).where(eq(sessions.id, id));
		return false;
	}
	return true;
}

export async function deleteSession(id: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, id));
}

export async function purgeExpired(): Promise<void> {
	await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
