import { test, expect } from '@playwright/test';
import { login } from './setup';

test.describe('calendar', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('renders month grid with 42 cells', async ({ page }) => {
		await page.goto('/calendar');
		const cells = page.getByTestId(/^cal-day-/);
		await expect(cells.first()).toBeVisible();
		const count = await cells.count();
		expect(count).toBe(42);
	});

	test('shows reminders for tasks with due dates', async ({ page }) => {
		// First create a task with a due date for today via API
		const today = new Date();
		today.setHours(15, 0, 0, 0);
		await page.evaluate(async (iso) => {
			const lists = await fetch('/api/lists').then((r) => r.json());
			const firstList = lists[0];
			await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					listId: firstList.id,
					title: 'Calendar Test Task',
					dueAt: iso
				})
			});
		}, today.toISOString());

		await page.goto('/calendar');
		await expect(page.getByText('Calendar Test Task').first()).toBeVisible();
	});

	test('navigate to next month and back', async ({ page }) => {
		await page.goto('/calendar');
		await page.getByRole('button', { name: 'Next month' }).click();
		await expect(page).toHaveURL(/\/calendar\?month=/);
		await page.getByRole('button', { name: 'Today' }).click();
		await expect(page).toHaveURL('/calendar');
	});

	test('completing from day-detail moves task to Completed section', async ({ page }) => {
		const today = new Date();
		today.setHours(15, 0, 0, 0);
		await page.evaluate(async (iso) => {
			const lists = await fetch('/api/lists').then((r) => r.json());
			await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					listId: lists[0].id,
					title: 'Calendar complete test',
					dueAt: iso
				})
			});
		}, today.toISOString());

		await page.goto('/calendar');
		const dayList = page.getByTestId('day-list');
		await expect(dayList.getByText('Calendar complete test')).toBeVisible();

		const row = dayList.locator('div.task-line', { hasText: 'Calendar complete test' });
		await row.getByRole('button', { name: /Mark .* complete/i }).click();
		await expect(dayList.getByText('Calendar complete test')).toHaveCount(0, { timeout: 5000 });

		await page.getByTestId('cal-toggle-completed').click();
		await expect(page.getByText('Calendar complete test')).toBeVisible();
	});
});
