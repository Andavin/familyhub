/**
 * Single source of truth for the phone breakpoint as seen from JS.
 *
 * Mirrors the `768px` boundary baked into Tailwind's default `md`
 * breakpoint, which every `@media (max-width: 767px)` block in the
 * Svelte stylesheets relies on. Kept here so route-level JS that
 * needs to branch on "is this a phone?" doesn't drift from CSS.
 *
 * CSS can't directly import this value, so any change here must be
 * mirrored in the relevant `@media` queries — there isn't a clean
 * way to share the constant across both sides at build time without
 * adding a preprocessor step we don't otherwise need.
 */
export const PHONE_MAX_PX = 767;
export const PHONE_MEDIA = `(max-width: ${PHONE_MAX_PX}px)`;

export function isPhoneViewport(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia(PHONE_MEDIA).matches;
}
