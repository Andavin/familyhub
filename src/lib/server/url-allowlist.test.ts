import { describe, it, expect } from 'vitest';
import { validateFeedUrl, _internals } from './url-allowlist';

describe('validateFeedUrl', () => {
	it('accepts public https URLs', () => {
		const r = validateFeedUrl('https://example.com/cal.ics');
		expect(r.ok).toBe(true);
	});

	it('accepts public http URLs (some self-hosted calendars are http-only)', () => {
		const r = validateFeedUrl('http://example.com/cal.ics');
		expect(r.ok).toBe(true);
	});

	it('rewrites webcal:// to https://', () => {
		const r = validateFeedUrl('webcal://example.com/cal.ics');
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.url.protocol).toBe('https:');
	});

	it('rejects other protocols (file://, ftp://, gopher://, javascript:)', () => {
		for (const u of [
			'file:///etc/passwd',
			'ftp://example.com/x.ics',
			'gopher://example.com/',
			'javascript:alert(1)'
		]) {
			expect(validateFeedUrl(u).ok).toBe(false);
		}
	});

	it('rejects garbage URLs', () => {
		expect(validateFeedUrl('not a url').ok).toBe(false);
		expect(validateFeedUrl('').ok).toBe(false);
	});

	it('rejects localhost and *.localhost', () => {
		expect(validateFeedUrl('http://localhost/cal.ics').ok).toBe(false);
		expect(validateFeedUrl('http://app.localhost/cal.ics').ok).toBe(false);
	});

	it('rejects RFC 1918 private IPv4 literals', () => {
		expect(validateFeedUrl('http://10.0.0.5/cal.ics').ok).toBe(false);
		expect(validateFeedUrl('http://172.16.0.1/cal.ics').ok).toBe(false);
		expect(validateFeedUrl('http://172.31.255.1/cal.ics').ok).toBe(false);
		expect(validateFeedUrl('http://192.168.1.10/cal.ics').ok).toBe(false);
	});

	it('rejects loopback and link-local IPv4', () => {
		expect(validateFeedUrl('http://127.0.0.1/cal.ics').ok).toBe(false);
		expect(validateFeedUrl('http://127.5.5.5/cal.ics').ok).toBe(false);
		// Cloud metadata: 169.254.169.254
		expect(validateFeedUrl('http://169.254.169.254/latest/').ok).toBe(false);
	});

	it('rejects CGNAT range 100.64.0.0/10', () => {
		expect(validateFeedUrl('http://100.64.0.1/cal.ics').ok).toBe(false);
		expect(validateFeedUrl('http://100.127.255.254/cal.ics').ok).toBe(false);
		// just outside CGNAT — 100.128 — should be allowed
		expect(validateFeedUrl('http://100.128.0.1/cal.ics').ok).toBe(true);
	});

	it('rejects loopback and ULA / link-local IPv6', () => {
		expect(validateFeedUrl('http://[::1]/cal.ics').ok).toBe(false);
		expect(validateFeedUrl('http://[fc00::1]/cal.ics').ok).toBe(false);
		expect(validateFeedUrl('http://[fd00::1]/cal.ics').ok).toBe(false);
		expect(validateFeedUrl('http://[fe80::1]/cal.ics').ok).toBe(false);
	});

	it('rejects IPv4-mapped IPv6 that wraps a private v4', () => {
		expect(_internals.isPrivateV6('::ffff:192.168.1.1')).toBe(true);
		expect(_internals.isPrivateV6('::ffff:8.8.8.8')).toBe(false);
	});

	it('boundary cases on 172.16-172.31 range', () => {
		expect(validateFeedUrl('http://172.15.255.1/cal').ok).toBe(true); // outside
		expect(validateFeedUrl('http://172.16.0.0/cal').ok).toBe(false);
		expect(validateFeedUrl('http://172.31.255.255/cal').ok).toBe(false);
		expect(validateFeedUrl('http://172.32.0.0/cal').ok).toBe(true); // outside
	});

	it('does not let hostnames containing private IPs as substrings fool it', () => {
		// foo-127-0-0-1.example.com is a public hostname — must still be allowed,
		// even though it embeds digits that look like a loopback.
		expect(validateFeedUrl('https://foo-127-0-0-1.example.com/cal.ics').ok).toBe(true);
	});
});
