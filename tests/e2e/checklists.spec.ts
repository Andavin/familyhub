import { test, expect } from '@playwright/test';
import { login } from './setup';

test.describe('checklists', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/checklists');
	});

	test('lists seeded checklists', async ({ page }) => {
		await expect(page.getByText('Pre-Trip', { exact: true })).toBeVisible();
		await expect(page.getByText('Saturday Reset', { exact: true })).toBeVisible();
	});

	test('create a new checklist', async ({ page }) => {
		await page.getByTestId('new-checklist').click();
		await page.getByPlaceholder('Checklist name').fill('Test Checklist');
		await page.getByPlaceholder('Task title').first().fill('Test task one');
		await page.getByTestId('save-checklist').click();

		await expect(page.getByText('Test Checklist')).toBeVisible({ timeout: 5000 });
	});

	test('back arrow navigates to /', async ({ page }) => {
		await page.getByTestId('back-to-tasks').click();
		await expect(page).toHaveURL('http://localhost:4173/');
		await expect(page.getByTestId('board')).toBeVisible();
	});

	test('Manage link inside Apply modal opens /checklists', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('open-checklists').click();
		await page.getByTestId('manage-checklists').click();
		await expect(page).toHaveURL(/\/checklists$/);
	});
});
