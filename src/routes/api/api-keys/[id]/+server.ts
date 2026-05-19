import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { apiKeys } from '$lib/server/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { apiError } from '$lib/server/api-error';

/**
 * Revoke an API key. Soft-delete via `revokedAt = now` so the audit
 * trail (when it existed, when it was last used) survives — we only
 * stop accepting it for new requests. Re-revoking a key returns the
 * already-revoked row unchanged.
 */
export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');

	const [row] = await db
		.update(apiKeys)
		.set({ revokedAt: new Date() })
		.where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
		.returning();
	if (!row) {
		// Either no such id or already revoked. Either way, idempotent
		// 200 — the caller's intent ("this key should be dead") is now
		// satisfied regardless of which case applied.
		return json({ ok: true });
	}
	return json({ ok: true });
};
