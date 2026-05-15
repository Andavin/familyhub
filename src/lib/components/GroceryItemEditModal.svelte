<script lang="ts">
	import { tick } from 'svelte';
	import TagPicker from './TagPicker.svelte';
	import type { GroceryItem, Store, Tag } from '$lib/server/schema';

	type Props = {
		open: boolean;
		item: GroceryItem | null;
		stores: Store[];
		tags: Tag[];
		tagIds: number[];
		oncancel: () => void;
		onsaved: () => Promise<void> | void;
		oncreatedTag?: (tag: Tag) => void;
	};
	let { open, item, stores, tags, tagIds, oncancel, onsaved, oncreatedTag }: Props = $props();

	let name = $state('');
	let amount = $state(1);
	let storeId = $state<number | null>(null);
	let selectedTagIds = $state<number[]>([]);
	let busy = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (open && item) {
			name = item.name;
			amount = item.amount;
			storeId = item.storeId;
			selectedTagIds = [...tagIds];
			tick().then(() => nameInput?.focus());
		}
	});

	async function save() {
		if (!item || busy) return;
		const trimmed = name.trim();
		if (!trimmed) return;
		busy = true;
		try {
			await fetch(`/api/grocery/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: trimmed,
					amount,
					storeId,
					tagIds: selectedTagIds
				})
			});
			await onsaved();
		} finally {
			busy = false;
		}
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
		if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
			e.preventDefault();
			save();
		}
	}
</script>

{#if open && item}
	<div class="backdrop" role="presentation" onclick={oncancel}></div>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="grocery-edit-title"
		tabindex={-1}
		onkeydown={onkey}
	>
		<header class="flex items-center justify-between mb-3">
			<h2 id="grocery-edit-title" class="text-lg font-display font-bold">Edit item</h2>
			<button
				class="text-xl text-[color:var(--color-muted)]"
				aria-label="Close"
				onclick={oncancel}>✕</button
			>
		</header>

		<div class="rows">
			<div class="row">
				<span class="label">Name</span>
				<input
					bind:this={nameInput}
					bind:value={name}
					class="field flex-1"
					aria-label="Item name"
				/>
			</div>

			<div class="row">
				<span class="label">Amount</span>
				<div class="amount-ctrl">
					<button
						type="button"
						onclick={() => (amount = Math.max(1, amount - 1))}
						aria-label="Decrease amount">−</button
					>
					<input
						type="number"
						min="1"
						bind:value={amount}
						class="amount-input"
						aria-label="Amount"
					/>
					<button type="button" onclick={() => (amount += 1)} aria-label="Increase amount">＋</button>
				</div>
			</div>

			<div class="row">
				<span class="label">Store</span>
				<select bind:value={storeId} class="field flex-1" aria-label="Store">
					<option value={null}>Unassigned</option>
					{#each stores as s (s.id)}
						<option value={s.id}>{s.emoji} {s.name}</option>
					{/each}
				</select>
			</div>

			<div class="row align-top">
				<span class="label">Tags</span>
				<div class="flex-1 min-w-0">
					<TagPicker
						{tags}
						selectedIds={selectedTagIds}
						scope="grocery"
						onchange={(ids) => (selectedTagIds = ids)}
						oncreated={(t) => oncreatedTag?.(t)}
					/>
				</div>
			</div>
		</div>

		<div class="flex items-center gap-2 mt-5">
			<div class="flex-1"></div>
			<button class="btn ghost" onclick={oncancel}>Cancel</button>
			<button
				class="btn primary"
				onclick={save}
				disabled={busy || !name.trim()}
				data-testid="grocery-edit-save"
			>
				{busy ? 'Saving…' : 'Save'}
			</button>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: var(--color-backdrop);
		z-index: 40;
	}
	.modal {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(520px, calc(100vw - 2rem));
		max-height: 92vh;
		overflow-y: auto;
		background: var(--color-card);
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px var(--color-shadow-lg);
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.row.align-top {
		align-items: flex-start;
	}
	.label {
		flex: 0 0 70px;
		font-size: 0.85rem;
		color: var(--color-muted);
		font-weight: 600;
	}
	.field {
		padding: 0.5rem 0.75rem;
		background: var(--color-canvas);
		border-radius: 0.6rem;
		outline: none;
		font-size: 0.95rem;
	}
	.field:focus {
		box-shadow: 0 0 0 2px var(--color-list-blue);
	}
	.amount-ctrl {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: var(--color-canvas);
		border-radius: 0.6rem;
		padding: 0.2rem;
	}
	.amount-ctrl button {
		width: 1.8rem;
		height: 1.8rem;
		border-radius: 0.4rem;
		font-weight: 600;
	}
	.amount-ctrl button:hover {
		background: var(--color-card);
	}
	.amount-input {
		width: 3rem;
		text-align: center;
		background: transparent;
		font-size: 0.95rem;
		font-weight: 600;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.amount-input::-webkit-outer-spin-button,
	.amount-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
	}
	.btn {
		padding: 0.5rem 1.05rem;
		border-radius: 9999px;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.btn.ghost {
		background: var(--color-canvas);
	}
	.btn.primary {
		background: var(--color-list-blue);
		color: white;
	}
	.btn.primary:disabled {
		opacity: 0.5;
	}
</style>
