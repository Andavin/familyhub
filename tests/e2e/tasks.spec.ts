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
