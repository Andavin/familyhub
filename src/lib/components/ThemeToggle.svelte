<script lang="ts">
	import { themeStore, toggleTheme } from '$lib/theme.svelte';
</script>

<button
	type="button"
	class="theme-toggle"
	onclick={toggleTheme}
	aria-label={themeStore.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	title={themeStore.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
>
	{themeStore.value === 'dark' ? '☀︎' : '☾'}
</button>

<style>
	.theme-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 9999px;
		background: var(--color-card);
		color: var(--color-ink-2);
		font-size: 1rem;
		line-height: 1;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		transition: color 120ms ease, background 120ms ease;
	}
	.theme-toggle:hover {
		color: var(--color-ink);
	}
</style>
