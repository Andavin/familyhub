import { test, expect } from '@playwright/test';
import { login } from './setup';

test.describe('tasks', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('multi-column board renders one column per list', async ({ page }) => {
		const columns = page.getByTestId(/^column-/);
		await expect(columns.first()).toBeVisible();
		const count = await columns.count();
		expect(count).toBeGreaterThanOrEqual(3);
	});

	test('add a task, complete it, expand Completed, uncomplete it', async ({ page }) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		const input = firstCol.getByTestId('add-task-input');
		await input.fill('Buy birthday cake');
		await input.press('Enter');
		await expect(firstCol.getByText('Buy birthday cake')).toBeVisible();

		// Complete — disappears from open
		const row = firstCol.locator('[data-testid="task-row"]', { hasText: 'Buy birthday cake' });
		await row.getByRole('button', { name: /Mark .* complete/i }).click();
		await expect(firstCol.locator('[data-testid="task-row"]', { hasText: 'Buy birthday cake' }).first()).toHaveCount(0, { timeout: 5000 });

		// Completed section should appear with count >= 1; expand it
		await firstCol.getByTestId(`toggle-completed-${listId}`).click();
		await expect(firstCol.getByText('Buy birthday cake')).toBeVisible();

		// Uncomplete via the checkbox in completed section
		const doneRow = firstCol.locator('[data-testid="task-row"]', { hasText: 'Buy birthday cake' });
		await doneRow.getByRole('button', { name: /Mark .* incomplete/i }).click();

		// Should reappear in open section
		await expect(firstCol.getByText('Buy birthday cake')).toBeVisible();
	});

	test('apply checklist adds tasks across columns', async ({ page }) => {
		await page.getByTestId('open-checklists').click();
		const button = page.getByTestId(/^apply-checklist-/).first();
		await button.click();

		await expect(page.getByText(/Added \d+ tasks?/)).toBeVisible({ timeout: 5000 });

		await expect(
			page
				.getByText(/Pack chargers|Pack toiletries|Empty trash|Vacuum living room/)
				.first()
		).toBeVisible();
	});

	test('add a new list and it appears as a column', async ({ page }) => {
		const before = await page.getByTestId(/^column-/).count();
		await page.getByTestId('add-list').click();
		await page.getByTestId('list-name-input').fill('Vacation Prep');
		await page.getByTestId('list-save').click();

		await expect(page.getByText('Vacation Prep')).toBeVisible();
		const after = await page.getByTestId(/^column-/).count();
		expect(after).toBe(before + 1);
	});

	test('open task detail and save edits (notes + priority)', async ({ page }) => {
		// Add a fresh task
		const firstCol = page.getByTestId(/^column-/).first();
		const input = firstCol.getByTestId('add-task-input');
		await input.fill('Detail test task');
		await input.press('Enter');
		await expect(firstCol.getByText('Detail test task')).toBeVisible();

		// Tap title to open detail
		const row = firstCol.locator('[data-testid="task-row"]', { hasText: 'Detail test task' });
		await row.getByRole('button', { name: 'Open task details' }).click();

		// Modal opens, title input prepopulated
		await expect(page.getByTestId('task-title-input')).toHaveValue('Detail test task');

		// Set priority !!
		await page.getByTestId('priority-2').click();

		await page.getByTestId('task-save').click();

		// !! prefix should appear on the row
		await expect(firstCol.getByText('!!').first()).toBeVisible();
	});

	test('future-due hidden from Today, today-due shows in both Today and Scheduled', async ({
		page
	}) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		const future = new Date(Date.now() + 7 * 86_400_000);
		const todayDue = new Date();
		todayDue.setHours(15, 0, 0, 0);

		await page.evaluate(
			async ([lid, futureIso, todayIso]) => {
				await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ listId: Number(lid), title: 'Future task', dueAt: futureIso })
				});
				await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ listId: Number(lid), title: 'Today thing', dueAt: todayIso })
				});
			},
			[listId, future.toISOString(), todayDue.toISOString()]
		);

		await page.reload();
		await page.waitForLoadState('networkidle');

		// Future task only appears once Scheduled is expanded.
		await expect(firstCol.getByText('Future task')).toHaveCount(0);
		// Today-due task is visible in the main (Today) area immediately.
		await expect(firstCol.getByText('Today thing')).toBeVisible();

		await firstCol.getByTestId(`toggle-scheduled-${listId}`).click();

		// Both tasks now visible in the column (the today-due appears twice).
		await expect(firstCol.getByText('Future task')).toBeVisible();
		await expect(firstCol.getByText('Today thing')).toHaveCount(2);
	});

	test('overdue tasks appear in Today only, not in Scheduled', async ({ page }) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		// Create an overdue (yesterday-due-with-time) task
		const yesterday = new Date(Date.now() - 86_400_000);
		yesterday.setHours(9, 0, 0, 0);
		await page.evaluate(
			async ([lid, iso]) => {
				await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						listId: Number(lid),
						title: 'Overdue thing',
						dueAt: iso
					})
				});
				// PATCH to set dueHasTime since POST doesn't accept it
				const tasks = await fetch('/api/tasks').then((r) => r.json());
				const t = (tasks as { id: number; title: string }[]).find((x) => x.title === 'Overdue thing');
				if (t) {
					await fetch(`/api/tasks/${t.id}`, {
						method: 'PATCH',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ dueHasTime: true })
					});
				}
			},
			[listId, yesterday.toISOString()]
		);

		await page.reload();
		await page.waitForLoadState('networkidle');

		// Visible in Today (with overdue pill) — only one row, no duplicate in Scheduled
		await expect(firstCol.getByText('Overdue thing')).toHaveCount(1);
		await expect(firstCol.getByText('Overdue').first()).toBeVisible();

		// If a Scheduled toggle exists, expanding it should NOT reveal Overdue thing
		const scheduledToggle = firstCol.getByTestId(`toggle-scheduled-${listId}`);
		if ((await scheduledToggle.count()) > 0) {
			await scheduledToggle.click();
			await expect(firstCol.getByText('Overdue thing')).toHaveCount(1);
		}
	});

	test('overdue recurring task: overdue in Today, next occurrence projected into Scheduled', async ({
		page
	}) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		// Recurring weekly task whose current dueAt is in the past
		const yesterday = new Date(Date.now() - 86_400_000);
		yesterday.setHours(9, 0, 0, 0);
		await page.evaluate(
			async ([lid, iso]) => {
				const r = await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						listId: Number(lid),
						title: 'Overdue weekly',
						dueAt: iso,
						rrule: 'FREQ=WEEKLY'
					})
				});
				const j = await r.json();
				await fetch(`/api/tasks/${j.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ dueHasTime: true })
				});
			},
			[listId, yesterday.toISOString()]
		);

		await page.reload();
		await page.waitForLoadState('networkidle');

		// Today section shows the overdue instance
		const allRows = firstCol.locator('[data-testid="task-row"]', {
			hasText: 'Overdue weekly'
		});
		await expect(allRows).toHaveCount(1);
		await expect(firstCol.getByText('Overdue').first()).toBeVisible();

		// Expand Scheduled — projected next instance shows here too
		await firstCol.getByTestId(`toggle-scheduled-${listId}`).click();
		await expect(allRows).toHaveCount(2);
	});

	test('complete + uncomplete on a recurring task does not accumulate spawns', async ({
		page
	}) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		// Create a recurring weekly task due today
		const today = new Date();
		today.setHours(9, 0, 0, 0);
		await page.evaluate(
			async ([lid, iso]) => {
				await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						listId: Number(lid),
						title: 'Weekly chore',
						dueAt: iso,
						rrule: 'FREQ=WEEKLY'
					})
				});
			},
			[listId, today.toISOString()]
		);

		await page.reload();
		await page.waitForLoadState('networkidle');

		// Today-due tasks also appear in Scheduled (per current model), so
		// initial count in the column is 2 with all sections collapsed.
		const allRows = firstCol.locator('[data-testid="task-row"]', {
			hasText: 'Weekly chore'
		});
		await expect(allRows).toHaveCount(1); // sections collapsed → only Today area shows it

		// Complete it. Recurring complete advances dueAt to next week.
		const row = allRows.first();
		await row.getByRole('button', { name: /Mark .* complete/i }).click();

		// Today section no longer shows it (task moved to next week).
		await expect(allRows).toHaveCount(0, { timeout: 5000 });

		// Scheduled section now contains the same task with the advanced dueAt.
		await firstCol.getByTestId(`toggle-scheduled-${listId}`).click();
		await expect(allRows).toHaveCount(1);

		// Completed section has the completion log entry.
		await firstCol.getByTestId(`toggle-completed-${listId}`).click();
		// Tap the "incomplete" checkbox in the Completed entry to rewind.
		await firstCol
			.getByRole('button', { name: /Mark "Weekly chore" incomplete/i })
			.click();

		// After uncomplete: dueAt rewound to today. The task appears in Today
		// AND in the still-expanded Scheduled section (date-bound). Completed
		// section vanishes (no completion log). Total = 2 rows.
		await expect(allRows).toHaveCount(2, { timeout: 5000 });

		// And critically, *only one* underlying task exists — verify by API.
		const apiCount = await page.evaluate(async () => {
			const rows = await fetch('/api/tasks').then((r) => r.json());
			return (rows as { title: string }[]).filter((r) => r.title === 'Weekly chore').length;
		});
		expect(apiCount).toBe(1);
	});

	test('completing a recurring task twice advances twice (no surprise rewind)', async ({
		page
	}) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		const today = new Date();
		today.setHours(9, 0, 0, 0);
		await page.evaluate(
			async ([lid, iso]) => {
				await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						listId: Number(lid),
						title: 'Twice-completed chore',
						dueAt: iso,
						rrule: 'FREQ=WEEKLY'
					})
				});
			},
			[listId, today.toISOString()]
		);
		await page.reload();

		// First completion: dueAt advances to next week (one log entry exists).
		const allRows = firstCol.locator('[data-testid="task-row"]', {
			hasText: 'Twice-completed chore'
		});
		await allRows
			.first()
			.getByRole('button', { name: /Mark "Twice-completed chore" complete/i })
			.click();
		// Wait for state to settle: row disappears from Today
		await expect(allRows).toHaveCount(0, { timeout: 5000 });

		// Open Scheduled — the same task now appears with dueAt = +7d.
		await firstCol.getByTestId(`toggle-scheduled-${listId}`).click();
		await expect(allRows).toHaveCount(1);

		// Second completion: tap the empty circle on the Scheduled row.
		// This MUST advance to +14d, not rewind to today.
		await allRows
			.first()
			.getByRole('button', { name: /Mark "Twice-completed chore" complete/i })
			.click();

		// dueAt should now be 14 days from today
		const due = await page.evaluate(async () => {
			const rows = await fetch('/api/tasks').then((r) => r.json());
			return (rows as { title: string; dueAt: string }[]).find(
				(r) => r.title === 'Twice-completed chore'
			)?.dueAt;
		});
		expect(due).toBeTruthy();
		const delta = new Date(due as string).getTime() - Date.now();
		const days = delta / 86_400_000;
		expect(days).toBeGreaterThan(13);
		expect(days).toBeLessThan(15);
	});

	test('skip-this-occurrence on a recurring task advances dueAt without logging', async ({
		page
	}) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		const today = new Date();
		today.setHours(9, 0, 0, 0);
		const created = await page.evaluate(
			async ([lid, iso]) => {
				const r = await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						listId: Number(lid),
						title: 'Skippable chore',
						dueAt: iso,
						rrule: 'FREQ=WEEKLY'
					})
				});
				return r.json();
			},
			[listId, today.toISOString()]
		);
		await page.reload();

		const row = firstCol.locator('[data-testid="task-row"]', { hasText: 'Skippable chore' });
		await row.first().getByRole('button', { name: 'Open task details' }).click();

		// Tap Delete on a recurring task → 3-action dialog
		await page.getByTestId('task-delete').click();
		await expect(page.getByTestId('skip-occurrence')).toBeVisible();
		await expect(page.getByTestId('delete-series')).toBeVisible();

		const skipResp = page.waitForResponse((r) =>
			/\/api\/tasks\/\d+\/skip$/.test(r.url())
		);
		await page.getByTestId('skip-occurrence').click();
		await skipResp;

		// dueAt advanced to next week, no completion was logged
		const state = await page.evaluate(async (id) => {
			const t = await fetch('/api/tasks').then((r) => r.json());
			const found = (t as { id: number; title: string; dueAt: string }[]).find(
				(x) => x.id === id
			);
			return { found, count: (t as { title: string }[]).filter((x) => x.title === 'Skippable chore').length };
		}, created.id);
		expect(state.count).toBe(1);
		expect(state.found).toBeTruthy();
		const days = (new Date(state.found!.dueAt).getTime() - Date.now()) / 86_400_000;
		expect(days).toBeGreaterThan(6);
		expect(days).toBeLessThan(8);
	});

	test('delete-entire-series removes row but keeps completion history', async ({ page }) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		const today = new Date();
		today.setHours(9, 0, 0, 0);
		const created = await page.evaluate(
			async ([lid, iso]) => {
				const r = await fetch('/api/tasks', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						listId: Number(lid),
						title: 'Doomed chore',
						dueAt: iso,
						rrule: 'FREQ=WEEKLY'
					})
				});
				return r.json();
			},
			[listId, today.toISOString()]
		);

		// Complete it once so a completion log entry exists.
		await page.evaluate(async (id) => {
			await fetch(`/api/tasks/${id}/complete`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'complete' })
			});
		}, created.id);

		await page.reload();

		// History entry visible in Completed
		await firstCol.getByTestId(`toggle-completed-${listId}`).click();
		await expect(firstCol.getByText('Doomed chore')).toBeVisible();

		// Open Scheduled, then delete the series
		await firstCol.getByTestId(`toggle-scheduled-${listId}`).click();
		const row = firstCol.locator('[data-testid="task-row"]', { hasText: 'Doomed chore' });
		await row.first().getByRole('button', { name: 'Open task details' }).click();
		await page.getByTestId('task-delete').click();
		await page.getByTestId('delete-series').click();

		// The series no longer exists — verify via API that no active task
		// has this title anymore.
		const apiCount = await page.evaluate(async () => {
			const rows = await fetch('/api/tasks').then((r) => r.json());
			return (rows as { title: string }[]).filter((r) => r.title === 'Doomed chore').length;
		});
		expect(apiCount).toBe(0);

		// But the completion history entry (orphan) is still rendered in Completed.
		await page.reload();
		await firstCol.getByTestId(`toggle-completed-${listId}`).click();
		await expect(firstCol.getByText('Doomed chore')).toBeVisible();
	});

	test('delete from detail modal asks for confirmation', async ({ page }) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const input = firstCol.getByTestId('add-task-input');
		await input.fill('Will be deleted');
		await input.press('Enter');
		await expect(firstCol.getByText('Will be deleted')).toBeVisible();

		const row = firstCol.locator('[data-testid="task-row"]', { hasText: 'Will be deleted' });
		await row.getByRole('button', { name: 'Open task details' }).click();

		await page.getByTestId('task-delete').click();
		// Confirm dialog appears
		await expect(page.getByText('Delete this task?')).toBeVisible();

		// Cancel keeps the confirm-only state; detail modal remains open behind it.
		await page.getByTestId('confirm-cancel').click();
		await expect(page.getByText('Delete this task?')).toBeHidden();

		// Click Delete again (detail modal is still open) and confirm
		await page.getByTestId('task-delete').click();
		await page.getByTestId('confirm-ok').click();
		await expect(
			firstCol.locator('[data-testid="task-row"]', { hasText: 'Will be deleted' })
		).toHaveCount(0, { timeout: 5000 });
	});
});
