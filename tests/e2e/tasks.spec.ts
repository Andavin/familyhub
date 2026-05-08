import { test, expect } from '@playwright/test';
import { login } from './setup';

test.describe('tasks', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('multi-column board renders one column per user', async ({ page }) => {
		const columns = page.getByTestId(/^column-/);
		await expect(columns.first()).toBeVisible();
		const count = await columns.count();
		expect(count).toBeGreaterThanOrEqual(3);
	});

	test('add a task and complete it', async ({ page }) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const input = firstCol.getByTestId('add-task-input');
		await input.fill('Buy birthday cake');
		await input.press('Enter');

		await expect(firstCol.getByText('Buy birthday cake')).toBeVisible();

		// Click checkbox to complete — task should disappear from "open" list after invalidation.
		const row = firstCol.locator('[data-testid="task-row"]', { hasText: 'Buy birthday cake' });
		const checkbox = row.getByRole('button', { name: /Mark .* complete/i });
		await checkbox.click();

		// After invalidation the task is filtered out (we don't show completed by default).
		await expect(firstCol.getByText('Buy birthday cake')).toHaveCount(0, { timeout: 5000 });
	});

	test('apply template adds tasks across columns', async ({ page }) => {
		await page.getByTestId('open-templates').click();
		const button = page.getByTestId(/^apply-template-/).first();
		await button.click();

		// modal closes, toast appears
		await expect(page.getByText(/Added \d+ tasks?/)).toBeVisible({ timeout: 5000 });

		// at least one of the seeded pre-trip items should now be visible somewhere
		await expect(
			page
				.getByText(/Pack chargers|Pack toiletries|Empty trash|Vacuum living room/)
				.first()
		).toBeVisible();
	});
});
