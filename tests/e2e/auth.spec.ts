import { test, expect } from '@playwright/test';
import { login, PASSWORD } from './setup';

test('redirects unauthenticated to login', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('rejects wrong password', async ({ page }) => {
	await page.goto('/login');
	await page.getByPlaceholder('Password').fill('nope');
	await page.getByRole('button', { name: 'Sign In' }).click();
	await expect(page.getByText('Wrong password')).toBeVisible();
});

test('accepts correct password and shows dashboard', async ({ page }) => {
	await login(page);
	await expect(page.getByTestId('board')).toBeVisible();
});
