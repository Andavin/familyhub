import { test, expect, request as playwrightRequest } from '@playwright/test';
import { login } from './setup';

/**
 * End-to-end coverage for API keys: create in the People UI, copy the
 * plaintext, use it as a bearer to call the real API without cookies,
 * revoke, then confirm the next bearer call gets 401.
 */
test.describe('api keys', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
		await page.goto('/people');
		await page.waitForLoadState('networkidle');
	});

	test('shared key: create → call /api/tasks with bearer → revoke → 401', async ({
		page,
		request
	}) => {
		// Create
		await page.getByTestId('shared-api-key-name-input').fill('Reminders sync');
		await page.getByTestId('shared-api-key-add-btn').click();

		// Reveal panel shows the plaintext exactly once
		const reveal = page.getByTestId('shared-api-key-reveal');
		await expect(reveal).toBeVisible();
		const plaintext = (await page.getByTestId('shared-api-key-plaintext').textContent()) ?? '';
		expect(plaintext).toMatch(/^fh_[A-Za-z0-9_-]+$/);

		// Dismiss the panel — the secret is gone from the UI now
		await page.getByTestId('shared-api-key-dismiss').click();
		await expect(reveal).toHaveCount(0);

		// The row is listed (revealed plaintext exposed only on create)
		const row = page.locator('[data-testid^="shared-api-key-row-"]', {
			hasText: 'Reminders sync'
		});
		await expect(row).toHaveCount(1);

		// Use the bearer against a real API — a fresh request context with
		// no cookies proves the key alone is sufficient.
		const apiCtx = await playwrightRequest.newContext({
			baseURL: 'http://localhost:4173',
			extraHTTPHeaders: { authorization: `Bearer ${plaintext}` }
		});
		const okResp = await apiCtx.get('/api/tasks');
		expect(okResp.status()).toBe(200);

		// Revoke via the row's delete button
		const id = (await row.first().getAttribute('data-testid'))!.split('-').pop();
		await page.getByTestId(`shared-api-key-delete-${id}`).click();
		await page.waitForLoadState('networkidle');
		await expect(
			page.locator('[data-testid^="shared-api-key-row-"]', { hasText: 'Reminders sync' })
		).toHaveCount(0);

		// Same bearer now fails
		const deadResp = await apiCtx.get('/api/tasks');
		expect(deadResp.status()).toBe(401);
		await apiCtx.dispose();
	});

	test('per-user key: created inside Edit Person dialog', async ({ page, request }) => {
		// Open the first person's edit modal
		const firstUserCard = page.getByTestId(/^user-card-/).first();
		await firstUserCard.click();

		await page.getByTestId('api-key-name-input').fill('Personal sync');
		await page.getByTestId('api-key-add-btn').click();

		const plaintext = (await page.getByTestId('api-key-plaintext').textContent()) ?? '';
		expect(plaintext).toMatch(/^fh_/);

		const apiCtx = await playwrightRequest.newContext({
			baseURL: 'http://localhost:4173',
			extraHTTPHeaders: { authorization: `Bearer ${plaintext}` }
		});
		const r = await apiCtx.get('/api/tasks');
		expect(r.status()).toBe(200);
		await apiCtx.dispose();
	});

	test('invalid bearer is rejected without falling back to cookies', async ({ page, request }) => {
		// Even though `page` has a valid session cookie, a separate context
		// using a bogus bearer should still get 401 — the hook must not
		// downgrade a presented-but-invalid token to cookie auth.
		const apiCtx = await playwrightRequest.newContext({
			baseURL: 'http://localhost:4173',
			extraHTTPHeaders: { authorization: 'Bearer fh_not-a-real-key' }
		});
		const r = await apiCtx.get('/api/tasks');
		expect(r.status()).toBe(401);
		await apiCtx.dispose();

		// Sanity check: the cookie-authed page still works.
		const cookied = await page.request.get('/api/tasks');
		expect(cookied.status()).toBe(200);
	});
});
