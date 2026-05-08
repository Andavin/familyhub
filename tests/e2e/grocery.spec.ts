import { test, expect } from '@playwright/test';
import { login } from './setup';

test.describe('grocery', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/grocery');
	});

	test('add an item and see it categorized', async ({ page }) => {
		const input = page.getByTestId('grocery-add-input');
		await input.fill('Whole Milk');
		await input.press('Enter');

		await expect(page.getByText('Whole Milk')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Dairy & Eggs' })).toBeVisible();
	});

	test('check item and it moves to Completed section', async ({ page }) => {
		const input = page.getByTestId('grocery-add-input');
		await input.fill('Bananas');
		await input.press('Enter');

		const row = page.getByText('Bananas').locator('xpath=ancestor::div[contains(@class, "row")]');
		await row.getByRole('button', { name: /Check off/i }).click();

		await expect(page.getByRole('heading', { name: 'Completed' })).toBeVisible();
	});
});
