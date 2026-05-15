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

		// Within the undo window the entry surfaces an "undo" checkbox
		// rather than a re-add affordance.
		await expect(page.getByText('Purchased')).toBeVisible();
		await expect(page.getByRole('button', { name: /Undo purchase of Bananas/i })).toBeVisible();
	});

	test('undo button in Purchased section within window restores the item', async ({ page }) => {
		const input = page.getByTestId('grocery-add-input');
		await input.fill('Yogurt');
		await input.press('Enter');

		const row = page.locator('[data-testid^="grocery-row-"]', { hasText: 'Yogurt' });
		await row.getByRole('button', { name: /Mark Yogurt purchased/i }).click();

		// Active row gone, Purchased entry now shows an undo checkbox.
		await expect(row).toHaveCount(0);
		await page.getByRole('button', { name: /Undo purchase of Yogurt/i }).click();

		// Restored to the active list; the undo affordance is gone (the
		// purchase row was deleted as part of undo).
		await expect(page.locator('[data-testid^="grocery-row-"]', { hasText: 'Yogurt' })).toHaveCount(1);
		await expect(page.getByRole('button', { name: /Undo purchase of Yogurt/i })).toHaveCount(0);
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
		await expect(page.getByTestId('grocery-store-picker-list').getByRole('button', { name: /Costco/ })).toBeVisible();
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

	test('adding the same name+store on the active list bumps amount and toasts', async ({
		page
	}) => {
		const input = page.getByTestId('grocery-add-input');
		await input.fill('Apples');
		await input.press('Enter');

		const row = page.locator('[data-testid^="grocery-row-"]', { hasText: 'Apples' });
		await expect(row).toHaveCount(1);

		// Same name + same store (Unassigned in both cases) → bump amount.
		await input.fill('Apples');
		await input.press('Enter');
		// Toast has a fixed 2.4s lifetime — assert it first so we don't
		// miss it while waiting on the row to repaint after invalidateAll.
		await expect(page.getByTestId('grocery-toast')).toBeVisible();
		await expect(row).toHaveCount(1);
		await expect(row).toContainText('× 2');
	});

	test('amount stepper applies the input amount on add', async ({ page }) => {
		const input = page.getByTestId('grocery-add-input');
		await input.fill('Carrots');
		await page.getByRole('button', { name: 'Increase amount' }).click();
		await page.getByRole('button', { name: 'Increase amount' }).click();
		await expect(page.getByTestId('grocery-add-amount')).toHaveText('3');
		await input.press('Enter');

		const row = page.locator('[data-testid^="grocery-row-"]', { hasText: 'Carrots' });
		await expect(row).toContainText('× 3');
		// Stepper resets to 1 after add.
		await expect(page.getByTestId('grocery-add-amount')).toHaveText('1');
	});

	test('edit modal delete button confirms and removes the row', async ({ page }) => {
		const input = page.getByTestId('grocery-add-input');
		await input.fill('Lettuce');
		await input.press('Enter');

		const row = page.locator('[data-testid^="grocery-row-"]', { hasText: 'Lettuce' });
		await row.getByRole('button', { name: /Edit Lettuce/ }).click();
		await page.getByTestId('grocery-edit-delete').click();
		await expect(page.getByRole('alertdialog')).toBeVisible();
		await page.getByTestId('confirm-ok').click();

		await expect(row).toHaveCount(0);
	});

	test('store filter chip narrows the active list and Purchased to one store', async ({
		page
	}) => {
		// Unique store names so prior tests' Costco etc. don't collide
		// with these assertions (DB is shared across the suite).
		const storeA = 'FilterTestA';
		const storeB = 'FilterTestB';
		await page.getByTestId('manage-stores').click();
		const stores = page.getByRole('dialog', { name: 'Stores' });
		const nameInput = stores.getByLabel('New store name');
		await nameInput.fill(storeA);
		await stores.getByTestId('add-store').click();
		await expect(stores.getByText(storeA, { exact: true })).toBeVisible();
		await nameInput.fill(storeB);
		await stores.getByTestId('add-store').click();
		await expect(stores.getByText(storeB, { exact: true })).toBeVisible();
		await stores.getByRole('button', { name: 'Close' }).click();

		const picker = page.getByTestId('grocery-add-store');
		const addInput = page.getByTestId('grocery-add-input');
		const pickerList = page.getByTestId('grocery-store-picker-list');

		await picker.click();
		await pickerList.getByRole('button', { name: new RegExp(storeA) }).click();
		await addInput.fill('Cheese');
		await addInput.press('Enter');
		await expect(page.locator('[data-testid^="grocery-row-"]', { hasText: 'Cheese' })).toHaveCount(1);

		await picker.click();
		await pickerList.getByRole('button', { name: new RegExp(storeB) }).click();
		await addInput.fill('Tortillas');
		await addInput.press('Enter');
		await expect(
			page.locator('[data-testid^="grocery-row-"]', { hasText: 'Tortillas' })
		).toHaveCount(1);

		// Filter to storeA: Cheese visible, Tortillas hidden.
		await page
			.locator('button[data-testid^="store-chip-"]')
			.filter({ hasText: storeA })
			.click();
		await expect(page.locator('[data-testid^="grocery-row-"]', { hasText: 'Cheese' })).toHaveCount(1);
		await expect(
			page.locator('[data-testid^="grocery-row-"]', { hasText: 'Tortillas' })
		).toHaveCount(0);
	});

	test('Purchased keeps separate entries when the same item is bought at different stores', async ({
		page
	}) => {
		const storeA = 'DedupTestA';
		const storeB = 'DedupTestB';
		await page.getByTestId('manage-stores').click();
		const stores = page.getByRole('dialog', { name: 'Stores' });
		const nameInput = stores.getByLabel('New store name');
		await nameInput.fill(storeA);
		await stores.getByTestId('add-store').click();
		await expect(stores.getByText(storeA, { exact: true })).toBeVisible();
		await nameInput.fill(storeB);
		await stores.getByTestId('add-store').click();
		await expect(stores.getByText(storeB, { exact: true })).toBeVisible();
		await stores.getByRole('button', { name: 'Close' }).click();

		const picker = page.getByTestId('grocery-add-store');
		const addInput = page.getByTestId('grocery-add-input');
		const pickerList = page.getByTestId('grocery-store-picker-list');

		// "ShareItem" at storeA, purchase it.
		await picker.click();
		await pickerList.getByRole('button', { name: new RegExp(storeA) }).click();
		await addInput.fill('ShareItem');
		await addInput.press('Enter');
		await page
			.locator('[data-testid^="grocery-row-"]', { hasText: 'ShareItem' })
			.getByRole('button', { name: /Mark ShareItem purchased/i })
			.click();
		// Same name at storeB, purchase it too.
		await picker.click();
		await pickerList.getByRole('button', { name: new RegExp(storeB) }).click();
		await addInput.fill('ShareItem');
		await addInput.press('Enter');
		await page
			.locator('[data-testid^="grocery-row-"]', { hasText: 'ShareItem' })
			.getByRole('button', { name: /Mark ShareItem purchased/i })
			.click();

		// Two distinct purchased entries — one per store.
		await expect(
			page.locator('[data-testid^="recent-row-"]', { hasText: 'ShareItem' })
		).toHaveCount(2);
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
