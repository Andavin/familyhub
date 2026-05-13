import type { Locator, Page } from '@playwright/test';

export const PASSWORD = 'letmein';

export async function login(page: Page) {
	await page.goto('/login');
	await page.getByPlaceholder('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/**
 * Click a task row's complete checkbox. If the task is unassigned, the
 * "Who completed this?" modal will pop — silence it by picking the first
 * user. Tests that don't care about who completed it should use this
 * instead of clicking the checkbox directly.
 */
export async function completeRow(page: Page, row: Locator) {
	await row.getByRole('button', { name: /Mark .* complete/i }).click();
	const firstChoice = page.locator('[data-testid^="completed-by-"]').first();
	if (await firstChoice.isVisible({ timeout: 300 }).catch(() => false)) {
		await firstChoice.click();
	}
}
