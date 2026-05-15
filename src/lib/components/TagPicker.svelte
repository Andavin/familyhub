<script lang="ts">
	import type { Tag, TagScope } from '$lib/server/schema';

	type Props = {
		tags: Tag[];
		selectedIds: number[];
		onchange: (ids: number[]) => void;
		/** Called when a new tag is created via the inline "+ Add". */
		oncreated?: (tag: Tag) => void;
		/** Which surface this picker creates tags for. Defaults to 'task' to
		 * preserve the historical behavior of existing call sites. */
		scope?: TagScope;
	};
	let { tags, selectedIds, onchange, oncreated, scope = 'task' }: Props = $props();

	let input = $state('');
	let creating = $state(false);
	// Tags created via the inline "+ Add" in this picker session. Kept
	// locally so they appear immediately without waiting for the page
	// load's `tags` prop to refetch. Merged with `tags` for display.
	let freshTags = $state<Tag[]>([]);

	const allTags = $derived.by(() => {
		const seen = new Set(tags.map((t) => t.id));
		return [...tags, ...freshTags.filter((t) => !seen.has(t.id))];
	});

	function toggle(id: number) {
		const next = selectedIds.includes(id)
			? selectedIds.filter((x) => x !== id)
			: [...selectedIds, id];
		onchange(next);
	}

	async function create() {
		const name = input.trim();
		if (!name || creating) return;
		creating = true;
		try {
			const res = await fetch('/api/tags', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name, scope })
			});
			if (!res.ok) return;
			const tag = (await res.json()) as Tag;
			freshTags = [...freshTags, tag];
			oncreated?.(tag);
			if (!selectedIds.includes(tag.id)) onchange([...selectedIds, tag.id]);
			input = '';
		} finally {
			creating = false;
		}
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			create();
		}
	}

	// Existing tag whose name matches the typed input (case-insensitive).
	// Lets us prefer selection over re-creation when the user types a name
	// that already exists.
	const exactMatch = $derived(
		allTags.find((t) => t.name.toLowerCase() === input.trim().toLowerCase().replace(/^#/, ''))
	);
</script>

<div class="tag-picker">
	{#if allTags.length > 0}
		<div class="tag-list">
			{#each allTags as t (t.id)}
				<button
					type="button"
					class="tag-chip"
					class:active={selectedIds.includes(t.id)}
					onclick={() => toggle(t.id)}
					aria-pressed={selectedIds.includes(t.id)}
				>
					#{t.name}
				</button>
			{/each}
		</div>
	{/if}

	<div class="tag-create">
		<input
			bind:value={input}
			onkeydown={onkey}
			placeholder="Add tag…"
			class="field"
			aria-label="New tag name"
		/>
		<button
			type="button"
			class="add-btn"
			onclick={() => (exactMatch ? toggle(exactMatch.id) : create())}
			disabled={!input.trim() || creating}
		>
			{exactMatch ? (selectedIds.includes(exactMatch.id) ? 'Selected' : 'Select') : '+ Add'}
		</button>
	</div>
</div>

<style>
	.tag-picker {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.tag-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.tag-chip {
		padding: 0.25rem 0.65rem;
		border-radius: 9999px;
		background: var(--color-canvas);
		color: var(--color-ink-2);
		font-size: 0.82rem;
		font-weight: 500;
		transition: background 120ms ease, color 120ms ease;
	}
	.tag-chip:hover {
		background: var(--color-canvas-2);
	}
	.tag-chip.active {
		background: color-mix(in srgb, var(--color-list-blue) 22%, var(--color-card));
		color: var(--color-list-blue);
		font-weight: 600;
	}
	.tag-create {
		display: flex;
		gap: 0.4rem;
	}
	.field {
		flex: 1;
		padding: 0.45rem 0.7rem;
		background: var(--color-canvas);
		border-radius: 0.5rem;
		font-size: 0.9rem;
		outline: none;
	}
	.field:focus {
		box-shadow: 0 0 0 2px var(--color-list-blue);
	}
	.add-btn {
		padding: 0.45rem 0.85rem;
		border-radius: 0.5rem;
		background: var(--color-list-blue);
		color: white;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.add-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
