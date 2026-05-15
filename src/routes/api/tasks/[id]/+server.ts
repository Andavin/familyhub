import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { tasks, lists } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { getOrCreateInbox, firstOwnedList, INBOX_SYSTEM } from '$lib/server/inbox';
import { setTaskTags } from '$lib/server/tags';
import { apiError } from '$lib/server/api-error';

function parseDate(value: unknown, field: string): Date | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') {
		apiError(400, `${field} must be an ISO-8601 string or null`);
	}
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) {
		apiError(400, `${field} is not a valid ISO-8601 timestamp`);
	}
	return d;
}

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	const body = (await request.json().catch(() => ({}))) as Partial<{
		title: string;
		notes: string | null;
		assigneeId: number | null;
		listId: number;
		dueAt: string | null;
		dueHasTime: boolean;
		rrule: string | null;
		recurFromCompletion: boolean;
		priority: number;
		sortOrder: number;
		tagIds: number[];
	}>;

	if (
		body.priority !== undefined &&
		(!Number.isInteger(body.priority) || body.priority < 0 || body.priority > 3)
	) {
		apiError(400, 'priority must be 0, 1, 2, or 3');
	}
	if (body.tagIds !== undefined && !Array.isArray(body.tagIds)) {
		apiError(400, 'tagIds must be an array of numbers');
	}

	const [existing] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
	if (!existing) apiError(404, 'not found');

	const update: Record<string, unknown> = { updatedAt: new Date() };
	if ('title' in body) update.title = body.title;
	if ('notes' in body) update.notes = body.notes;
	if ('assigneeId' in body) update.assigneeId = body.assigneeId;
	if ('listId' in body) update.listId = body.listId;
	if ('dueAt' in body) update.dueAt = parseDate(body.dueAt, 'dueAt');
	if ('dueHasTime' in body) update.dueHasTime = body.dueHasTime;
	if ('rrule' in body) update.rrule = body.rrule;
	if ('recurFromCompletion' in body) update.recurFromCompletion = !!body.recurFromCompletion;
	if ('priority' in body) update.priority = body.priority;
	if ('sortOrder' in body) update.sortOrder = body.sortOrder;

	// Auto-route between Unassigned inbox and a person's list when the
	// caller changed the assignee without intentionally moving the task to a
	// different list. (The detail modal always sends listId in the body, so
	// we compare against the task's current list instead of "is listId set".)
	if ('assigneeId' in body) {
		const newAssigneeId = body.assigneeId ?? null;
		const assigneeChanged = newAssigneeId !== existing.assigneeId;
		const explicitListChange =
			'listId' in body && body.listId !== undefined && body.listId !== existing.listId;

		if (assigneeChanged && !explicitListChange) {
			const targetListId = (update.listId as number | undefined) ?? existing.listId;
			const [currentList] = await db
				.select()
				.from(lists)
				.where(eq(lists.id, targetListId))
				.limit(1);

			if (newAssigneeId === null) {
				if (currentList && currentList.ownerId !== null) {
					const inbox = await getOrCreateInbox();
					update.listId = inbox.id;
				}
			} else {
				if (currentList && currentList.system === INBOX_SYSTEM) {
					const target = await firstOwnedList(newAssigneeId);
					if (target) update.listId = target.id;
				}
			}
		}
	}

	const [row] = await db.update(tasks).set(update).where(eq(tasks.id, id)).returning();
	if (!row) apiError(404, 'not found');

	if (Array.isArray(body.tagIds)) {
		await setTaskTags(id, body.tagIds);
	}

	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!Number.isFinite(id)) apiError(400, 'invalid id');
	await db.delete(tasks).where(eq(tasks.id, id));
	return json({ ok: true });
};
