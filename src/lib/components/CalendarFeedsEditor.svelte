<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { colorVar } from '$lib/colors';
	import ColorPicker from './ColorPicker.svelte';
	import type { CalendarFeed } from '$lib/server/schema';

	type Props = {
		feeds: CalendarFeed[];
		// userId for newly-added feeds. null = shared / unassigned.
		userId: number | null;
		// Optional default color for the add row (e.g. inherit a person's color).
		defaultColor?: string;
		testIdPrefix?: string;
	};
	let {
		feeds,
		userId,
		defaultColor = 'blue',
		testIdPrefix = 'feed'
	}: Props = $props();

	let newName = $state('');
	let newUrl = $state('');
	let newColor = $state('blue');
	let busy = $state(false);

	$effect(() => {
		// Sync color to the latest defaultColor (e.g. modal switches user).
		newColor = defaultColor;
	});

	async function add() {
		if (!newName.trim() || !newUrl.trim() || busy) return;
		busy = true;
		try {
			await fetch('/api/calendar-feeds', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: newName.trim(),
					url: newUrl.trim(),
					color: newColor,
					userId
				})
			});
			newName = '';
			newUrl = '';
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function remove(id: number) {
		busy = true;
		try {
			await fetch(`/api/calendar-feeds/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-1.5 mb-2">
	{#each feeds as f (f.id)}
		<div class="feed-row">
			<span class="feed-dot" style="background: {colorVar(f.color)}"></span>
			<div class="flex-1 min-w-0">
				<div class="font-medium truncate">{f.name}</div>
				<div class="text-xs text-[color:var(--color-muted)] truncate">{f.url}</div>
			</div>
			<button
				class="text-[color:var(--color-muted)] text-sm px-1.5"
				aria-label={`Remove ${f.name}`}
				onclick={() => remove(f.id)}
				disabled={busy}
				data-testid="{testIdPrefix}-delete-{f.id}"
			>
				✕
			</button>
		</div>
	{/each}
</div>

<div class="feed-add">
	<input
		type="text"
		placeholder="Calendar name (e.g. Work)"
		class="field"
		bind:value={newName}
		aria-label="Calendar name"
		data-testid="{testIdPrefix}-name-input"
	/>
	<input
		type="url"
		placeholder="https://… (or webcal://…)"
		class="field"
		bind:value={newUrl}
		aria-label="Calendar URL"
		data-testid="{testIdPrefix}-url-input"
	/>
	<div class="row-bottom">
		<ColorPicker value={newColor} onchange={(c) => (newColor = c)} />
		<button
			class="btn primary"
			onclick={add}
			disabled={busy || !newName.trim() || !newUrl.trim()}
			data-testid="{testIdPrefix}-add-btn"
		>
			Add link
		</button>
	</div>
</div>

<style>
	.feed-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		background: var(--color-canvas);
		border-radius: 0.65rem;
	}
	.feed-dot {
		width: 12px;
		height: 12px;
		border-radius: 9999px;
		flex-shrink: 0;
	}
	.feed-add {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.row-bottom {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.row-bottom .btn {
		flex-shrink: 0;
		align-self: center;
	}
	.field {
		padding: 0.55rem 0.8rem;
		background: var(--color-canvas);
		border-radius: 0.65rem;
		outline: none;
	}
	.field:focus {
		box-shadow: 0 0 0 2px var(--color-list-blue);
	}
	.btn {
		padding: 0.55rem 1rem;
		border-radius: 9999px;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.btn.primary {
		background: var(--color-list-blue);
		color: white;
	}
	.btn.primary:disabled {
		opacity: 0.5;
	}
</style>
