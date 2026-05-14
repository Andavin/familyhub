import type { Locator, Page } from '@playwright/test';

export const PASSWORD = 'letmein';

export async function login(page: Page) {
	await page.goto('/login');
	await page.getByPlaceholder('Password').fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign In' }).click();
	await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/**
 * Click a task row's complete checkbox.
 *
 * By default, if the task is unassigned and the "Who completed this?"
 * modal opens, the helper auto-selects the first user. Tests that don't
 * care *who* completed the task can stay terse this way.
 *
 * Pass `{ autoSelectCompletedBy: false }` when the test is actually
 * exercising the modal (asserting it appears, who it lists, cancel /
 * Escape behavior, or which user it records).
 *
 * Note on the role name: the aria-label on the checkbox is literally
 * `Mark "<title>" complete` — "Mark" is the imperative verb, not the
 * name of the seeded user (who is "Alex").
 */
export async function completeRow(
	page: Page,
	row: Locator,
	options: { autoSelectCompletedBy?: boolean } = {}
) {
	const { autoSelectCompletedBy = true } = options;
	await row.getByRole('button', { name: /Mark .* complete/i }).click();
	if (!autoSelectCompletedBy) return;
	const firstChoice = page.locator('[data-testid^="completed-by-"]').first();
	if (await firstChoice.isVisible({ timeout: 300 }).catch(() => false)) {
		await firstChoice.click();
	}
}
