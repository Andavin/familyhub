import { test, expect } from '@playwright/test';
import { login } from './setup';

test.describe('grocery', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/grocery');
	});

	test('adds an item to the Unassigned group when no stores exist', async ({ page }) => {
		const input = page.getByTestId('grocery-add-input');
		await input.fill('Whole Milk');
		await input.press('Enter');

		await expect(page.getByText('Whole Milk')).toBeVisible();
		await expect(page.getByRole('heading', { level: 1, name: 'Groceries' })).toBeVisible();
		// In a clean DB with no stores yet, the new item falls into Unassigned.
		await expect(page.getByText('Unassigned')).toBeVisible();
	});

	test('check-off moves the row into the Purchased section', async ({ page }) => {
		const input = page.getByTestId('grocery-add-input');
		await input.fill('Bananas');
		await input.press('Enter');

		const row = page.getByText('Bananas').locator('xpath=ancestor::div[contains(@class, "row")]');
		await row.getByRole('button', { name: /Mark Bananas purchased/i }).click();

		await expect(page.getByText('Purchased')).toBeVisible();
		// The recent-purchase entry is tappable to re-add.
		await expect(page.getByRole('button', { name: /Bananas/ })).toBeVisible();
	});

	test('Manage Stores creates a store available in the picker', async ({ page }) => {
		await page.getByTestId('manage-stores').click();
		const dialog = page.getByRole('dialog', { name: 'Stores' });
		await dialog.getByLabel('New store name').fill('Costco');
		await dialog.getByTestId('add-store').click();
		// Modal stays open after add — the new store should appear in
		// the same dialog without needing to close + reopen.
		await expect(dialog.getByText('Costco')).toBeVisible();
		await dialog.getByRole('button', { name: 'Close' }).click();

		await page.getByTestId('grocery-add-store').click();
		await expect(page.getByRole('button', { name: /Costco/ })).toBeVisible();
	});

	test('Delete store asks via modal, not browser confirm', async ({ page }) => {
		await page.getByTestId('manage-stores').click();
		const dialog = page.getByRole('dialog', { name: 'Stores' });
		await dialog.getByLabel('New store name').fill('Sprouts');
		await dialog.getByTestId('add-store').click();
		await expect(dialog.getByText('Sprouts')).toBeVisible();

		const sproutsRow = dialog
			.locator('li')
			.filter({ hasText: 'Sprouts' });
		await sproutsRow.getByRole('button', { name: 'Delete' }).click();

		// Stacked confirm — distinct from browser confirm() popup.
		await expect(page.getByRole('alertdialog')).toBeVisible();
		await page.getByTestId('confirm-ok').click();

		// Stores dialog stays open; the row is gone.
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText('Sprouts')).toHaveCount(0);
	});

	test('adding the same item twice within the undo window flips it back', async ({ page }) => {
		const input = page.getByTestId('grocery-add-input');
		await input.fill('Eggs');
		await input.press('Enter');

		const row = page.getByText('Eggs').locator('xpath=ancestor::div[contains(@class, "row")]');
		await row.getByRole('button', { name: /Mark Eggs purchased/i }).click();
		await expect(page.getByText('Purchased')).toBeVisible();

		// Typing the same name within 4h should restore the row, not
		// create a duplicate.
		await input.fill('Eggs');
		await input.press('Enter');

		const rows = page.locator('[data-testid^="grocery-row-"]', { hasText: 'Eggs' });
		await expect(rows).toHaveCount(1);
	});
});
