import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type ValidationResult = { ok: true; url: URL } | { ok: false; reason: string };
export type DnsResult =
	| { ok: true; address: string; family: 4 | 6 }
	| { ok: false; reason: string };

/**
 * IPv4 ranges treated as private / internal. We block these to keep
 * server-side iCal fetches from being weaponized as an SSRF probe of
 * the LAN, container network, or cloud-instance metadata service.
 *
 * - 10/8, 172.16/12, 192.168/16: RFC 1918 private
 * - 127/8: loopback
 * - 169.254/16: link-local (includes 169.254.169.254 — cloud metadata)
 * - 0/8: "this network" / undefined
 * - 100.64/10: CGNAT
 * - 255.255.255.255: limited broadcast
 */
const PRIVATE_V4_PATTERNS: RegExp[] = [
	/^10\./,
	/^127\./,
	/^169\.254\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
	/^0\./,
	/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
	/^255\.255\.255\.255$/
];

function isPrivateV4(addr: string): boolean {
	return PRIVATE_V4_PATTERNS.some((r) => r.test(addr));
}

/**
 * IPv6 private / internal:
 *  - ::1 loopback, :: unspecified
 *  - fc00::/7 unique-local (fc..fd prefix)
 *  - fe80::/10 link-local (fe80..febf — first two hex digits start with "fe8|fe9|fea|feb")
 *  - ::ffff:x.x.x.x — IPv4-mapped, re-check the embedded v4
 */
function isPrivateV6(addr: string): boolean {
	const h = addr.toLowerCase().replace(/^\[|\]$/g, '');
	if (h === '::1' || h === '::') return true;
	if (/^fc|^fd/.test(h)) return true;
	if (/^fe[89ab]/.test(h)) return true;
	const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped) return isPrivateV4(mapped[1]);
	return false;
}

function isPrivateLiteral(host: string): boolean {
	// URL.hostname keeps IPv6 in `[...]` brackets — strip them before
	// asking node:net whether this is an IP literal.
	const bare = host.replace(/^\[|\]$/g, '');
	const kind = isIP(bare);
	if (kind === 4) return isPrivateV4(bare);
	if (kind === 6) return isPrivateV6(bare);
	return false;
}

function isLocalHostname(host: string): boolean {
	const lower = host.toLowerCase();
	return lower === 'localhost' || lower.endsWith('.localhost');
}

/**
 * Synchronous URL validation: protocol allowlist + reject literal
 * private addresses and localhost. webcal:// is normalized to https://
 * so downstream code only deals with two protocols.
 *
 * Hostnames that resolve via DNS to a private IP (DNS rebinding) are
 * caught at fetch time by `resolvePublicHost`.
 */
export function validateFeedUrl(raw: string): ValidationResult {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return { ok: false, reason: 'invalid URL' };
	}
	if (url.protocol === 'webcal:') {
		try {
			url = new URL('https://' + raw.slice(raw.indexOf('://') + 3));
		} catch {
			return { ok: false, reason: 'invalid URL' };
		}
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return { ok: false, reason: 'protocol must be http(s) or webcal' };
	}
	if (!url.hostname) {
		return { ok: false, reason: 'missing hostname' };
	}
	if (isLocalHostname(url.hostname)) {
		return { ok: false, reason: 'localhost is not allowed' };
	}
	if (isPrivateLiteral(url.hostname)) {
		return { ok: false, reason: 'private address is not allowed' };
	}
	return { ok: true, url };
}

/**
 * Resolve `hostname` and reject if the answer falls into a private
 * range. Used at fetch time to defeat DNS rebinding — a public name
 * that points at 192.168.x.y today won't be fetched.
 */
export async function resolvePublicHost(hostname: string): Promise<DnsResult> {
	try {
		const { address, family } = await lookup(hostname);
		const f: 4 | 6 = family === 6 ? 6 : 4;
		const priv = f === 4 ? isPrivateV4(address) : isPrivateV6(address);
		if (priv) return { ok: false, reason: `resolves to private address ${address}` };
		return { ok: true, address, family: f };
	} catch (err) {
		return { ok: false, reason: `DNS lookup failed: ${(err as Error).message}` };
	}
}

// Exported for tests so we can probe the IPv4 / v6 helpers without
// going through the URL parser.
export const _internals = { isPrivateV4, isPrivateV6 };
