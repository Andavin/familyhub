import { describe, expect, it } from 'vitest';
import { broadcast, subscribe, listenerCount, CHANNELS, isChannel, type Channel } from './events';
import { requestContext } from './request-context';

describe('events broadcaster', () => {
	it('delivers a broadcast to a subscribed handler', () => {
		const received: Channel[] = [];
		const off = subscribe((c) => received.push(c));

		broadcast('tasks');
		broadcast('users');

		expect(received).toEqual(['tasks', 'users']);
		off();
	});

	it('unsubscribe stops further deliveries', () => {
		const received: Channel[] = [];
		const off = subscribe((c) => received.push(c));
		broadcast('tasks');
		off();
		broadcast('lists');
		expect(received).toEqual(['tasks']);
	});

	it('fans out to every active subscriber', () => {
		const a: Channel[] = [];
		const b: Channel[] = [];
		const offA = subscribe((c) => a.push(c));
		const offB = subscribe((c) => b.push(c));

		broadcast('grocery');

		expect(a).toEqual(['grocery']);
		expect(b).toEqual(['grocery']);
		offA();
		offB();
	});

	it('propagates the origin id from broadcast to subscribers', () => {
		// Pins the self-echo wire: the SSE endpoint relies on this
		// second arg to know which connection originated the mutation
		// and skip its own broadcast. If the bus drops the originId, the
		// origin-filter regresses to "always fire".
		const calls: Array<{ channel: Channel; originId: string | undefined }> = [];
		const off = subscribe((channel, originId) => calls.push({ channel, originId }));

		broadcast('tasks', 'tab-A');
		broadcast('lists', 'tab-B');
		broadcast('users'); // no override + no AsyncLocalStorage context → undefined

		expect(calls).toEqual([
			{ channel: 'tasks', originId: 'tab-A' },
			{ channel: 'lists', originId: 'tab-B' },
			{ channel: 'users', originId: undefined }
		]);
		off();
	});

	it('listenerCount reflects subscribe/unsubscribe', () => {
		const baseline = listenerCount();
		const off1 = subscribe(() => {});
		const off2 = subscribe(() => {});
		expect(listenerCount()).toBe(baseline + 2);
		off1();
		expect(listenerCount()).toBe(baseline + 1);
		off2();
		expect(listenerCount()).toBe(baseline);
	});

	it('a throwing subscriber does NOT block delivery to others', () => {
		// Load-bearing for the realtime layer: one buggy SSE handler must
		// not silently skip every other connected tab. The bus catches
		// per-handler exceptions and continues iterating. If a refactor
		// ever drops that wrapping, the bus regresses to "broadcast
		// quietly dies for N-1 tabs" and this test fails loudly.
		const received: Channel[] = [];
		const offBad = subscribe(() => {
			throw new Error('boom');
		});
		const offGood = subscribe((c: Channel) => received.push(c));

		// Should NOT throw — the bus swallows handler errors.
		expect(() => broadcast('tasks')).not.toThrow();
		// Good handler still received the event despite the bad one
		// throwing first (FIFO order).
		expect(received).toEqual(['tasks']);

		offBad();
		offGood();
	});

	it('CHANNELS export matches the broadcast/SSE wire-format contract', () => {
		// If a channel is added or removed, the SSE endpoint, the client
		// subscriber, and every load function need to know. This test
		// pins the list so a one-place edit forces an intentional update
		// everywhere.
		expect([...CHANNELS]).toEqual([
			'tasks',
			'lists',
			'users',
			'tags',
			'feeds',
			'checklists',
			'grocery',
			'stores',
			'api-keys'
		]);
	});

	it('isChannel narrows correctly', () => {
		expect(isChannel('tasks')).toBe(true);
		expect(isChannel('api-keys')).toBe(true);
		expect(isChannel('bogus')).toBe(false);
		expect(isChannel('')).toBe(false);
	});

	it('broadcast picks up clientId from AsyncLocalStorage across awaits', async () => {
		// Mutation endpoints `await` the DB operation before calling
		// `broadcast(channel)` with no arguments. The id has to survive
		// that await — that's the whole point of using
		// `AsyncLocalStorage` instead of a per-request variable. If a
		// future refactor swaps the ALS for a plain Map or schedules the
		// broadcast across a `setImmediate`, self-echo filtering
		// regresses silently to "always fire", which a unit test catches
		// faster than the integration suite.
		const calls: Array<{ channel: Channel; originId: string | undefined }> = [];
		const off = subscribe((c, o) => calls.push({ channel: c, originId: o }));

		await requestContext.run({ clientId: 'tab-X' }, async () => {
			await Promise.resolve();
			await new Promise((r) => setTimeout(r, 0));
			broadcast('tasks');
		});

		// Outside the run() scope, currentClientId() returns undefined.
		broadcast('users');

		expect(calls).toEqual([
			{ channel: 'tasks', originId: 'tab-X' },
			{ channel: 'users', originId: undefined }
		]);
		off();
	});
});
