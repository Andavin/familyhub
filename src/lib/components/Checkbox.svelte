<script lang="ts">
	import { colorVar } from '$lib/colors';

	type Props = {
		checked: boolean;
		color?: string;
		size?: number;
		onchange?: (checked: boolean) => void;
		label?: string;
	};
	let { checked, color = 'blue', size = 22, onchange, label }: Props = $props();

	let toggling = $state(false);
	function toggle() {
		toggling = true;
		const next = !checked;
		setTimeout(() => (toggling = false), 240);
		onchange?.(next);
	}
</script>

<button
	type="button"
	class="checkbox"
	class:checked
	class:toggling
	style="--c: {colorVar(color)}; --s: {size}px"
	aria-label={label ?? (checked ? 'Mark incomplete' : 'Mark complete')}
	aria-pressed={checked}
	onclick={toggle}
>
	{#if checked}
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<polyline points="5 12 10 17 19 7" />
		</svg>
	{/if}
</button>

<style>
	.checkbox {
		width: var(--s);
		height: var(--s);
		border-radius: 9999px;
		border: 1.6px solid color-mix(in srgb, var(--c) 50%, transparent);
		background: transparent;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
		flex-shrink: 0;
	}
	.checkbox:hover {
		border-color: var(--c);
	}
	.checkbox.checked {
		background: var(--c);
		border-color: var(--c);
		color: white;
	}
	.checkbox.toggling {
		transform: scale(0.85);
	}
	svg {
		width: 70%;
		height: 70%;
	}
</style>
