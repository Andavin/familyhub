import { test, expect } from '@playwright/test';
import { login } from './setup';

test.describe('unassigned inbox', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('Unassigned column appears at the start', async ({ page }) => {
		const firstCol = page.getByTestId(/^column-/).first();
		await expect(firstCol.getByText('Unassigned')).toBeVisible();
	});

	test('unassigning a task moves it to the Unassigned column', async ({ page }) => {
		// Find a personal column (not the inbox) — second by displayOrder
		const personalCol = page.getByTestId(/^column-/).nth(1);
		const colTitleEl = personalCol.locator('.col-title').first();
		await expect(colTitleEl).toBeVisible();

		// Add a task to that personal column
		const input = personalCol.getByTestId('add-task-input');
		await input.fill('Triage me');
		await input.press('Enter');
		await expect(personalCol.getByText('Triage me')).toBeVisible();

		// Open detail, set assignee to Unassigned, save
		const row = personalCol.locator('[data-testid="task-row"]', { hasText: 'Triage me' });
		await row.getByRole('button', { name: 'Open task details' }).click();
		await page.getByLabel('Assignee').selectOption({ label: 'Unassigned' });
		await page.getByTestId('task-save').click();

		// Personal column no longer shows it
		await expect(
			personalCol.locator('[data-testid="task-row"]', { hasText: 'Triage me' })
		).toHaveCount(0, { timeout: 5000 });

		// Unassigned column (the first one) does
		const inbox = page.getByTestId(/^column-/).first();
		await expect(inbox.getByText('Triage me')).toBeVisible();
	});

	test('Unassigned column edit modal hides Delete', async ({ page }) => {
		const inbox = page.getByTestId(/^column-/).first();
		const colTestId = await inbox.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		await inbox.getByTestId(`edit-list-${listId}`).click();
		await expect(page.getByTestId('list-delete')).toHaveCount(0);
		// Cancel
		await page.getByRole('button', { name: 'Close' }).click();
	});
});
