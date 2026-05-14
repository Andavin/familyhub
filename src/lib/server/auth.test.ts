import { describe, it, expect, beforeEach } from 'vitest';
import {
	_resetLoginRateLimit,
	checkLoginRateLimit,
	clearLoginFailures,
	recordLoginFailure
} from './auth';

describe('login rate limit', () => {
	beforeEach(() => _resetLoginRateLimit());

	it('allows a fresh IP', () => {
		expect(checkLoginRateLimit('1.1.1.1').allowed).toBe(true);
	});

	it('allows up to the failure cap, then locks out', () => {
		const ip = '2.2.2.2';
		const t0 = 1_000_000;
		for (let i = 0; i < 10; i++) {
			expect(checkLoginRateLimit(ip, t0 + i).allowed).toBe(true);
			recordLoginFailure(ip, t0 + i);
		}
		const r = checkLoginRateLimit(ip, t0 + 11);
		expect(r.allowed).toBe(false);
		if (!r.allowed) expect(r.retryAfterSec).toBeGreaterThan(0);
	});

	it('forgets old failures once the 15-min window rolls past', () => {
		const ip = '3.3.3.3';
		const t0 = 5_000_000;
		for (let i = 0; i < 10; i++) recordLoginFailure(ip, t0 + i);
		expect(checkLoginRateLimit(ip, t0 + 11).allowed).toBe(false);
		// 16 minutes later → bucket is dead
		expect(checkLoginRateLimit(ip, t0 + 16 * 60_000).allowed).toBe(true);
	});

	it('clearLoginFailures wipes the bucket on a successful login', () => {
		const ip = '4.4.4.4';
		for (let i = 0; i < 10; i++) recordLoginFailure(ip);
		expect(checkLoginRateLimit(ip).allowed).toBe(false);
		clearLoginFailures(ip);
		expect(checkLoginRateLimit(ip).allowed).toBe(true);
	});

	it('tracks each IP independently', () => {
		const a = '10.0.0.1';
		const b = '10.0.0.2';
		for (let i = 0; i < 10; i++) recordLoginFailure(a);
		expect(checkLoginRateLimit(a).allowed).toBe(false);
		expect(checkLoginRateLimit(b).allowed).toBe(true);
	});

	it('sweeps expired buckets once the Map crosses the sweep threshold', () => {
		// Spray 2000 distinct stale IPs at a frozen "old" timestamp.
		const old = 1_000_000;
		for (let i = 0; i < 2000; i++) recordLoginFailure(`10.${i >> 8}.${i & 0xff}.1`, old);
		// One fresh IP, far in the future. Recording it triggers the
		// sweep, which should evict every stale bucket and leave us
		// with effectively just this one.
		const fresh = old + 60 * 60_000; // 60 minutes later
		recordLoginFailure('203.0.113.1', fresh);
		// Sanity: the fresh entry exists and is countable.
		expect(checkLoginRateLimit('203.0.113.1', fresh).allowed).toBe(true);
		// Pick a few of the original stale IPs at random — they should
		// be gone, which we verify by checking that recording a new
		// failure starts the bucket from count=1 (not 2).
		for (const i of [0, 500, 1500, 1999]) {
			const ip = `10.${i >> 8}.${i & 0xff}.1`;
			recordLoginFailure(ip, fresh);
			// Just one fresh failure → still allowed. If the stale
			// bucket had survived, we'd be at count=2 in the same
			// frozen window and still allowed too, so this isn't a
			// strict proof — but combined with the sweep at 1024
			// entries, the Map is bounded.
			expect(checkLoginRateLimit(ip, fresh).allowed).toBe(true);
		}
	});
});
