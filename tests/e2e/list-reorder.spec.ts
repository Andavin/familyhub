import { test, expect } from '@playwright/test';
import { login } from './setup';

/**
 * Move buttons (‹ / ›) live on every column header next to the edit (⋯)
 * button. Every list is reorderable, including the inbox — its
 * `system='inbox'` marker only protects delete + list-picker exclusion,
 * not ordering. Edge columns get the appropriate button disabled.
 */
test.describe('list reorder', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('every column has both move buttons (inbox included)', async ({ page }) => {
		const cols = page.getByTestId(/^column-/);
		const count = await cols.count();
		for (let i = 0; i < count; i++) {
			const col = cols.nth(i);
			const id = (await col.getAttribute('data-testid'))!.split('-')[1];
			await expect(page.getByTestId(`move-list-left-${id}`)).toHaveCount(1);
			await expect(page.getByTestId(`move-list-right-${id}`)).toHaveCount(1);
		}
	});

	test("first column's left button is disabled; last column's right button is disabled", async ({
		page
	}) => {
		const cols = page.getByTestId(/^column-/);
		const count = await cols.count();
		test.skip(count < 2, 'seed has fewer than two lists');

		const firstId = (await cols.first().getAttribute('data-testid'))!.split('-')[1];
		const lastId = (await cols.nth(count - 1).getAttribute('data-testid'))!.split('-')[1];

		await expect(page.getByTestId(`move-list-left-${firstId}`)).toBeDisabled();
		await expect(page.getByTestId(`move-list-right-${firstId}`)).toBeEnabled();
		await expect(page.getByTestId(`move-list-right-${lastId}`)).toBeDisabled();
		await expect(page.getByTestId(`move-list-left-${lastId}`)).toBeEnabled();
	});

	test('moving a column right swaps it with the next column', async ({ page }) => {
		const titlesBefore = await page.locator('.col-title').allInnerTexts();
		test.skip(titlesBefore.length < 2, 'seed has fewer than two lists');

		const firstCol = page.getByTestId(/^column-/).first();
		const id = (await firstCol.getAttribute('data-testid'))!.split('-')[1];
		await page.getByTestId(`move-list-right-${id}`).click();

		await expect.poll(async () => {
			const titles = await page.locator('.col-title').allInnerTexts();
			return titles[1];
		}).toBe(titlesBefore[0]);

		const titlesAfter = await page.locator('.col-title').allInnerTexts();
		expect(titlesAfter[0]).toBe(titlesBefore[1]);
		expect(titlesAfter[1]).toBe(titlesBefore[0]);
	});

	test('moving the inbox right swaps it past the next column', async ({ page }) => {
		const titlesBefore = await page.locator('.col-title').allInnerTexts();
		const inboxPos = titlesBefore.indexOf('Unassigned');
		test.skip(
			inboxPos < 0 || inboxPos >= titlesBefore.length - 1,
			'inbox is missing or already last'
		);

		const inbox = page.getByTestId(/^column-/).nth(inboxPos);
		const inboxId = (await inbox.getAttribute('data-testid'))!.split('-')[1];
		await page.getByTestId(`move-list-right-${inboxId}`).click();

		await expect
			.poll(async () => (await page.locator('.col-title').allInnerTexts())[inboxPos + 1])
			.toBe('Unassigned');
		const titlesAfter = await page.locator('.col-title').allInnerTexts();
		expect(titlesAfter[inboxPos]).toBe(titlesBefore[inboxPos + 1]);
	});

	test('reorder does not yank the board sideways', async ({ page }) => {
		const titlesBefore = await page.locator('.col-title').allInnerTexts();
		test.skip(titlesBefore.length < 2, 'seed has fewer than two lists');

		const board = page.getByTestId('board');
		await board.evaluate((el) => {
			el.scrollLeft = 0;
		});

		const firstCol = page.getByTestId(/^column-/).first();
		const id = (await firstCol.getAttribute('data-testid'))!.split('-')[1];
		await page.getByTestId(`move-list-right-${id}`).click();

		// Wait for the swap to land before measuring scroll.
		await expect.poll(async () => (await page.locator('.col-title').allInnerTexts())[1]).toBe(
			titlesBefore[0]
		);

		const scrollAfter = await board.evaluate((el) => el.scrollLeft);
		expect(scrollAfter).toBe(0);
	});

	test('reorder survives a full page reload', async ({ page }) => {
		const titlesBefore = await page.locator('.col-title').allInnerTexts();
		test.skip(titlesBefore.length < 2, 'seed has fewer than two lists');

		const firstCol = page.getByTestId(/^column-/).first();
		const id = (await firstCol.getAttribute('data-testid'))!.split('-')[1];
		await page.getByTestId(`move-list-right-${id}`).click();

		await expect.poll(async () => (await page.locator('.col-title').allInnerTexts())[1]).toBe(
			titlesBefore[0]
		);

		await page.reload();
		await page.waitForLoadState('networkidle');

		const titlesAfter = await page.locator('.col-title').allInnerTexts();
		expect(titlesAfter[0]).toBe(titlesBefore[1]);
		expect(titlesAfter[1]).toBe(titlesBefore[0]);
	});
});
