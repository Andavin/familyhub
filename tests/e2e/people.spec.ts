import { test, expect } from '@playwright/test';
import { login } from './setup';

test.describe('people', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/people');
	});

	test('lists seeded people', async ({ page }) => {
		await expect(page.getByText('Mark', { exact: true })).toBeVisible();
		await expect(page.getByText('Partner', { exact: true })).toBeVisible();
		await expect(page.getByText('Kid', { exact: true })).toBeVisible();
	});

	test('add a new person and a personal list', async ({ page }) => {
		await page.getByTestId('add-user').click();
		// Open the picker, switch to the People tab, choose 👵
		await page.getByTestId('emoji-trigger').click();
		await page.getByRole('tab', { name: 'People' }).click();
		await page.getByTestId('emoji-👵').click();
		await page.getByTestId('user-name-input').fill('Grandma');
		await page.getByTestId('user-save').click();

		await expect(page.getByText('Grandma', { exact: true })).toBeVisible();

		// Their personal list should now show as a column on the dashboard
		await page.goto('/');
		await expect(page.getByText("Grandma's Tasks")).toBeVisible();
	});
});
