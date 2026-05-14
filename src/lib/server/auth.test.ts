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
});
