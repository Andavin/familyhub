import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { apiKeys, users } from '$lib/server/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { apiError } from '$lib/server/api-error';
import { generateApiKey } from '$lib/server/api-keys';
import { broadcast } from '$lib/server/events';

const MAX_NAME_LEN = 80;

/**
 * The client-safe row shape — excludes `keyHash`. The plaintext is only
 * present on the POST response and only once.
 */
type ListedApiKey = {
	id: number;
	name: string;
	prefix: string;
	userId: number | null;
	createdAt: Date;
	lastUsedAt: Date | null;
};

function toListed(row: typeof apiKeys.$inferSelect): ListedApiKey {
	return {
		id: row.id,
		name: row.name,
		prefix: row.prefix,
		userId: row.userId,
		createdAt: row.createdAt,
		lastUsedAt: row.lastUsedAt
	};
}

/**
 * List API keys. Revoked keys are excluded — once revoked, a key is dead
 * and shouldn't clutter the UI. `?userId=N` filters to one user's keys;
 * `?shared=1` returns only shared keys (those with no associated user).
 * The two filters are mutually exclusive — combining them is a client
 * mistake we surface as 400 rather than picking one silently.
 */
export const GET: RequestHandler = async ({ url }) => {
	const userIdParam = url.searchParams.get('userId');
	const shared = url.searchParams.get('shared') === '1';

	if (shared && userIdParam !== null) {
		apiError(400, 'shared=1 cannot be combined with userId');
	}

	const conditions = [isNull(apiKeys.revokedAt)];
	if (shared) {
		conditions.push(isNull(apiKeys.userId));
	} else if (userIdParam !== null) {
		const n = Number(userIdParam);
		if (!Number.isInteger(n)) apiError(400, 'userId must be an integer');
		conditions.push(eq(apiKeys.userId, n));
	}

	const rows = await db
		.select()
		.from(apiKeys)
		.where(and(...conditions))
		.orderBy(desc(apiKeys.createdAt), asc(apiKeys.id));
	return json(rows.map(toListed));
};

/**
 * Create an API key. The plaintext is returned exactly once in the
 * response body under `plaintext` — the caller must hand it to the user
 * immediately. After this response no one can retrieve the secret again;
 * a lost key has to be revoked and recreated.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		userId?: number | null;
	};
	const name = body.name?.trim();
	if (!name) apiError(400, 'name required');
	if (name.length > MAX_NAME_LEN) apiError(400, `name must be ${MAX_NAME_LEN} chars or fewer`);

	let userId: number | null = null;
	if (body.userId !== undefined && body.userId !== null) {
		if (!Number.isInteger(body.userId)) apiError(400, 'userId must be an integer');
		userId = body.userId;
	}

	const { plaintext, keyHash, prefix } = generateApiKey();

	// Verify the user still exists and insert in the same transaction so
	// a concurrent delete can't leave a dangling reference. The FK has
	// `onDelete: 'cascade'` as a backstop, but doing the check inside the
	// txn lets us return a clear 400 instead of a 500 from the cascade.
	const insertedUserId = userId;
	const row = db.transaction((tx) => {
		if (insertedUserId !== null) {
			const [u] = tx
				.select()
				.from(users)
				.where(eq(users.id, insertedUserId))
				.limit(1)
				.all();
			if (!u) apiError(400, 'userId does not match a known user');
		}
		const [r] = tx
			.insert(apiKeys)
			.values({ name, keyHash, prefix, userId: insertedUserId })
			.returning()
			.all();
		return r;
	});

	broadcast('api-keys');
	return json({ ...toListed(row), plaintext }, { status: 201 });
};
