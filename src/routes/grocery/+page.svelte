<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import { CATEGORIES } from '$lib/categories';
	import type { PageData } from './$types';
	import type { GroceryItem } from '$lib/server/schema';

	let { data }: { data: PageData } = $props();

	let newName = $state('');
	let busy = $state(false);

	const grouped = $derived.by(() => {
		const map = new Map<string, GroceryItem[]>();
		for (const cat of CATEGORIES) map.set(cat, []);
		for (const it of data.items) {
			if (!it.checkedAt) {
				const list = map.get(it.category) ?? [];
				list.push(it);
				map.set(it.category, list);
			}
		}
		return Array.from(map.entries()).filter(([, items]) => items.length > 0);
	});

	const checkedItems = $derived(data.items.filter((i) => i.checkedAt));

	async function add() {
		const v = newName.trim();
		if (!v || busy) return;
		busy = true;
		try {
			await fetch('/api/grocery', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: v })
			});
			newName = '';
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function toggle(it: GroceryItem) {
		await fetch(`/api/grocery/${it.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ checked: !it.checkedAt })
		});
		await invalidateAll();
	}

	async function deleteItem(it: GroceryItem) {
		await fetch(`/api/grocery/${it.id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	function key(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			add();
		}
	}
</script>

<section class="px-4 sm:px-8 pb-3 flex items-center gap-2">
	<div>
		<h1 class="text-3xl sm:text-4xl font-display font-bold">Groceries</h1>
		<p class="text-sm text-[color:var(--color-muted)]">
			{data.items.filter((i) => !i.checkedAt).length} items
		</p>
	</div>
</section>

<div class="px-4 sm:px-8 pb-8 max-w-2xl w-full mx-auto flex-1">
	<div class="add-bar">
		<span class="plus">＋</span>
		<input
			type="text"
			bind:value={newName}
			onkeydown={key}
			placeholder="Add item"
			data-testid="grocery-add-input"
			class="flex-1 outline-none bg-transparent"
		/>
		<button
			type="button"
			onclick={add}
			disabled={busy || !newName.trim()}
			class="text-[color:var(--color-list-blue)] font-semibold disabled:opacity-30"
		>
			Add
		</button>
	</div>

	<div class="list">
		{#each grouped as [cat, items] (cat)}
			<section class="group">
				<h2 class="cat">{cat}</h2>
				{#each items as it (it.id)}
					<div class="row" data-testid="grocery-row-{it.id}">
						<Checkbox
							checked={!!it.checkedAt}
							color="green"
							onchange={() => toggle(it)}
							label={`Check off ${it.name}`}
						/>
						<div class="flex-1 min-w-0">
							<div class="truncate">{it.name}</div>
							{#if it.quantity}
								<div class="text-xs text-[color:var(--color-muted)]">{it.quantity}</div>
							{/if}
						</div>
						<button
							class="row-action"
							aria-label={`Remove ${it.name}`}
							onclick={() => deleteItem(it)}>✕</button
						>
					</div>
				{/each}
			</section>
		{:else}
			<div class="empty">
				<div class="text-5xl mb-2">🛒</div>
				<p class="text-[color:var(--color-muted)]">Your grocery list is empty</p>
			</div>
		{/each}

		{#if checkedItems.length > 0}
			<section class="group muted">
				<h2 class="cat">Completed</h2>
				{#each checkedItems as it (it.id)}
					<div class="row done">
						<Checkbox checked color="green" onchange={() => toggle(it)} />
						<div class="flex-1 truncate">{it.name}</div>
						<button class="row-action" onclick={() => deleteItem(it)} aria-label="Remove">✕</button>
					</div>
				{/each}
			</section>
		{/if}
	</div>
</div>

<style>
	.add-bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.85rem 1rem;
		background: var(--color-card);
		border-radius: 1rem;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		margin-bottom: 1.25rem;
	}
	.plus {
		color: var(--color-list-blue);
		font-weight: 700;
		font-size: 1.2rem;
	}
	.list {
		background: var(--color-card);
		border-radius: 1.25rem;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		overflow: hidden;
	}
	.group {
		padding: 0.6rem 1.1rem 0.4rem;
		border-bottom: 1px solid var(--color-divider);
	}
	.group:last-child {
		border-bottom: none;
	}
	.group.muted .row {
		opacity: 0.6;
	}
	.cat {
		font-size: 0.78rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-muted);
		padding: 0.5rem 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.55rem 0;
		border-top: 1px solid var(--color-divider);
	}
	.row:first-of-type {
		border-top: none;
	}
	.row.done div {
		text-decoration: line-through;
		color: var(--color-muted);
	}
	.row-action {
		opacity: 0;
		color: var(--color-muted);
		font-size: 13px;
		padding: 0.25rem 0.5rem;
		transition: opacity 120ms ease;
	}
	.row:hover .row-action {
		opacity: 1;
	}
	.empty {
		padding: 4rem 1rem;
		text-align: center;
	}
</style>
