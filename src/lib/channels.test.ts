import { describe, expect, it } from 'vitest';
import { CHANNELS, dep, isChannel } from './channels';

describe('channels', () => {
	it('dep() namespaces channels under the app: prefix', () => {
		expect(dep('tasks')).toBe('app:tasks');
		expect(dep('api-keys')).toBe('app:api-keys');
	});

	it('every CHANNELS entry round-trips through isChannel and dep', () => {
		// Pins the invariant: a name we broadcast must also pass the
		// type guard and produce a stable invalidation key. If a future
		// change adds a channel but skips the guard set, this fails.
		for (const c of CHANNELS) {
			expect(isChannel(c)).toBe(true);
			expect(dep(c)).toBe(`app:${c}`);
		}
	});
});
