<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ColorPicker from './ColorPicker.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import EmojiPicker from './EmojiPicker.svelte';
	import type { User, CalendarFeed } from '$lib/server/schema';
	import { LIST_COLORS, colorVar } from '$lib/colors';

	type Props = {
		open: boolean;
		user: User | null; // null = create
		feeds?: CalendarFeed[];
		onclose: () => void;
		onsaved: () => Promise<void> | void;
	};
	let { open, user, feeds = [], onclose, onsaved }: Props = $props();

	let name = $state('');
	let color = $state('blue');
	let emoji = $state('🙂');
	let createList = $state(true);
	let confirmDelete = $state(false);
	let busy = $state(false);

	$effect(() => {
		if (open) {
			name = user?.name ?? '';
			color = user?.color ?? 'blue';
			emoji = user?.emoji ?? '🙂';
			createList = true;
			newFeedName = '';
			newFeedUrl = '';
			newFeedColor = user?.color ?? 'blue';
		}
	});

	// New-feed inputs (shown only when editing an existing user)
	let newFeedName = $state('');
	let newFeedUrl = $state('');
	let newFeedColor = $state('blue');
	let feedBusy = $state(false);

	async function addFeed() {
		if (!user || !newFeedName.trim() || !newFeedUrl.trim() || feedBusy) return;
		feedBusy = true;
		try {
			await fetch('/api/calendar-feeds', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: newFeedName.trim(),
					url: newFeedUrl.trim(),
					color: newFeedColor,
					userId: user.id
				})
			});
			newFeedName = '';
			newFeedUrl = '';
			await invalidateAll();
		} finally {
			feedBusy = false;
		}
	}

	async function deleteFeed(id: number) {
		feedBusy = true;
		try {
			await fetch(`/api/calendar-feeds/${id}`, { method: 'DELETE' });
			await invalidateAll();
		} finally {
			feedBusy = false;
		}
	}

	async function save() {
		if (!name.trim() || busy) return;
		busy = true;
		try {
			const body = JSON.stringify(
				user
					? { name: name.trim(), color, emoji }
					: { name: name.trim(), color, emoji, createList }
			);
			const res = user
				? await fetch(`/api/users/${user.id}`, {
						method: 'PATCH',
						headers: { 'content-type': 'application/json' },
						body
					})
				: await fetch('/api/users', {
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

	async function deleteUser() {
		if (!user) return;
		busy = true;
		try {
			await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
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
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
		<header class="flex items-center justify-between mb-3">
			<h2 id="user-modal-title" class="text-lg font-display font-bold">
				{user ? 'Edit Person' : 'Add Person'}
			</h2>
			<button class="text-xl text-[color:var(--color-muted)]" onclick={onclose} aria-label="Close">✕</button>
		</header>

		<div class="flex gap-2 mb-3 items-stretch">
			<EmojiPicker value={emoji} onchange={(e) => (emoji = e)} />
			<input
				bind:value={name}
				placeholder="Name"
				class="field flex-1"
				aria-label="Name"
				data-testid="user-name-input"
			/>
		</div>

		<div class="block mb-5">
			<div class="text-xs uppercase tracking-wide text-[color:var(--color-muted)] mb-1.5">Color</div>
			<ColorPicker value={color} onchange={(c) => (color = c)} />
		</div>

		{#if !user}
			<label class="flex items-center gap-2 mb-5 text-sm">
				<input type="checkbox" bind:checked={createList} />
				<span>Also create a personal list for {name || 'this person'}</span>
			</label>
		{/if}

		{#if user}
			<div class="block mb-5">
				<div class="text-xs uppercase tracking-wide text-[color:var(--color-muted)] mb-1.5">
					Calendar links
				</div>
				<p class="text-xs text-[color:var(--color-muted)] mb-2">
					Public iCal URL from Calendar.app (Edit → Public Calendar) or Google Calendar
					(Settings → Integrate → Secret address). Read-only.
				</p>

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
								onclick={() => deleteFeed(f.id)}
								disabled={feedBusy}
								data-testid="delete-feed-{f.id}"
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
						bind:value={newFeedName}
						aria-label="Calendar name"
						data-testid="feed-name-input"
					/>
					<input
						type="url"
						placeholder="https://… (or webcal://…)"
						class="field"
						bind:value={newFeedUrl}
						aria-label="Calendar URL"
						data-testid="feed-url-input"
					/>
					<select
						bind:value={newFeedColor}
						class="field"
						aria-label="Calendar color"
					>
						{#each LIST_COLORS as c (c)}
							<option value={c}>{c}</option>
						{/each}
					</select>
					<button
						class="btn primary"
						onclick={addFeed}
						disabled={feedBusy || !newFeedName.trim() || !newFeedUrl.trim()}
						data-testid="feed-add-btn"
					>
						Add link
					</button>
				</div>
			</div>
		{/if}

		<div class="flex items-center gap-2">
			{#if user}
				<button class="btn danger" onclick={() => (confirmDelete = true)} data-testid="user-delete">
					Delete
				</button>
			{/if}
			<div class="flex-1"></div>
			<button class="btn ghost" onclick={onclose}>Cancel</button>
			<button
				class="btn primary"
				onclick={save}
				disabled={busy || !name.trim()}
				data-testid="user-save"
			>
				Save
			</button>
		</div>
	</div>
{/if}

<ConfirmDialog
	open={confirmDelete}
	title="Delete this person?"
	message="Tasks assigned to them become unassigned. Their personal list (if any) will also be deleted."
	confirmLabel="Delete"
	destructive
	onconfirm={deleteUser}
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
		width: min(520px, calc(100vw - 2rem));
		max-height: 90vh;
		overflow-y: auto;
		background: white;
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.25);
	}
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
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}
	.feed-add .field:first-child,
	.feed-add .field:nth-child(2) {
		grid-column: span 2;
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
