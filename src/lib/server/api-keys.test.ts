import { describe, it, expect } from 'vitest';
import { generateApiKey, extractBearerToken } from './api-keys';

describe('generateApiKey', () => {
	it('mints an fh_-prefixed token at the documented length', () => {
		const { plaintext } = generateApiKey();
		expect(plaintext.startsWith('fh_')).toBe(true);
		// 32 bytes of randomness → 43 base64url chars + "fh_" = 46
		expect(plaintext.length).toBe(46);
		// base64url alphabet only — no padding, no `+`, no `/`
		expect(plaintext.slice(3)).toMatch(/^[A-Za-z0-9_-]+$/);
	});

	it('returns a SHA-256 hex hash that matches the plaintext', async () => {
		const { plaintext, keyHash } = generateApiKey();
		const { createHash } = await import('node:crypto');
		const expected = createHash('sha256').update(plaintext).digest('hex');
		expect(keyHash).toBe(expected);
		expect(keyHash).toMatch(/^[0-9a-f]{64}$/); // 256 bits → 64 hex chars
	});

	it('returns a 12-char display prefix sliced from the plaintext', () => {
		const { plaintext, prefix } = generateApiKey();
		expect(prefix.length).toBe(12);
		expect(plaintext.startsWith(prefix)).toBe(true);
	});

	it('never repeats — distinct generations produce distinct tokens', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 200; i++) {
			const { plaintext } = generateApiKey();
			expect(seen.has(plaintext)).toBe(false);
			seen.add(plaintext);
		}
	});
});

describe('extractBearerToken', () => {
	it('returns the token from a well-formed header', () => {
		expect(extractBearerToken('Bearer fh_abc123')).toBe('fh_abc123');
	});

	it('is case-insensitive on the scheme', () => {
		expect(extractBearerToken('bearer fh_abc')).toBe('fh_abc');
		expect(extractBearerToken('BEARER fh_abc')).toBe('fh_abc');
	});

	it('tolerates extra whitespace between scheme and token', () => {
		expect(extractBearerToken('Bearer   fh_abc')).toBe('fh_abc');
	});

	it('returns null for missing or malformed headers', () => {
		expect(extractBearerToken(null)).toBeNull();
		expect(extractBearerToken('')).toBeNull();
		expect(extractBearerToken('Basic abc')).toBeNull();
		expect(extractBearerToken('Bearer')).toBeNull();
		expect(extractBearerToken('Bearer ')).toBeNull();
	});
});
