import { invalidateAll } from '$app/navigation';
import type { Task } from './server/schema';

/**
 * Shared "complete this task" flow used by both the tasks board and the
 * calendar day view.
 *
 * If the task carries an `assigneeId`, the API call goes out immediately
 * with that user as the completer. If the task is unassigned, we stash it
 * on `pending` so the caller can render the CompletedByModal, then post
 * once the user picks. Uncomplete always passes straight through — the
 * server clears `completedBy` regardless.
 */
export class CompletionFlow {
	pending = $state<Task | null>(null);

	private post = async (t: Task, done: boolean, completedById: number | null) => {
		await fetch(`/api/tasks/${t.id}/complete`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				action: done ? 'complete' : 'uncomplete',
				completedById
			})
		});
		await invalidateAll();
	};

	/** Wire as the `onComplete` callback on a row. */
	start = async (t: Task, done: boolean): Promise<void> => {
		if (done && t.assigneeId === null) {
			this.pending = t;
			return;
		}
		await this.post(t, done, t.assigneeId);
	};

	/** Wire as `onpick` on the CompletedByModal. */
	pickCompletedBy = async (userId: number): Promise<void> => {
		const t = this.pending;
		this.pending = null;
		if (t) await this.post(t, true, userId);
	};

	/** Wire as `oncancel` on the CompletedByModal. */
	cancelPicker = (): void => {
		this.pending = null;
	};
}
