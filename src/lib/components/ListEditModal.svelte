<script lang="ts">
	import ColorPicker from './ColorPicker.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import type { List, User } from '$lib/server/schema';

	type Props = {
		open: boolean;
		list: List | null; // null = create
		users: User[];
		onclose: () => void;
		onsaved: () => Promise<void> | void;
	};
	let { open, list, users, onclose, onsaved }: Props = $props();

	let name = $state('');
	let color = $state('blue');
	let ownerId = $state<number | null>(null);
	let confirmDelete = $state(false);
	let busy = $state(false);

	$effect(() => {
		if (open) {
			name = list?.name ?? '';
			color = list?.color ?? 'blue';
			ownerId = list?.ownerId ?? null;
		}
	});

	async function save() {
		if (!name.trim() || busy) return;
		busy = true;
		try {
			const body = JSON.stringify({ name: name.trim(), color, ownerId, kind: 'chores' });
			const res = list
				? await fetch(`/api/lists/${list.id}`, {
						method: 'PATCH',
						headers: { 'content-type': 'application/json' },
						body
					})
				: await fetch('/api/lists', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body
					});
			if (res.ok) {
				await onsaved();
				onclose();
			}
		} finally {
			busy = false;
		}
	}

	async function deleteList() {
		if (!list) return;
		busy = true;
		try {
			await fetch(`/api/lists/${list.id}`, { method: 'DELETE' });
			await onsaved();
			confirmDelete = false;
			onclose();
		} finally {
			busy = false;
		}
	}
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={onclose}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="list-modal-title">
		<header class="flex items-center justify-between mb-3">
			<h2 id="list-modal-title" class="text-lg font-display font-bold">
				{list ? 'Edit List' : 'New List'}
			</h2>
			<button class="text-xl text-[color:var(--color-muted)]" onclick={onclose} aria-label="Close">✕</button>
		</header>

		<label class="block mb-3">
			<div class="text-xs uppercase tracking-wide text-[color:var(--color-muted)] mb-1">Name</div>
			<input
				bind:value={name}
				placeholder="e.g. Mark, Errands, Weekend"
				class="field w-full"
				data-testid="list-name-input"
			/>
		</label>

		<div class="block mb-3">
			<div class="text-xs uppercase tracking-wide text-[color:var(--color-muted)] mb-1.5">Color</div>
			<ColorPicker value={color} onchange={(c) => (color = c)} />
		</div>

		<label class="block mb-5">
			<div class="text-xs uppercase tracking-wide text-[color:var(--color-muted)] mb-1">
				Owner (optional)
			</div>
			<select
				bind:value={ownerId}
				class="field w-full"
				aria-label="Owner"
			>
				<option value={null}>No owner / Shared</option>
				{#each users as u (u.id)}
					<option value={u.id}>{u.emoji} {u.name}</option>
				{/each}
			</select>
		</label>

		<div class="flex items-center gap-2">
			{#if list && list.system === 'none'}
				<button class="btn danger" onclick={() => (confirmDelete = true)} data-testid="list-delete">
					Delete
				</button>
			{/if}
			<div class="flex-1"></div>
			<button class="btn ghost" onclick={onclose}>Cancel</button>
			<button
				class="btn primary"
				onclick={save}
				disabled={busy || !name.trim()}
				data-testid="list-save"
			>
				Save
			</button>
		</div>
	</div>
{/if}

<ConfirmDialog
	open={confirmDelete}
	title="Delete this list?"
	message="All tasks in this list will also be deleted. This cannot be undone."
	confirmLabel="Delete"
	destructive
	onconfirm={deleteList}
	oncancel={() => (confirmDelete = false)}
/>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 40;
	}
	.modal {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 2rem));
		background: white;
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.25);
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
		padding: 0.5rem 1rem;
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
	.btn.danger {
		background: transparent;
		color: var(--color-list-red);
	}
	.btn.danger:hover {
		background: color-mix(in srgb, var(--color-list-red) 12%, transparent);
	}
</style>
