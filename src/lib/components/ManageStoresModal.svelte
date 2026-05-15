<script lang="ts">
	import ConfirmDialog from './ConfirmDialog.svelte';
	import type { Store } from '$lib/server/schema';

	type Props = {
		open: boolean;
		stores: Store[];
		onclose: () => void;
		/** Fires after each add/edit/delete so the page can refresh `stores`
		 * without the modal having to dismiss itself. */
		oninvalidate: () => Promise<void> | void;
	};
	let { open, stores, onclose, oninvalidate }: Props = $props();

	let newName = $state('');
	let newEmoji = $state('🛒');
	let busy = $state(false);
	let editingId = $state<number | null>(null);
	let editName = $state('');
	let editEmoji = $state('');
	let pendingDelete = $state<Store | null>(null);

	async function add() {
		const v = newName.trim();
		if (!v || busy) return;
		busy = true;
		try {
			await fetch('/api/stores', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: v, emoji: newEmoji || '🛒' })
			});
			newName = '';
			newEmoji = '🛒';
			await oninvalidate();
		} finally {
			busy = false;
		}
	}

	function startEdit(s: Store) {
		editingId = s.id;
		editName = s.name;
		editEmoji = s.emoji;
	}

	function cancelEdit() {
		editingId = null;
	}

	async function saveEdit() {
		if (editingId == null || busy) return;
		const v = editName.trim();
		if (!v) return;
		busy = true;
		try {
			await fetch(`/api/stores/${editingId}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: v, emoji: editEmoji || '🛒' })
			});
			editingId = null;
			await oninvalidate();
		} finally {
			busy = false;
		}
	}

	async function confirmDelete() {
		if (!pendingDelete || busy) return;
		busy = true;
		try {
			await fetch(`/api/stores/${pendingDelete.id}`, { method: 'DELETE' });
			pendingDelete = null;
			await oninvalidate();
		} finally {
			busy = false;
		}
	}

	function onkey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (pendingDelete) {
				pendingDelete = null;
				return;
			}
			onclose();
		}
	}
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={onclose}></div>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="stores-title"
		tabindex={-1}
		onkeydown={onkey}
	>
		<header class="flex items-center justify-between mb-3">
			<h2 id="stores-title" class="text-lg font-display font-bold">Stores</h2>
			<button
				class="text-xl text-[color:var(--color-muted)]"
				aria-label="Close"
				onclick={onclose}>✕</button
			>
		</header>

		<p class="text-sm text-[color:var(--color-muted)] mb-3">
			Items are grouped by store. Add the places you shop most.
		</p>

		<ul class="list">
			{#each stores as s (s.id)}
				<li class="row">
					{#if editingId === s.id}
						<input
							bind:value={editEmoji}
							class="emoji-input"
							maxlength="4"
							aria-label="Emoji"
						/>
						<input bind:value={editName} class="name-input" aria-label="Store name" />
						<button class="btn ghost" onclick={cancelEdit}>Cancel</button>
						<button
							class="btn primary"
							onclick={saveEdit}
							disabled={busy || !editName.trim()}>Save</button
						>
					{:else}
						<span class="emoji" aria-hidden="true">{s.emoji}</span>
						<span class="name flex-1 truncate">{s.name}</span>
						<button class="action" onclick={() => startEdit(s)} aria-label="Edit">✎</button>
						<button
							class="action danger"
							onclick={() => (pendingDelete = s)}
							aria-label="Delete">✕</button
						>
					{/if}
				</li>
			{:else}
				<li class="empty">No stores yet. Add your first below.</li>
			{/each}
		</ul>

		<div class="add">
			<input
				bind:value={newEmoji}
				class="emoji-input"
				maxlength="4"
				aria-label="New store emoji"
			/>
			<input
				bind:value={newName}
				class="name-input"
				placeholder="New store name"
				aria-label="New store name"
				onkeydown={(e) => e.key === 'Enter' && add()}
			/>
			<button
				class="btn primary"
				onclick={add}
				disabled={busy || !newName.trim()}
				data-testid="add-store"
			>
				Add
			</button>
		</div>
	</div>

	<ConfirmDialog
		open={pendingDelete !== null}
		title={`Delete "${pendingDelete?.name ?? ''}"?`}
		message="Items in this store will move to Unassigned."
		confirmLabel="Delete"
		destructive
		onconfirm={confirmDelete}
		oncancel={() => (pendingDelete = null)}
	/>
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
	.list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.45rem 0.6rem;
		background: var(--color-canvas);
		border-radius: 0.7rem;
	}
	.emoji {
		font-size: 1.15rem;
	}
	.action {
		padding: 0.2rem 0.45rem;
		color: var(--color-muted);
		border-radius: 0.4rem;
	}
	.action:hover {
		background: var(--color-card);
		color: var(--color-ink);
	}
	.action.danger:hover {
		color: var(--color-list-red);
	}
	.empty {
		color: var(--color-muted);
		font-size: 0.9rem;
		padding: 0.8rem 0.4rem;
		text-align: center;
	}
	.add {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--color-divider);
	}
	.emoji-input {
		width: 3rem;
		text-align: center;
		padding: 0.4rem;
		background: var(--color-canvas);
		border-radius: 0.5rem;
		font-size: 1.1rem;
		outline: none;
	}
	.name-input {
		flex: 1;
		padding: 0.45rem 0.65rem;
		background: var(--color-canvas);
		border-radius: 0.5rem;
		outline: none;
		font-size: 0.95rem;
	}
	.emoji-input:focus,
	.name-input:focus {
		box-shadow: 0 0 0 2px var(--color-list-blue);
	}
	.btn {
		padding: 0.45rem 0.9rem;
		border-radius: 9999px;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.btn.ghost {
		background: var(--color-card);
		color: var(--color-ink-2);
	}
	.btn.primary {
		background: var(--color-list-blue);
		color: white;
	}
	.btn.primary:disabled {
		opacity: 0.5;
	}
</style>
