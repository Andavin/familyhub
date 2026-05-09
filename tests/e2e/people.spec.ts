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

	test('add a calendar link to a person', async ({ page }) => {
		// Open the first existing user (Mark)
		await page.getByTestId('user-card-1').click();

		// Calendar Links section is visible only when editing
		await page.getByTestId('feed-name-input').fill('Mark Personal');
		await page.getByTestId('feed-url-input').fill('https://example.com/cal.ics');
		const addResp = page.waitForResponse((r) =>
			r.url().endsWith('/api/calendar-feeds') && r.request().method() === 'POST'
		);
		await page.getByTestId('feed-add-btn').click();
		await addResp;

		// Persisted via API
		const feeds = await page.evaluate(async () => {
			return await fetch('/api/calendar-feeds').then((r) => r.json());
		});
		const found = (feeds as { name: string; url: string }[]).find(
			(f) => f.name === 'Mark Personal'
		);
		expect(found).toBeTruthy();
		expect(found!.url).toBe('https://example.com/cal.ics');
	});

	test('add a shared calendar link', async ({ page }) => {
		await page.getByTestId('shared-feed-name-input').fill('Family');
		await page.getByTestId('shared-feed-url-input').fill('https://example.com/family.ics');
		const addResp = page.waitForResponse((r) =>
			r.url().endsWith('/api/calendar-feeds') && r.request().method() === 'POST'
		);
		await page.getByTestId('shared-feed-add-btn').click();
		await addResp;

		const feeds = await page.evaluate(async () => {
			return await fetch('/api/calendar-feeds').then((r) => r.json());
		});
		const found = (feeds as { name: string; userId: number | null }[]).find(
			(f) => f.name === 'Family'
		);
		expect(found).toBeTruthy();
		expect(found!.userId).toBeNull();
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
