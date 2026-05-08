import { test, expect } from '@playwright/test';
import { login } from './setup';

test.describe('templates', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/templates');
	});

	test('lists seeded templates', async ({ page }) => {
		await expect(page.getByText('Pre-Trip Checklist', { exact: true })).toBeVisible();
		await expect(page.getByText('Saturday Reset', { exact: true })).toBeVisible();
	});

	test('create a new template', async ({ page }) => {
		await page.getByTestId('new-template').click();
		await page.getByPlaceholder('Template name').fill('Test Checklist');
		await page.getByPlaceholder('Task title').first().fill('Test task one');
		await page.getByTestId('save-template').click();

		await expect(page.getByText('Test Checklist')).toBeVisible({ timeout: 5000 });
	});
});
