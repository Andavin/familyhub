import { test, expect } from '@playwright/test';
import { completeRow, login } from './setup';

/**
 * Dedicated coverage for the "who completed this?" flow:
 *   - assigned task → no modal, completedBy auto-fills to the assignee
 *   - unassigned task → modal appears, can be cancelled, can be
 *     dismissed with Escape, and picking a user records that user
 *
 * We assert against the API rather than the DOM since the board UI
 * doesn't currently display the recorded `completedBy` anywhere — the
 * field is metadata for future streak/counter features.
 */
test.describe('completed-by attribution', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('assigned task → no modal, completedBy auto-fills to assignee', async ({ page }) => {
		const { id, assigneeId } = await page.evaluate(async () => {
			const lists = await fetch('/api/lists').then((r) => r.json());
			const owned = lists.find((l: { ownerId: number | null }) => l.ownerId !== null);
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					listId: owned.id,
					title: 'Assigned attribution',
					assigneeId: owned.ownerId
				})
			});
			const task = await res.json();
			return { id: task.id as number, assigneeId: task.assigneeId as number };
		});

		await page.goto('/');
		const row = page.locator('[data-testid="task-row"]', { hasText: 'Assigned attribution' });
		await row.getByRole('button', { name: /Mark .* complete/i }).click();
		// No modal should appear.
		await expect(page.locator('[data-testid^="completed-by-"]')).toHaveCount(0);

		// Row disappears from the open column.
		await expect(row).toHaveCount(0, { timeout: 5000 });

		// And the persisted record shows the assignee as the completer.
		const persisted = await page.evaluate(async (taskId) => {
			const rows = await fetch('/api/tasks?includeCompleted=true').then((r) => r.json());
			return (rows as { id: number; completedBy: number | null }[]).find(
				(r) => r.id === taskId
			);
		}, id);
		expect(persisted?.completedBy).toBe(assigneeId);
	});

	test('unassigned task → modal lists all users; picking one records that user', async ({
		page
	}) => {
		const { id, users } = await page.evaluate(async () => {
			const lists = await fetch('/api/lists').then((r) => r.json());
			const inbox = lists.find((l: { system: string }) => l.system === 'inbox');
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ listId: inbox.id, title: 'Unassigned attribution' })
			});
			const task = await res.json();
			const u = await fetch('/api/users').then((r) => r.json());
			return { id: task.id as number, users: u as { id: number; name: string }[] };
		});

		await page.goto('/');
		const row = page.locator('[data-testid="task-row"]', {
			hasText: 'Unassigned attribution'
		});
		await completeRow(page, row, { autoSelectCompletedBy: false });

		// Modal appears with a tile for every seeded user.
		for (const u of users) {
			await expect(page.getByTestId(`completed-by-${u.id}`)).toBeVisible();
		}

		// Pick the second user — not the alphabetical-first — to prove
		// the recorded value really comes from what we clicked.
		const picked = users[1] ?? users[0];
		await page.getByTestId(`completed-by-${picked.id}`).click();

		const persisted = await page.evaluate(async (taskId) => {
			const rows = await fetch('/api/tasks?includeCompleted=true').then((r) => r.json());
			return (rows as { id: number; completedBy: number | null }[]).find(
				(r) => r.id === taskId
			);
		}, id);
		expect(persisted?.completedBy).toBe(picked.id);
	});

	test('Cancel button dismisses without completing', async ({ page }) => {
		const id = await page.evaluate(async () => {
			const lists = await fetch('/api/lists').then((r) => r.json());
			const inbox = lists.find((l: { system: string }) => l.system === 'inbox');
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ listId: inbox.id, title: 'Cancel attribution' })
			});
			return ((await res.json()) as { id: number }).id;
		});

		await page.goto('/');
		const row = page.locator('[data-testid="task-row"]', { hasText: 'Cancel attribution' });
		await completeRow(page, row, { autoSelectCompletedBy: false });

		// The modal owns the only "Cancel" button (the row's checkbox
		// also matches `name: 'Cancel'` because the task is titled
		// "Cancel attribution", so we scope to the dialog).
		await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
		// Task stays open.
		await expect(row).toBeVisible();
		const persisted = await page.evaluate(async (taskId) => {
			const rows = await fetch('/api/tasks?includeCompleted=true').then((r) => r.json());
			return (rows as { id: number; completedAt: string | null }[]).find(
				(r) => r.id === taskId
			);
		}, id);
		expect(persisted?.completedAt).toBeNull();
	});

	test('Escape dismisses the modal without completing', async ({ page }) => {
		const id = await page.evaluate(async () => {
			const lists = await fetch('/api/lists').then((r) => r.json());
			const inbox = lists.find((l: { system: string }) => l.system === 'inbox');
			const res = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ listId: inbox.id, title: 'Escape attribution' })
			});
			return ((await res.json()) as { id: number }).id;
		});

		await page.goto('/');
		const row = page.locator('[data-testid="task-row"]', { hasText: 'Escape attribution' });
		await completeRow(page, row, { autoSelectCompletedBy: false });

		// The first user tile gets focus on open; pressing Escape on it
		// should bubble up to the modal's keydown handler.
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-testid^="completed-by-"]')).toHaveCount(0);
		await expect(row).toBeVisible();

		const persisted = await page.evaluate(async (taskId) => {
			const rows = await fetch('/api/tasks?includeCompleted=true').then((r) => r.json());
			return (rows as { id: number; completedAt: string | null }[]).find(
				(r) => r.id === taskId
			);
		}, id);
		expect(persisted?.completedAt).toBeNull();
	});
});
