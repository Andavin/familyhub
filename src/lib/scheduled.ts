import type { Task } from '$lib/server/schema';
import { isOverdue } from '$lib/format';

/**
 * Build the "Scheduled" list for one column.
 *
 * Combines two sources:
 *  - `listOpen` — non-completed tasks already in this list, kept only when
 *    they have a future `dueAt` (overdue items surface in Today instead).
 *  - `projected` — server-projected next occurrences for overdue recurring
 *    tasks in this list (see `+page.server.ts > projectedRecurring`).
 *
 * Dedup rule: any task id that has a projected row is excluded from the
 * `listOpen` half. The projected row is the canonical "next occurrence"
 * preview, and pairing it with the original row produces duplicate keys
 * in the `{#each ... as task (task.id)}` block — which Svelte rejects
 * with an `each_key_duplicate` runtime error.
 *
 * The dedup matters because server-side and client-side `isOverdue` can
 * disagree for date-only tasks when the runtimes are in different
 * timezones (UTC Docker server vs. the user's local-tz browser). In the
 * window where the server already sees the task as overdue but the
 * browser still sees the local day as in progress, the server emits a
 * projection AND the browser keeps the original — collision.
 */
export function buildScheduled<
	T extends Pick<Task, 'id' | 'dueAt' | 'dueHasTime'>
>(listOpen: T[], projected: T[]): T[] {
	const projectedIds = new Set(projected.map((t) => t.id));
	return [
		...listOpen.filter(
			(t) =>
				t.dueAt &&
				!projectedIds.has(t.id) &&
				!isOverdue(new Date(t.dueAt), t.dueHasTime)
		),
		...projected
	];
}
