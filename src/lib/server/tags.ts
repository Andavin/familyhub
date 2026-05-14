import { db } from './db';
import { tags, taskTags, checklistTags, type Tag } from './schema';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Normalize tag display names to a canonical lookup key. Stored values
 * use this form so `#Cleaning` and `#cleaning` resolve to the same tag.
 * Trims whitespace, strips a leading `#`, and lowercases.
 */
export function normalizeTagName(raw: string): string {
	return raw.trim().replace(/^#+/, '').toLowerCase();
}

export async function listTags(): Promise<Tag[]> {
	return db.select().from(tags).orderBy(tags.name);
}

/**
 * Find a tag by canonical name, creating it if missing. Used by the
 * inline "+ create" affordance on the picker.
 */
export async function getOrCreateTag(rawName: string): Promise<Tag | null> {
	const name = normalizeTagName(rawName);
	if (!name) return null;
	const [existing] = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
	if (existing) return existing;
	const [created] = await db.insert(tags).values({ name }).returning();
	return created;
}

export async function renameTag(id: number, rawName: string): Promise<Tag | null> {
	const name = normalizeTagName(rawName);
	if (!name) return null;
	const [updated] = await db.update(tags).set({ name }).where(eq(tags.id, id)).returning();
	return updated ?? null;
}

export async function deleteTag(id: number): Promise<void> {
	await db.delete(tags).where(eq(tags.id, id));
}

/**
 * Replace the full tag set on a task. Easier reasoning than diff +
 * upsert + delete at the call site — the join table is small.
 *
 * Filters `tagIds` through `tagsExist` first so an arbitrary API
 * client can't FK-error the whole request by passing an unknown ID.
 * Unknown IDs are silently dropped.
 */
export async function setTaskTags(taskId: number, tagIds: number[]): Promise<void> {
	await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
	if (tagIds.length === 0) return;
	const valid = await tagsExist(tagIds);
	if (valid.length === 0) return;
	await db.insert(taskTags).values(valid.map((tagId) => ({ taskId, tagId })));
}

/**
 * Load every task→tag pairing as a `taskId → tagId[]` map. Page loads
 * use this to attach tags to tasks client-side without N+1 queries.
 */
export async function loadTaskTagMap(): Promise<Record<number, number[]>> {
	const rows = await db.select().from(taskTags);
	const out: Record<number, number[]> = {};
	for (const r of rows) {
		(out[r.taskId] ??= []).push(r.tagId);
	}
	return out;
}

export async function setChecklistTags(checklistId: number, tagIds: number[]): Promise<void> {
	await db.delete(checklistTags).where(eq(checklistTags.checklistId, checklistId));
	if (tagIds.length === 0) return;
	const valid = await tagsExist(tagIds);
	if (valid.length === 0) return;
	await db.insert(checklistTags).values(valid.map((tagId) => ({ checklistId, tagId })));
}

export async function loadChecklistTagMap(): Promise<Record<number, number[]>> {
	const rows = await db.select().from(checklistTags);
	const out: Record<number, number[]> = {};
	for (const r of rows) {
		(out[r.checklistId] ??= []).push(r.tagId);
	}
	return out;
}

export async function getChecklistTagIds(checklistId: number): Promise<number[]> {
	const rows = await db
		.select({ tagId: checklistTags.tagId })
		.from(checklistTags)
		.where(eq(checklistTags.checklistId, checklistId));
	return rows.map((r) => r.tagId);
}

export async function tagsExist(ids: number[]): Promise<number[]> {
	if (ids.length === 0) return [];
	const rows = await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, ids));
	return rows.map((r) => r.id);
}

export { and };
