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

	// Locks in the leak contract: POST exposes `plaintext` exactly once,
	// and GET never does. A regression that adds plaintext to `toListed`
	// or drops it from the POST response would break this.
	test('POST exposes plaintext once; GET never does', async ({ page }) => {
		const postRes = await page.request.post('/api/api-keys', {
			data: { name: 'Leak contract probe' }
		});
		expect(postRes.status()).toBe(201);
		const created = (await postRes.json()) as Record<string, unknown>;
		expect(typeof created.plaintext).toBe('string');
		expect(String(created.plaintext)).toMatch(/^fh_[A-Za-z0-9_-]+$/);
		expect(created).not.toHaveProperty('keyHash');

		const listRes = await page.request.get('/api/api-keys');
		expect(listRes.status()).toBe(200);
		const list = (await listRes.json()) as Record<string, unknown>[];
		const found = list.find((k) => k.id === created.id);
		expect(found).toBeTruthy();
		expect(found).not.toHaveProperty('plaintext');
		expect(found).not.toHaveProperty('keyHash');
	});

	// Pins revoked-key exclusion as the *specific* discriminator. Two
	// keys, revoke one — the other must still work. Catches a future
	// refactor that drops `isNull(apiKeys.revokedAt)` from findApiKey.
	test('revoked-key exclusion: revoking key A does not affect key B', async ({ page }) => {
		const a = await page.request
			.post('/api/api-keys', { data: { name: 'Pair A' } })
			.then((r) => r.json());
		const b = await page.request
			.post('/api/api-keys', { data: { name: 'Pair B' } })
			.then((r) => r.json());

		const aCtx = await playwrightRequest.newContext({
			baseURL: 'http://localhost:4173',
			extraHTTPHeaders: { authorization: `Bearer ${a.plaintext}` }
		});
		const bCtx = await playwrightRequest.newContext({
			baseURL: 'http://localhost:4173',
			extraHTTPHeaders: { authorization: `Bearer ${b.plaintext}` }
		});

		// Baseline — both work
		expect((await aCtx.get('/api/tasks')).status()).toBe(200);
		expect((await bCtx.get('/api/tasks')).status()).toBe(200);

		// Revoke only A
		const revokeRes = await page.request.delete(`/api/api-keys/${a.id}`);
		expect(revokeRes.status()).toBe(200);

		// A is dead, B is still alive
		expect((await aCtx.get('/api/tasks')).status()).toBe(401);
		expect((await bCtx.get('/api/tasks')).status()).toBe(200);

		await aCtx.dispose();
		await bCtx.dispose();
	});

	// A bearer on a non-/api/* route should NOT trigger the bearer path —
	// the hook scopes its check to /api/* explicitly. The page should
	// still load via the existing session cookie.
	test('Bearer header on non-/api routes is ignored (cookie auth still works)', async ({
		page
	}) => {
		const cookies = await page.context().cookies();
		const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
		const ctx = await playwrightRequest.newContext({
			baseURL: 'http://localhost:4173',
			extraHTTPHeaders: {
				authorization: 'Bearer fh_definitely-not-real',
				cookie: cookieHeader
			}
		});
		// /people is an HTML route — bearer must be ignored, cookie wins.
		const r = await ctx.get('/people');
		expect(r.status()).toBe(200);
		await ctx.dispose();
	});

	// Validation boundary on the documented MAX_NAME_LEN. Off-by-one
	// regressions on the inequality would flip the boundary.
	test('name length: 80 chars accepted, 81 rejected', async ({ page }) => {
		const ok = 'a'.repeat(80);
		const tooLong = 'a'.repeat(81);
		const okRes = await page.request.post('/api/api-keys', { data: { name: ok } });
		expect(okRes.status()).toBe(201);
		const longRes = await page.request.post('/api/api-keys', { data: { name: tooLong } });
		expect(longRes.status()).toBe(400);
	});

	// Mutually-exclusive filters: combining shared=1 and userId=N should
	// 400 rather than silently picking one.
	test('GET rejects shared=1 combined with userId=N', async ({ page }) => {
		const r = await page.request.get('/api/api-keys?shared=1&userId=1');
		expect(r.status()).toBe(400);
	});
});
