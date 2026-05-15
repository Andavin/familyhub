<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import GroceryItemEditModal from '$lib/components/GroceryItemEditModal.svelte';
	import ManageStoresModal from '$lib/components/ManageStoresModal.svelte';
	import type { PageData } from './$types';
	import type { GroceryItem, Store, Tag } from '$lib/server/schema';

	let { data }: { data: PageData } = $props();

	const ADD_STORE_KEY = 'fh_grocery_last_added_store';
	const SORT_KEY = 'fh_grocery_sort';
	const FILTER_KEY = 'fh_grocery_store_filter';

	type StoreFilter = 'all' | 'unassigned' | number;

	function readStored<T>(key: string, fallback: T): T {
		if (typeof localStorage === 'undefined') return fallback;
		const raw = localStorage.getItem(key);
		if (raw == null) return fallback;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return fallback;
		}
	}

	let newName = $state('');
	let newAmount = $state(1);
	let busy = $state(false);
	let addStoreId = $state<number | null>(readStored<number | null>(ADD_STORE_KEY, null));
	let sortMode = $state<'date' | 'tag'>(readStored<'date' | 'tag'>(SORT_KEY, 'date'));
	let storeFilter = $state<StoreFilter>(readStored<StoreFilter>(FILTER_KEY, 'all'));
	let storePickerOpen = $state(false);
	let editingItem = $state<GroceryItem | null>(null);
	let managingStores = $state(false);
	let freshTags = $state<Tag[]>([]);
	let toast = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;

	function showToast(msg: string) {
		toast = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2400);
	}

	// Sort mode is a UI preference — persist on every change.
	$effect(() => {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(SORT_KEY, JSON.stringify(sortMode));
	});

	// Store filter persists on every chip tap.
	$effect(() => {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(FILTER_KEY, JSON.stringify(storeFilter));
	});

	// Default store, on the other hand, only updates on a successful
	// add (see `add()` below) — picking a store in the dropdown but
	// not actually adding shouldn't shift the next-session default.

	// If the persisted store no longer exists (deleted in another tab),
	// reset to "no store" rather than silently pinning a phantom id.
	$effect(() => {
		if (addStoreId == null) return;
		if (!data.stores.some((s) => s.id === addStoreId)) addStoreId = null;
	});

	// Same sanitization for the filter chip selection.
	$effect(() => {
		if (typeof storeFilter !== 'number') return;
		if (!data.stores.some((s) => s.id === storeFilter)) storeFilter = 'all';
	});

	const allTags = $derived.by(() => {
		const seen = new Set(data.tags.map((t) => t.id));
		return [...data.tags, ...freshTags.filter((t) => !seen.has(t.id))];
	});
	const tagById = $derived(new Map(allTags.map((t) => [t.id, t])));
	const storesById = $derived(new Map(data.stores.map((s) => [s.id, s])));

	type Section = { storeId: number | null; store: Store | null; items: GroceryItem[] };

	const sections = $derived.by<Section[]>(() => {
		const bucket = new Map<number | null, GroceryItem[]>();
		for (const s of data.stores) bucket.set(s.id, []);
		bucket.set(null, []);
		for (const it of data.items) {
			if (it.lastPurchasedAt) continue;
			const key = it.storeId != null && bucket.has(it.storeId) ? it.storeId : null;
			bucket.get(key)!.push(it);
		}
		const all: Section[] = [];
		for (const s of data.stores) {
			const items = bucket.get(s.id) ?? [];
			if (items.length > 0) all.push({ storeId: s.id, store: s, items });
		}
		const unassigned = bucket.get(null) ?? [];
		if (unassigned.length > 0) all.push({ storeId: null, store: null, items: unassigned });
		if (storeFilter === 'all') return all;
		if (storeFilter === 'unassigned') return all.filter((s) => s.storeId === null);
		return all.filter((s) => s.storeId === storeFilter);
	});

	const filteredRecent = $derived.by(() => {
		if (storeFilter === 'all') return data.recent;
		if (storeFilter === 'unassigned') return data.recent.filter((p) => p.storeId == null);
		return data.recent.filter((p) => p.storeId === storeFilter);
	});

	// The Unassigned chip only earns its place if there's actually
	// something living there — otherwise it's dead UI on a clean board.
	const hasUnassignedAny = $derived(
		data.items.some((i) => i.storeId == null) ||
			data.recent.some((p) => p.storeId == null)
	);

	function tagsFor(it: GroceryItem): Tag[] {
		const ids = data.itemTags[it.id] ?? [];
		return ids.map((id) => tagById.get(id)).filter((t): t is Tag => !!t);
	}

	type SubGroup = { tag: Tag | null; items: GroceryItem[] };

	function subgroup(items: GroceryItem[]): SubGroup[] {
		if (sortMode === 'date') {
			return [{ tag: null, items }];
		}
		const byTag = new Map<number, GroceryItem[]>();
		const untagged: GroceryItem[] = [];
		for (const it of items) {
			const its = tagsFor(it).sort((a, b) => a.name.localeCompare(b.name));
			const primary = its[0];
			if (!primary) {
				untagged.push(it);
				continue;
			}
			if (!byTag.has(primary.id)) byTag.set(primary.id, []);
			byTag.get(primary.id)!.push(it);
		}
		const out: SubGroup[] = [];
		for (const [tagId, items] of [...byTag.entries()].sort((a, b) =>
			(tagById.get(a[0])?.name ?? '').localeCompare(tagById.get(b[0])?.name ?? '')
		)) {
			out.push({ tag: tagById.get(tagId) ?? null, items });
		}
		if (untagged.length > 0) out.push({ tag: null, items: untagged });
		return out;
	}

	async function add() {
		const v = newName.trim();
		if (!v || busy) return;
		busy = true;
		try {
			const res = await fetch('/api/grocery', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: v, storeId: addStoreId, amount: newAmount })
			});
			if (res.ok) {
				const data = (await res.json()) as {
					mode: 'created' | 'merged' | 'flipped';
					item: GroceryItem;
				};
				if (data.mode === 'merged') {
					showToast(`Increased "${data.item.name}" to × ${data.item.amount}`);
				} else if (data.mode === 'flipped') {
					showToast(`Restored "${data.item.name}"`);
				}
				// Remember which store this add went to so the next page
				// load defaults to it — saves picking the same store on
				// every item during a multi-item shopping-list session.
				if (typeof localStorage !== 'undefined') {
					localStorage.setItem(ADD_STORE_KEY, JSON.stringify(addStoreId));
				}
			}
			newName = '';
			newAmount = 1;
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function togglePurchased(it: GroceryItem) {
		await fetch(`/api/grocery/${it.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ purchased: !it.lastPurchasedAt })
		});
		await invalidateAll();
	}

	async function reAddRecent(purchaseId: number) {
		const res = await fetch(`/api/grocery/recent/${purchaseId}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		});
		if (res.ok) {
			const data = (await res.json()) as {
				mode: 'created' | 'merged' | 'flipped';
				item: GroceryItem;
			};
			if (data.mode === 'merged') {
				showToast(`Increased "${data.item.name}" to × ${data.item.amount}`);
			}
		}
		await invalidateAll();
	}

	async function undoPurchase(groceryItemId: number) {
		await fetch(`/api/grocery/${groceryItemId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ purchased: false })
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

	function chooseStore(id: number | null) {
		addStoreId = id;
		storePickerOpen = false;
	}

	const currentStore = $derived(addStoreId != null ? storesById.get(addStoreId) : undefined);

	function fmtRelative(d: Date): string {
		const diff = Date.now() - new Date(d).getTime();
		const days = Math.floor(diff / 86_400_000);
		if (days < 1) return 'today';
		if (days === 1) return 'yesterday';
		if (days < 7) return `${days}d ago`;
		if (days < 30) return `${Math.floor(days / 7)}w ago`;
		return `${Math.floor(days / 30)}mo ago`;
	}
</script>

<section class="px-4 sm:px-8 pb-3 flex items-center gap-2 justify-between">
	<div>
		<h1 class="text-3xl sm:text-4xl font-display font-bold">Groceries</h1>
		<p class="text-sm text-[color:var(--color-muted)]">
			{data.items.filter((i) => !i.lastPurchasedAt).length} items
		</p>
	</div>
	<button class="stores-btn" onclick={() => (managingStores = true)} data-testid="manage-stores">
		<span aria-hidden="true">🏬</span>
		<span>Stores</span>
	</button>
</section>

<div class="px-4 sm:px-8 pb-8 max-w-2xl w-full mx-auto flex-1">
	<div class="add-bar">
		<button
			type="button"
			class="store-pill"
			onclick={() => (storePickerOpen = !storePickerOpen)}
			aria-haspopup="listbox"
			aria-expanded={storePickerOpen}
			data-testid="grocery-add-store"
		>
			{#if currentStore}
				<span aria-hidden="true">{currentStore.emoji}</span>
				<span class="truncate">{currentStore.name}</span>
			{:else}
				<span aria-hidden="true">🛒</span>
				<span>Any store</span>
			{/if}
			<span class="caret" aria-hidden="true">▾</span>
		</button>

		<input
			type="text"
			bind:value={newName}
			onkeydown={key}
			placeholder="Add item"
			data-testid="grocery-add-input"
			class="flex-1 outline-none bg-transparent"
		/>
		<div class="amount-stepper" aria-label="Amount">
			<button
				type="button"
				onclick={() => (newAmount = Math.max(1, newAmount - 1))}
				aria-label="Decrease amount"
				disabled={newAmount <= 1}>−</button
			>
			<span class="amount-value" data-testid="grocery-add-amount">{newAmount}</span>
			<button
				type="button"
				onclick={() => (newAmount += 1)}
				aria-label="Increase amount">＋</button
			>
		</div>
		<button
			type="button"
			onclick={add}
			disabled={busy || !newName.trim()}
			class="text-[color:var(--color-list-blue)] font-semibold disabled:opacity-30"
		>
			Add
		</button>

		{#if storePickerOpen}
			<button
				class="picker-backdrop"
				aria-label="Close store picker"
				onclick={() => (storePickerOpen = false)}
			></button>
			<ul class="picker" role="listbox" data-testid="grocery-store-picker-list">
				<li>
					<button
						type="button"
						class="picker-row"
						class:active={addStoreId == null}
						onclick={() => chooseStore(null)}
					>
						<span aria-hidden="true">🛒</span>
						<span>Any store</span>
					</button>
				</li>
				{#each data.stores as s (s.id)}
					<li>
						<button
							type="button"
							class="picker-row"
							class:active={addStoreId === s.id}
							onclick={() => chooseStore(s.id)}
						>
							<span aria-hidden="true">{s.emoji}</span>
							<span>{s.name}</span>
						</button>
					</li>
				{/each}
				<li>
					<button
						type="button"
						class="picker-row add"
						onclick={() => {
							storePickerOpen = false;
							managingStores = true;
						}}
					>
						<span aria-hidden="true">＋</span>
						<span>Add a store…</span>
					</button>
				</li>
			</ul>
		{/if}
	</div>

	{#if data.stores.length > 0}
		<div class="store-chips" role="radiogroup" aria-label="Filter by store">
			<button
				class="chip"
				class:active={storeFilter === 'all'}
				onclick={() => (storeFilter = 'all')}
				aria-pressed={storeFilter === 'all'}
				data-testid="store-chip-all"
			>
				All
			</button>
			{#each data.stores as s (s.id)}
				<button
					class="chip"
					class:active={storeFilter === s.id}
					onclick={() => (storeFilter = s.id)}
					aria-pressed={storeFilter === s.id}
					data-testid="store-chip-{s.id}"
				>
					<span aria-hidden="true">{s.emoji}</span>
					<span class="truncate">{s.name}</span>
				</button>
			{/each}
			{#if hasUnassignedAny}
				<button
					class="chip"
					class:active={storeFilter === 'unassigned'}
					onclick={() => (storeFilter = 'unassigned')}
					aria-pressed={storeFilter === 'unassigned'}
					data-testid="store-chip-unassigned"
				>
					Unassigned
				</button>
			{/if}
		</div>
	{/if}

	{#if sections.length > 0}
		<div class="sort-row">
			<span class="sort-label">Group within store</span>
			<div class="seg" role="radiogroup" aria-label="Sort">
				<button
					class:active={sortMode === 'date'}
					onclick={() => (sortMode = 'date')}
					aria-pressed={sortMode === 'date'}>Date</button
				>
				<button
					class:active={sortMode === 'tag'}
					onclick={() => (sortMode = 'tag')}
					aria-pressed={sortMode === 'tag'}>Tag</button
				>
			</div>
		</div>
	{/if}

	<div class="list">
		{#each sections as sec (sec.storeId ?? 'unassigned')}
			<section class="group">
				<header class="store-head">
					<span class="store-emoji" aria-hidden="true">{sec.store?.emoji ?? '🛒'}</span>
					<span class="store-name">{sec.store?.name ?? 'Unassigned'}</span>
					<span class="store-count">{sec.items.length}</span>
				</header>
				{#each subgroup(sec.items) as sg (sg.tag?.id ?? 'untagged')}
					{#if sortMode === 'tag'}
						<div class="subhead">{sg.tag ? `#${sg.tag.name}` : 'Untagged'}</div>
					{/if}
					{#each sg.items as it (it.id)}
						<div class="row" data-testid="grocery-row-{it.id}">
							<Checkbox
								checked={false}
								color="green"
								onchange={() => togglePurchased(it)}
								label={`Mark ${it.name} purchased`}
							/>
							<button
								class="row-body"
								onclick={() => (editingItem = it)}
								aria-label={`Edit ${it.name}`}
							>
								<div class="row-title">
									<span class="truncate">{it.name}</span>
									{#if it.amount > 1}
										<span class="amount">× {it.amount}</span>
									{/if}
								</div>
								{#if tagsFor(it).length > 0}
									<div class="chips">
										{#each tagsFor(it) as t (t.id)}
											<span class="chip">#{t.name}</span>
										{/each}
									</div>
								{/if}
							</button>
							<button
								class="row-action"
								aria-label={`Remove ${it.name}`}
								onclick={() => deleteItem(it)}>✕</button
							>
						</div>
					{/each}
				{/each}
			</section>
		{:else}
			<div class="empty">
				<div class="text-5xl mb-2">🛒</div>
				<p class="text-[color:var(--color-muted)]">Your grocery list is empty</p>
			</div>
		{/each}

		{#if filteredRecent.length > 0}
			<section class="group purchased">
				<header class="store-head muted">
					<span aria-hidden="true">🧾</span>
					<span class="store-name">Purchased</span>
					<span class="store-count">{filteredRecent.length}</span>
				</header>
				{#each filteredRecent as p (p.id)}
					{@const store = p.storeId != null ? storesById.get(p.storeId) : null}
					<div class="recent-row" data-testid="recent-row-{p.id}">
						{#if p.undoable && p.groceryItemId != null}
							<button
								class="checkbox checked"
								onclick={() => undoPurchase(p.groceryItemId!)}
								aria-label={`Undo purchase of ${p.nameSnapshot}`}
								data-testid="recent-undo-{p.id}"
							>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<path
										d="M5 12.5l4 4L19 6.5"
										fill="none"
										stroke="currentColor"
										stroke-width="3"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>
						{:else}
							<button
								class="plus-btn"
								onclick={() => reAddRecent(p.id)}
								aria-label={`Re-add ${p.nameSnapshot}`}
								data-testid="recent-readd-{p.id}"
							>
								<span aria-hidden="true">＋</span>
							</button>
						{/if}
						<div class="recent-body">
							<div class="recent-title">
								<span class="truncate">{p.nameSnapshot}</span>
								{#if p.amount > 1}
									<span class="amount">× {p.amount}</span>
								{/if}
							</div>
							<div class="recent-meta">
								<span class="store-tag">
									<span aria-hidden="true">{store?.emoji ?? '🛒'}</span>
									<span>{store?.name ?? 'Unassigned'}</span>
								</span>
								<span class="when">{fmtRelative(p.purchasedAt)}</span>
							</div>
						</div>
					</div>
				{/each}
			</section>
		{/if}
	</div>
</div>

<GroceryItemEditModal
	open={editingItem !== null}
	item={editingItem}
	stores={data.stores}
	tags={allTags}
	tagIds={editingItem ? (data.itemTags[editingItem.id] ?? []) : []}
	oncancel={() => (editingItem = null)}
	onsaved={async () => {
		editingItem = null;
		await invalidateAll();
	}}
	oncreatedTag={(t) => (freshTags = [...freshTags, t])}
/>

<ManageStoresModal
	open={managingStores}
	stores={data.stores}
	onclose={() => (managingStores = false)}
	oninvalidate={() => invalidateAll()}
/>

{#if toast}
	<div class="toast" role="status" data-testid="grocery-toast">{toast}</div>
{/if}

<style>
	.stores-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.85rem;
		background: var(--color-card);
		border-radius: 9999px;
		font-size: 0.9rem;
		font-weight: 600;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}
	.add-bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.85rem 1rem;
		background: var(--color-card);
		border-radius: 1rem;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		margin-bottom: 1rem;
		position: relative;
	}
	.store-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.65rem;
		background: var(--color-canvas);
		border-radius: 9999px;
		font-size: 0.85rem;
		font-weight: 500;
		max-width: 9rem;
	}
	.store-pill .caret {
		font-size: 0.7rem;
		color: var(--color-muted);
	}
	.picker-backdrop {
		position: fixed;
		inset: 0;
		background: transparent;
		z-index: 19;
		cursor: default;
	}
	.picker {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0.85rem;
		min-width: 12rem;
		background: var(--color-card);
		border-radius: 0.8rem;
		box-shadow: 0 10px 25px -8px var(--color-shadow-lg);
		padding: 0.3rem;
		z-index: 20;
		list-style: none;
	}
	.picker-row {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.7rem;
		border-radius: 0.5rem;
		text-align: left;
		font-size: 0.9rem;
	}
	.picker-row:hover {
		background: var(--color-canvas);
	}
	.picker-row.active {
		background: color-mix(in srgb, var(--color-list-blue) 18%, var(--color-card));
		color: var(--color-list-blue);
		font-weight: 600;
	}
	.picker-row.add {
		color: var(--color-list-blue);
		font-weight: 600;
		border-top: 1px solid var(--color-divider);
		margin-top: 0.2rem;
		padding-top: 0.6rem;
	}
	.store-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		padding: 0 0.3rem 0.8rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.32rem 0.75rem;
		background: var(--color-card);
		color: var(--color-ink-2);
		border-radius: 9999px;
		font-size: 0.85rem;
		font-weight: 500;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		max-width: 12rem;
	}
	.chip:hover {
		color: var(--color-ink);
	}
	.chip.active {
		background: color-mix(in srgb, var(--color-list-blue) 20%, var(--color-card));
		color: var(--color-list-blue);
		font-weight: 700;
	}
	.sort-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.3rem 0.8rem;
	}
	.sort-label {
		font-size: 0.8rem;
		color: var(--color-muted);
		font-weight: 600;
	}
	.seg {
		display: flex;
		gap: 0.2rem;
		background: var(--color-canvas);
		padding: 0.18rem;
		border-radius: 0.55rem;
	}
	.seg button {
		padding: 0.25rem 0.7rem;
		border-radius: 0.4rem;
		font-size: 0.82rem;
		color: var(--color-ink-2);
	}
	.seg button.active {
		background: var(--color-card);
		color: var(--color-list-blue);
		font-weight: 700;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}
	.list {
		background: var(--color-card);
		border-radius: 1.25rem;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		overflow: hidden;
	}
	.group {
		padding: 0.45rem 1rem 0.5rem;
		border-bottom: 1px solid var(--color-divider);
	}
	.group:last-child {
		border-bottom: none;
	}
	.store-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 0 0.35rem;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-muted);
		font-weight: 700;
	}
	.store-head.muted {
		opacity: 0.7;
	}
	.store-emoji {
		font-size: 1rem;
	}
	.store-name {
		flex: 1;
	}
	.store-count {
		background: var(--color-canvas);
		padding: 0.05rem 0.45rem;
		border-radius: 9999px;
		font-size: 0.7rem;
		letter-spacing: 0;
		text-transform: none;
	}
	.subhead {
		font-size: 0.72rem;
		color: var(--color-muted);
		padding: 0.45rem 0 0.2rem;
		font-weight: 600;
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
	.row-body {
		flex: 1;
		min-width: 0;
		text-align: left;
		padding: 0.1rem 0;
	}
	.row-title {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.amount {
		color: var(--color-muted);
		font-size: 0.85rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.2rem;
	}
	.chip {
		padding: 0.05rem 0.5rem;
		background: var(--color-canvas);
		border-radius: 9999px;
		font-size: 0.72rem;
		color: var(--color-ink-2);
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
	.recent-row {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.5rem 0;
		width: 100%;
		border-top: 1px solid var(--color-divider);
		color: var(--color-ink-2);
	}
	.recent-row:first-of-type {
		border-top: none;
	}
	.recent-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.recent-title {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.recent-meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.75rem;
	}
	.store-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--color-muted);
	}
	.when {
		color: var(--color-muted);
		font-size: 0.75rem;
		margin-left: auto;
	}
	.plus-btn {
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 9999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--color-list-blue);
		font-weight: 700;
		font-size: 1.1rem;
	}
	.plus-btn:hover {
		background: color-mix(in srgb, var(--color-list-blue) 12%, transparent);
	}
	.checkbox {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 9999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.checkbox.checked {
		background: var(--color-list-green);
		color: white;
	}
	.checkbox.checked:hover {
		filter: brightness(0.94);
	}
	.checkbox svg {
		width: 14px;
		height: 14px;
	}
	.empty {
		padding: 4rem 1rem;
		text-align: center;
	}
	.amount-stepper {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		background: var(--color-canvas);
		border-radius: 9999px;
		padding: 0.18rem;
	}
	.amount-stepper button {
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 9999px;
		font-weight: 600;
		color: var(--color-ink-2);
	}
	.amount-stepper button:hover:not(:disabled) {
		background: var(--color-card);
	}
	.amount-stepper button:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.amount-value {
		min-width: 1.4rem;
		text-align: center;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.toast {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: var(--color-toast-bg);
		color: white;
		padding: 0.6rem 1.1rem;
		border-radius: 9999px;
		font-size: 0.9rem;
		z-index: 60;
		box-shadow: 0 6px 24px -6px var(--color-shadow-lg);
	}
</style>
