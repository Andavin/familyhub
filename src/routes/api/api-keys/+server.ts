import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { apiKeys, users } from '$lib/server/schema';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { apiError } from '$lib/server/api-error';
import { generateApiKey } from '$lib/server/api-keys';

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
 * and shouldn't clutter the UI. `?userId=N` filters to one user's keys
 * (use `?userId=null` or omit the param + `?shared=1` for shared keys).
 */
export const GET: RequestHandler = async ({ url }) => {
	const userIdParam = url.searchParams.get('userId');
	const shared = url.searchParams.get('shared') === '1';

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
		const [u] = await db.select().from(users).where(eq(users.id, body.userId)).limit(1);
		if (!u) apiError(400, 'userId does not match a known user');
		userId = body.userId;
	}

	const { plaintext, keyHash, prefix } = generateApiKey();
	const [row] = await db
		.insert(apiKeys)
		.values({ name, keyHash, prefix, userId })
		.returning();

	return json({ ...toListed(row), plaintext }, { status: 201 });
};
