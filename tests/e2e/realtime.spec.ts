import { test, expect, request as playwrightRequest } from '@playwright/test';
import { login } from './setup';

/**
 * Cross-tab/device sync via Server-Sent Events.
 *
 * Each browser tab opens one EventSource to `/api/events`. Mutations
 * call `broadcast(channel)` on the server bus, which fans out to every
 * connected stream; clients call `invalidate('app:<channel>')` and
 * the matching loader re-runs. These tests pin that contract end-to-end.
 */
test.describe('realtime sync', () => {
	test('task added in tab A appears in tab B without manual refresh', async ({
		context,
		page
	}) => {
		await login(page);
		await page.goto('/');

		// Tab B inherits the same session cookies via `context.newPage()`.
		// Wait for its /api/events response so we know the SSE handshake
		// completed before we mutate from tab A — otherwise a fast test
		// machine can broadcast before B has a listener attached.
		const pageB = await context.newPage();
		const sseB = pageB.waitForResponse(
			(r) => r.url().includes('/api/events') && r.status() === 200
		);
		await pageB.goto('/');
		await sseB;

		// Add a task in A. The Enter key triggers the same POST flow the
		// header input uses, so this also exercises the real broadcast
		// path (vs a direct request().post()).
		const colA = page.getByTestId(/^column-/).first();
		await colA.getByTestId('add-task-input').fill('Realtime echo');
		await colA.getByTestId('add-task-input').press('Enter');
		await expect(colA.getByText('Realtime echo')).toBeVisible();

		// B should pick it up via the SSE-driven invalidate. Give it a
		// reasonable window for the round-trip; on local dev it's < 200ms.
		await expect(pageB.getByText('Realtime echo')).toBeVisible({ timeout: 5000 });
		await pageB.close();
	});

	test('grocery add propagates to a second tab on /grocery', async ({ context, page }) => {
		await login(page);
		await page.goto('/grocery');

		const pageB = await context.newPage();
		const sseB = pageB.waitForResponse(
			(r) => r.url().includes('/api/events') && r.status() === 200
		);
		await pageB.goto('/grocery');
		await sseB;

		// Use the grocery add input (whichever testid it is) — falling
		// back to the API directly, which still fires `broadcast('grocery')`
		// from the POST handler. This keeps the test focused on the bus
		// wiring rather than the UI form details.
		const res = await page.request.post('/api/grocery', {
			data: { name: 'Realtime milk' }
		});
		expect(res.ok()).toBe(true);

		await expect(pageB.getByText('Realtime milk').first()).toBeVisible({ timeout: 5000 });
		await pageB.close();
	});

	test('/api/events refuses unauthenticated requests', async () => {
		// A fresh context with no cookies and no bearer should be
		// rejected by the global hook before the SSE handler runs.
		const apiCtx = await playwrightRequest.newContext({
			baseURL: 'http://localhost:4173'
		});
		const r = await apiCtx.get('/api/events');
		expect(r.status()).toBe(401);
		await apiCtx.dispose();
	});

	test('/api/events stream sends ready event with SSE content-type', async ({ page }) => {
		// Playwright's APIRequestContext.get() buffers the full body, which
		// never resolves for a live SSE stream. Drive the request from the
		// page's fetch instead — we stream-read the first chunk, abort,
		// and inspect the headers + the `event: ready` preamble the
		// handler always emits on connect.
		await login(page);

		const handshake = await page.evaluate(async () => {
			const ac = new AbortController();
			const resp = await fetch('/api/events', { signal: ac.signal });
			const reader = resp.body!.getReader();
			const { value } = await reader.read();
			ac.abort();
			return {
				status: resp.status,
				contentType: resp.headers.get('content-type'),
				firstChunk: new TextDecoder().decode(value ?? new Uint8Array())
			};
		});

		expect(handshake.status).toBe(200);
		expect(handshake.contentType ?? '').toContain('text/event-stream');
		// Pins the wire-format contract for the initial frame. A future
		// refactor that drops `event: ready` would break clients that
		// rely on it to detect the connection has gone live.
		expect(handshake.firstChunk).toContain('event: ready');
	});

	test('self-echo is suppressed: tab A does not receive its own broadcasts', async ({
		page
	}) => {
		// Open an SSE stream from tab A (same client id as the page's
		// fetch interceptor would send), trigger a mutation from the
		// same tab, and confirm no `tasks` event arrives within a small
		// window. Without origin filtering this would fire instantly,
		// causing redundant re-renders that disrupt scroll-preserving
		// UX (cf. the "reorder does not yank the board sideways" test).
		await login(page);
		await page.goto('/');

		const result = await page.evaluate(async () => {
			// Mirror the realtime module's behavior: stable per-tab id,
			// passed both via `?cid=` on the EventSource URL and via
			// the `x-fh-client-id` header on mutating requests.
			const cid = crypto.randomUUID();

			const es = new EventSource(`/api/events?cid=${encodeURIComponent(cid)}`);
			const taskEvents: number[] = [];
			es.addEventListener('tasks', () => taskEvents.push(Date.now()));

			// Wait for `ready` so we know the listener is attached.
			await new Promise<void>((resolve) =>
				es.addEventListener('ready', () => resolve(), { once: true })
			);

			// First column id from the DOM, so the POST hits a real list.
			const colEl = document.querySelector('[data-testid^="column-"]') as HTMLElement | null;
			const listId = Number(colEl?.dataset.testid?.split('-')[1]);

			await fetch('/api/tasks', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-fh-client-id': cid
				},
				body: JSON.stringify({ listId, title: 'Self echo probe' })
			});

			// Give the server >100ms to deliver if it were going to.
			await new Promise((r) => setTimeout(r, 600));

			es.close();
			return { taskEvents };
		});

		expect(result.taskEvents).toEqual([]);
	});

	test('reconnection: tab B picks up missed events after a forced reload', async ({
		context,
		page
	}) => {
		// Belt-and-braces: even if the SSE connection drops between an
		// emit and a re-subscribe, the `ready` event from the new stream
		// triggers a blanket invalidate so the tab catches up to current
		// state. We simulate by force-navigating tab B after a mutation.
		await login(page);
		await page.goto('/');

		const pageB = await context.newPage();
		await pageB.goto('/');

		// Mutate while B is on /people (different page, different load).
		// We can't `waitForLoadState('networkidle')` because the SSE
		// stream stays open — instead, wait for a known /people element
		// that only renders after hydration to be sure the page is live.
		await pageB.goto('/people');
		await expect(pageB.getByRole('heading', { name: /people/i }).first()).toBeVisible();

		const colA = page.getByTestId(/^column-/).first();
		await colA.getByTestId('add-task-input').fill('Reconnect echo');
		await colA.getByTestId('add-task-input').press('Enter');
		await expect(colA.getByText('Reconnect echo')).toBeVisible();

		// Navigate B back to /tasks — the SSR data refetched on
		// navigation will have the new task, and any prior missed
		// events are caught by `ready` triggering full invalidation.
		await pageB.goto('/');
		await expect(pageB.getByText('Reconnect echo')).toBeVisible({ timeout: 5000 });
		await pageB.close();
	});
});
