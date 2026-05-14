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
