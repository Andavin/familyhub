export type Theme = 'light' | 'dark';

const KEY = 'fh_theme';

const META_COLOR: Record<Theme, string> = {
	light: '#fef7f0',
	dark: '#000000'
};

export const themeStore = $state<{ value: Theme }>({ value: 'light' });

export function initTheme() {
	if (typeof document === 'undefined') return;
	const attr = document.documentElement.dataset.theme;
	const initial: Theme = attr === 'dark' ? 'dark' : 'light';
	themeStore.value = initial;
}

export function setTheme(t: Theme) {
	themeStore.value = t;
	if (typeof document === 'undefined') return;
	document.documentElement.dataset.theme = t;
	try {
		localStorage.setItem(KEY, t);
	} catch {
		// storage unavailable (private mode) — purely cosmetic, ignore
	}
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', META_COLOR[t]);
}

export function toggleTheme() {
	setTheme(themeStore.value === 'dark' ? 'light' : 'dark');
}
