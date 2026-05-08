<script lang="ts">
	import { LIST_COLORS, colorVar } from '$lib/colors';

	type Props = {
		value: string;
		onchange: (c: string) => void;
	};
	let { value, onchange }: Props = $props();
</script>

<div class="grid">
	{#each LIST_COLORS as c (c)}
		<button
			type="button"
			class="swatch"
			class:selected={value === c}
			style="--c: {colorVar(c)}"
			aria-label={c}
			onclick={() => onchange(c)}
		></button>
	{/each}
</div>

<style>
	.grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.swatch {
		width: 28px;
		height: 28px;
		border-radius: 9999px;
		background: var(--c);
		transition: transform 100ms ease;
	}
	.swatch:hover {
		transform: scale(1.1);
	}
	.swatch.selected {
		outline: 2px solid var(--color-ink);
		outline-offset: 2px;
	}
</style>
