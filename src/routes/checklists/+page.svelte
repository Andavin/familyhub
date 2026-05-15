<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ApplyChecklistOptionsModal from '$lib/components/ApplyChecklistOptionsModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EmojiPicker from '$lib/components/EmojiPicker.svelte';
	import TagPicker from '$lib/components/TagPicker.svelte';
	import type { PageData } from './$types';
	import type { Checklist, ChecklistItem } from '$lib/server/schema';

	let { data }: { data: PageData } = $props();

	let editing = $state<Checklist | null>(null);
	let creating = $state(false);

	let name = $state('');
	let description = $state('');
	let emoji = $state('📋');
	let items = $state<ChecklistItem[]>([]);
	let defaultPriority = $state(0);
	let defaultDueTime = $state('');
	let defaultTagIds = $state<number[]>([]);

	let confirmDelete = $state<Checklist | null>(null);
	let toast = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	function showToast(msg: string) {
		toast = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2400);
	}

	function defaultListId(): number {
		// Pick the inbox if available, otherwise the first list.
		const inbox = data.lists.find((l) => l.system === 'inbox');
		return inbox?.id ?? data.lists[0]?.id ?? 0;
	}

	function openNew() {
		creating = true;
		editing = null;
		name = '';
		description = '';
		emoji = '📋';
		items = [{ title: '', listId: defaultListId() }];
		defaultPriority = 0;
		defaultDueTime = '';
		defaultTagIds = [];
	}

	function openEdit(t: Checklist) {
		editing = t;
		creating = false;
		name = t.name;
		description = t.description ?? '';
		emoji = t.emoji;
		items = t.items.map((i) => ({ ...i }));
		defaultPriority = t.defaultPriority;
		defaultDueTime = t.defaultDueTime ?? '';
		defaultTagIds = [...(data.checklistTags[t.id] ?? [])];
	}

	function close() {
		editing = null;
		creating = false;
	}

	function addRow() {
		items = [...items, { title: '', listId: defaultListId() }];
	}
	function removeRow(idx: number) {
		items = items.filter((_, i) => i !== idx);
	}

	async function save() {
		const cleaned = items.filter((i) => i.title.trim().length > 0);
		const body = {
			name,
			description,
			emoji,
			items: cleaned,
			defaultPriority,
			defaultDueTime: defaultDueTime || null,
			defaultTagIds
		};
		const url = editing ? `/api/checklists/${editing.id}` : '/api/checklists';
		const method = editing ? 'PATCH' : 'POST';
		await fetch(url, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		await invalidateAll();
		close();
	}

	async function deleteChecklist() {
		if (!confirmDelete) return;
		await fetch(`/api/checklists/${confirmDelete.id}`, { method: 'DELETE' });
		confirmDelete = null;
		await invalidateAll();
	}

	let applyOptionsOpen = $state(false);
	let checklistToApply = $state<Checklist | null>(null);

	function openApply(t: Checklist) {
		checklistToApply = t;
		applyOptionsOpen = true;
	}

	const isEditing = $derived(creating || editing !== null);
</script>

<section class="px-4 sm:px-8 pb-3 flex items-center justify-between gap-3">
	<div class="flex items-center gap-3">
		<a href="/" aria-label="Back to Tasks" data-testid="back-to-tasks" class="back-btn">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<polyline points="15 18 9 12 15 6" />
			</svg>
		</a>
		<div>
			<h1 class="text-2xl sm:text-3xl xl:text-4xl font-display font-bold">Checklists</h1>
			<p class="text-sm text-[color:var(--color-muted)]">
				Bulk-add presets like "Pre-Trip" or "Saturday Reset"
			</p>
		</div>
	</div>
	<button
		class="px-4 py-2 rounded-full bg-[color:var(--color-list-blue)] text-white text-sm font-semibold shadow"
		onclick={openNew}
		data-testid="new-checklist"
	>
		＋ New Checklist
	</button>
</section>

<div class="px-4 sm:px-8 pb-10 max-w-3xl w-full mx-auto flex-1">
	{#each data.checklists as t (t.id)}
		<div class="card">
			<div class="text-3xl">{t.emoji}</div>
			<div class="flex-1 min-w-0">
				<div class="font-bold text-lg">{t.name}</div>
				{#if t.description}
					<div class="text-sm text-[color:var(--color-muted)]">{t.description}</div>
				{/if}
				<div class="text-xs text-[color:var(--color-muted)] mt-1">
					{t.items.length} {t.items.length === 1 ? 'task' : 'tasks'}
				</div>
			</div>
			<div class="flex gap-1.5">
				<button class="btn ghost" onclick={() => openApply(t)}>Apply</button>
				<button class="btn ghost" onclick={() => openEdit(t)}>Edit</button>
				<button class="btn danger" onclick={() => (confirmDelete = t)}>Delete</button>
			</div>
		</div>
	{:else}
		<p class="text-[color:var(--color-muted)] text-sm">No checklists yet.</p>
	{/each}
</div>

{#if isEditing}
	<div class="backdrop" role="presentation" onclick={close}></div>
	<div class="modal" role="dialog" aria-modal="true">
		<header class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-display font-bold">
				{editing ? 'Edit' : 'New'} Checklist
			</h2>
			<button class="text-xl text-[color:var(--color-muted)]" onclick={close} aria-label="Close">✕</button>
		</header>

		<div class="grid gap-2 mb-3">
			<div class="flex gap-2 items-stretch">
				<EmojiPicker value={emoji} onchange={(e) => (emoji = e)} />
				<input
					bind:value={name}
					placeholder="Checklist name"
					class="field flex-1"
					aria-label="Checklist name"
				/>
			</div>
			<input bind:value={description} placeholder="Description (optional)" class="field" />
		</div>

		<h3 class="text-sm font-semibold mb-2">Defaults</h3>
		<p class="text-xs text-[color:var(--color-muted)] mb-2">
			Pre-filled in the apply dialog. You can still override them per-run.
		</p>
		<div class="rows mb-5">
			<div class="row">
				<span class="label">Time</span>
				<input
					type="time"
					bind:value={defaultDueTime}
					class="field"
					aria-label="Default time"
				/>
				{#if defaultDueTime}
					<button
						class="text-sm text-[color:var(--color-muted)]"
						aria-label="Clear time"
						onclick={() => (defaultDueTime = '')}>✕</button
					>
				{/if}
			</div>
			<div class="row">
				<span class="label">Priority</span>
				<div class="seg" role="radiogroup" aria-label="Default priority">
					{#each [
						{ v: 0, label: 'None' },
						{ v: 1, label: '!' },
						{ v: 2, label: '!!' },
						{ v: 3, label: '!!!' }
					] as o (o.v)}
						<button
							type="button"
							class:active={defaultPriority === o.v}
							onclick={() => (defaultPriority = o.v)}
							aria-pressed={defaultPriority === o.v}
							data-testid="checklist-default-priority-{o.v}"
						>
							{o.label}
						</button>
					{/each}
				</div>
			</div>
			<div class="row align-top">
				<span class="label">Tags</span>
				<div class="flex-1 min-w-0">
					<TagPicker
						tags={data.tags}
						selectedIds={defaultTagIds}
						onchange={(ids) => (defaultTagIds = ids)}
					/>
				</div>
			</div>
		</div>

		<h3 class="text-sm font-semibold mb-2">Tasks</h3>
		<div class="space-y-2 mb-3 max-h-[42vh] overflow-y-auto">
			{#each items as item, i (i)}
				<div class="row-edit">
					<input
						bind:value={item.title}
						placeholder="Task title"
						class="field flex-1"
						aria-label="Task title"
					/>
					<select bind:value={item.listId} class="field" aria-label="List">
						{#each data.lists as l (l.id)}
							<option value={l.id}>{l.name}</option>
						{/each}
					</select>
					<button class="text-[color:var(--color-muted)] px-2" onclick={() => removeRow(i)} aria-label="Remove">✕</button>
				</div>
			{/each}
		</div>

		<button class="btn ghost mb-4" onclick={addRow}>＋ Add row</button>

		<div class="flex justify-end gap-2">
			<button class="btn ghost" onclick={close}>Cancel</button>
			<button class="btn primary" onclick={save} data-testid="save-checklist">Save</button>
		</div>
	</div>
{/if}

<ConfirmDialog
	open={confirmDelete !== null}
	title={`Delete "${confirmDelete?.name ?? ''}"?`}
	message="This cannot be undone."
	confirmLabel="Delete"
	destructive
	onconfirm={deleteChecklist}
	oncancel={() => (confirmDelete = null)}
/>

<ApplyChecklistOptionsModal
	open={applyOptionsOpen}
	checklist={checklistToApply}
	tags={data.tags}
	defaultTagIds={checklistToApply ? (data.checklistTags[checklistToApply.id] ?? []) : []}
	oncancel={() => (applyOptionsOpen = false)}
	onapplied={async (n) => {
		applyOptionsOpen = false;
		showToast(`Added ${n} ${n === 1 ? 'task' : 'tasks'}`);
		await invalidateAll();
	}}
/>

{#if toast}
	<div class="toast" role="status">{toast}</div>
{/if}

<style>
	.back-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 9999px;
		background: var(--color-card);
		color: var(--color-list-blue);
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		flex-shrink: 0;
	}
	.back-btn svg {
		width: 18px;
		height: 18px;
	}
	.back-btn:hover {
		background: var(--color-canvas-2);
	}
	.card {
		display: flex;
		gap: 1rem;
		align-items: center;
		background: var(--color-card);
		padding: 1rem 1.25rem;
		border-radius: 1.1rem;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		margin-bottom: 0.75rem;
	}
	/* Phone: stack the action buttons below the body so a short title
	 * like "Pre-Trip" doesn't fight three buttons for ~120px of width. */
	@media (max-width: 767px) {
		.card {
			flex-wrap: wrap;
			gap: 0.6rem;
		}
		.card > :global(.flex.gap-1\.5) {
			width: 100%;
			justify-content: flex-end;
		}
	}
	.btn {
		padding: 0.4rem 0.85rem;
		border-radius: 9999px;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.btn.ghost {
		background: var(--color-canvas);
		color: var(--color-ink);
	}
	.btn.ghost:hover {
		background: var(--color-canvas-2);
	}
	.btn.primary {
		background: var(--color-list-blue);
		color: white;
	}
	.btn.danger {
		background: transparent;
		color: var(--color-list-red);
	}
	.btn.danger:hover {
		background: color-mix(in srgb, var(--color-list-red) 12%, transparent);
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
	.row-edit {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
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
		flex: 0 0 88px;
		font-size: 0.85rem;
		color: var(--color-muted);
		font-weight: 600;
	}
	.seg {
		display: flex;
		gap: 0.25rem;
		background: var(--color-canvas);
		padding: 0.2rem;
		border-radius: 0.6rem;
	}
	.seg button {
		padding: 0.3rem 0.7rem;
		border-radius: 0.4rem;
		font-size: 0.85rem;
		color: var(--color-ink-2);
	}
	.seg button.active {
		background: var(--color-card);
		color: var(--color-list-orange);
		font-weight: 700;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}
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
		width: min(620px, calc(100vw - 2rem));
		max-height: 90vh;
		overflow-y: auto;
		background: var(--color-card);
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px var(--color-shadow-lg);
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
