import { test, expect } from '@playwright/test';
import { login } from './setup';

/**
 * The API has a uniform error contract:
 *   - body shape is `{ "error": "<message>" }` on every 4xx
 *   - common mistakes (malformed dates, out-of-range fields, etc.)
 *     produce a 4xx with a clear message rather than a 500.
 *
 * This spec pins those guarantees so a future refactor can't
 * regress them silently.
 */
test.describe('api error contract', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('POST /api/tasks with malformed dueAt returns 400 + clear message', async ({
		page
	}) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		const result = await page.evaluate(async (lid) => {
			const r = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					listId: Number(lid),
					title: 'Bad date task',
					dueAt: 'not-a-date'
				})
			});
			return { status: r.status, body: await r.json() };
		}, listId);

		expect(result.status).toBe(400);
		expect(result.body).toHaveProperty('error');
		expect(String(result.body.error)).toMatch(/dueAt/);
	});

	test('POST /api/tasks with out-of-range priority returns 400', async ({ page }) => {
		const firstCol = page.getByTestId(/^column-/).first();
		const colTestId = await firstCol.getAttribute('data-testid');
		const listId = colTestId!.split('-')[1];

		const result = await page.evaluate(async (lid) => {
			const r = await fetch('/api/tasks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					listId: Number(lid),
					title: 'Bad priority',
					priority: 99
				})
			});
			return { status: r.status, body: await r.json() };
		}, listId);

		expect(result.status).toBe(400);
		expect(String(result.body.error)).toMatch(/priority/);
	});

	test('POST /api/checklists/[id]/apply with ISO startDate returns 400', async ({
		page
	}) => {
		const result = await page.evaluate(async () => {
			const checklists = (await fetch('/api/checklists').then((r) => r.json())) as {
				id: number;
			}[];
			const id = checklists[0]?.id;
			if (!id) return { status: 0, body: null, skipped: 'no checklist seeded' };
			const r = await fetch(`/api/checklists/${id}/apply`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ startDate: new Date().toISOString() })
			});
			return { status: r.status, body: await r.json() };
		});

		if ('skipped' in result && result.skipped) {
			test.skip(true, result.skipped as string);
			return;
		}
		expect(result.status).toBe(400);
		expect(String((result.body as { error: string }).error)).toMatch(/YYYY-MM-DD/);
	});

	test('POST /api/grocery with amount < 1 returns 400', async ({ page }) => {
		const result = await page.evaluate(async () => {
			const r = await fetch('/api/grocery', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: 'Bad amount', amount: 0 })
			});
			return { status: r.status, body: await r.json() };
		});
		expect(result.status).toBe(400);
		expect(String(result.body.error)).toMatch(/amount/);
	});

	test('DELETE endpoints return 200 { ok: true } uniformly', async ({ page }) => {
		// Create-then-delete one row from each "newer" surface that
		// used to return 204. (Older ones — users, lists, tasks,
		// checklists, calendar-feeds — were already 200.)
		const result = await page.evaluate(async () => {
			const checks: Record<string, { status: number; body: unknown }> = {};

			// Tag (grocery scope to avoid colliding with task seed data).
			const tag = await fetch('/api/tags', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: 'delete-me-tag', scope: 'grocery' })
			}).then((r) => r.json());
			const tagDel = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' });
			checks.tag = { status: tagDel.status, body: await tagDel.json() };

			// Store.
			const store = await fetch('/api/stores', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: 'delete-me-store' })
			}).then((r) => r.json());
			const storeDel = await fetch(`/api/stores/${store.id}`, { method: 'DELETE' });
			checks.store = { status: storeDel.status, body: await storeDel.json() };

			// Grocery item.
			const itemRes = await fetch('/api/grocery', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: 'delete-me-item' })
			}).then((r) => r.json());
			const itemDel = await fetch(`/api/grocery/${itemRes.item.id}`, { method: 'DELETE' });
			checks.item = { status: itemDel.status, body: await itemDel.json() };

			return checks;
		});

		for (const [name, r] of Object.entries(result)) {
			expect(r.status, `${name} DELETE status`).toBe(200);
			expect(r.body, `${name} DELETE body`).toEqual({ ok: true });
		}
	});
});
