import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { apiKeys, type ApiKey } from './schema';

const TOKEN_PREFIX = 'fh_';
const TOKEN_RANDOM_BYTES = 32; // 32 bytes → 43 base64url chars → ~256 bits entropy
const DISPLAY_PREFIX_CHARS = 12; // e.g. "fh_a1b2c3d4e" — enough to disambiguate in the UI
// Throttle last_used_at writes per key: one update per minute of activity is
// plenty for "when did you last use this?" UX and avoids a DB write on every
// request when a sync runs in a tight loop.
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

/**
 * Generate a fresh API key. Returns the plaintext alongside the storage
 * fields. The plaintext is **only available here** — callers must hand
 * it to the user immediately; we never persist it.
 */
export function generateApiKey(): { plaintext: string; keyHash: string; prefix: string } {
	const random = randomBytes(TOKEN_RANDOM_BYTES).toString('base64url');
	const plaintext = TOKEN_PREFIX + random;
	const keyHash = sha256(plaintext);
	const prefix = plaintext.slice(0, DISPLAY_PREFIX_CHARS);
	return { plaintext, keyHash, prefix };
}

function sha256(s: string): string {
	return createHash('sha256').update(s).digest('hex');
}

/**
 * Pull the bearer token out of an `Authorization` header. Returns null
 * if the header is missing or doesn't follow the `Bearer <token>` shape.
 */
export function extractBearerToken(header: string | null): string | null {
	if (!header) return null;
	const match = header.match(/^Bearer\s+(.+)$/i);
	if (!match) return null;
	const token = match[1].trim();
	return token.length > 0 ? token : null;
}

/**
 * Look up an API key by its plaintext. Returns the row if it exists and
 * hasn't been revoked, otherwise null. Caller decides what to do on null
 * (almost always: 401).
 *
 * The B-tree index lookup isn't literally constant-time, but the token
 * is a 256-bit CSPRNG output — an attacker can't construct two inputs
 * that probe specific tree paths, so any timing variation in the lookup
 * carries no information they could use to enumerate keys.
 */
export async function findApiKey(plaintext: string): Promise<ApiKey | null> {
	const keyHash = sha256(plaintext);
	const rows = await db
		.select()
		.from(apiKeys)
		.where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
		.limit(1);
	return rows[0] ?? null;
}

// Per-key memo of the last `lastUsedAt` write. Throttles DB writes to
// LAST_USED_WRITE_INTERVAL_MS without needing a cron sweep.
const lastUsedMemo = new Map<number, number>();

/**
 * Record that a key was just used. Throttled — at most one write per
 * LAST_USED_WRITE_INTERVAL_MS per key. Auth has already succeeded by the
 * time this runs, so DB hiccups must not fail the request: we catch and
 * log, and only stamp the in-memory throttle once the write has actually
 * landed. Stamping the memo *before* the write would let a transient
 * SQLite error block retries for the full window.
 */
export function touchApiKey(keyId: number, now: number = Date.now()): void {
	const last = lastUsedMemo.get(keyId) ?? 0;
	if (now - last < LAST_USED_WRITE_INTERVAL_MS) return;
	try {
		db.update(apiKeys)
			.set({ lastUsedAt: new Date(now) })
			.where(eq(apiKeys.id, keyId))
			.run();
		lastUsedMemo.set(keyId, now);
	} catch (err) {
		console.error('[api-keys] touchApiKey failed', { keyId, err });
	}
}
