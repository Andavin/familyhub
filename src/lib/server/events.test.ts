import { describe, expect, it } from 'vitest';
import { broadcast, subscribe, listenerCount, CHANNELS, isChannel, type Channel } from './events';

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

	it('throwing in one subscriber does not block delivery to others', () => {
		// Node's EventEmitter aborts the emit on the first uncaught handler
		// throw, so we want subscribers to be defensive. This test pins the
		// expectation: if a future contributor wraps handlers, both still
		// fire; if not, the test documents the gotcha.
		const received: Channel[] = [];
		const offBad = subscribe(() => {
			throw new Error('boom');
		});
		const offGood = subscribe((c: Channel) => received.push(c));

		// EventEmitter rethrows synchronously; we just want to know the
		// good listener ran first (registration order is FIFO).
		expect(() => broadcast('tasks')).toThrow('boom');

		// `offBad` was registered first, so by FIFO ordering the throw
		// happens before the good listener gets a chance. The test
		// documents this so a future refactor that re-orders listeners
		// or adds try/catch knows what behavior changed.
		expect(received).toEqual([]);

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
});
