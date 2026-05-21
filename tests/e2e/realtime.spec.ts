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

	test('navigating away and back: tab B converges to current state via SSR + ready', async ({
		context,
		page
	}) => {
		// This is the second-best of the catch-up paths: when tab B
		// navigates between pages, its SvelteKit loader re-fetches data
		// for the new route (so it inherently sees current state), AND
		// the `ready` event from the EventSource the new page is using
		// fires a blanket invalidate. So even if B was on /people while
		// A added a task, B sees the task once it lands back on /.
		//
		// NOTE: this does NOT exercise true TCP-level reconnection
		// (server bounce, network drop). EventSource's built-in retry
		// is a separate path we don't have an easy hook to force from
		// Playwright; this test just pins that data-level convergence
		// works across navigation.
		await login(page);
		await page.goto('/');

		const pageB = await context.newPage();
		await pageB.goto('/');

		await pageB.goto('/people');
		await expect(pageB.getByRole('heading', { name: /people/i }).first()).toBeVisible();

		const colA = page.getByTestId(/^column-/).first();
		await colA.getByTestId('add-task-input').fill('Reconnect echo');
		await colA.getByTestId('add-task-input').press('Enter');
		await expect(colA.getByText('Reconnect echo')).toBeVisible();

		await pageB.goto('/');
		await expect(pageB.getByText('Reconnect echo')).toBeVisible({ timeout: 5000 });
		await pageB.close();
	});

	test('cid edge cases: empty, oversized, and missing all still produce a usable stream', async ({
		page
	}) => {
		// Pins the validation in `+server.ts`: anything that isn't a
		// well-formed cid is dropped (with a server-side warn) and the
		// stream still serves events — it just can't filter self-echo
		// for that connection. A regression that early-returned on bad
		// cid would lock those clients out of realtime entirely.
		await login(page);

		const checks = await page.evaluate(async () => {
			const variants = [
				{ label: 'missing', suffix: '' },
				{ label: 'empty', suffix: '?cid=' },
				{ label: 'oversized', suffix: `?cid=${'a'.repeat(101)}` }
			];
			const results: Array<{ label: string; status: number; firstChunk: string }> = [];
			for (const v of variants) {
				const ac = new AbortController();
				const resp = await fetch(`/api/events${v.suffix}`, { signal: ac.signal });
				const reader = resp.body!.getReader();
				const { value } = await reader.read();
				ac.abort();
				results.push({
					label: v.label,
					status: resp.status,
					firstChunk: new TextDecoder().decode(value ?? new Uint8Array())
				});
			}
			return results;
		});

		for (const c of checks) {
			expect(c.status, c.label).toBe(200);
			expect(c.firstChunk, c.label).toContain('event: ready');
		}
	});

	test('/api/events accepts bearer API key auth (not just cookies)', async ({ page, browser }) => {
		// `hooks.server.ts` allows both auth modes for /api/*. The unauth
		// test pins the negative path; this one pins that a freshly-minted
		// bearer key reaches the SSE handshake. We need a cookie-free
		// browser context so the bearer is the only thing authenticating.
		await login(page);
		const keyRes = await page.request.post('/api/api-keys', {
			data: { name: 'sse-bearer-probe' }
		});
		expect(keyRes.status()).toBe(201);
		const { plaintext } = (await keyRes.json()) as { plaintext: string };

		const cleanCtx = await browser.newContext();
		const cleanPage = await cleanCtx.newPage();
		// Navigate to /login so the page has an origin; the page itself
		// is unauthenticated. The fetch below uses only the bearer.
		await cleanPage.goto('http://localhost:4173/login');

		const handshake = await cleanPage.evaluate(async (bearer) => {
			const ac = new AbortController();
			const resp = await fetch('/api/events', {
				signal: ac.signal,
				headers: { authorization: `Bearer ${bearer}` }
			});
			const reader = resp.body!.getReader();
			const { value } = await reader.read().catch(() => ({ value: new Uint8Array() }));
			ac.abort();
			return {
				status: resp.status,
				firstChunk: new TextDecoder().decode(value ?? new Uint8Array())
			};
		}, plaintext);

		expect(handshake.status).toBe(200);
		expect(handshake.firstChunk).toContain('event: ready');

		await cleanCtx.close();
	});
});
