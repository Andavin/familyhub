import type { Page } from '@playwright/test';

export const PASSWORD = 'letmein';

export async function login(page: Page) {
	await page.goto('/login');
	await page.getByPlaceholder('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}
