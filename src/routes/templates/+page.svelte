<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Template, TemplateItem } from '$lib/server/schema';

	let { data }: { data: PageData } = $props();

	let editing = $state<Template | null>(null);
	let creating = $state(false);

	let name = $state('');
	let description = $state('');
	let emoji = $state('📋');
	let items = $state<TemplateItem[]>([]);

	function openNew() {
		creating = true;
		editing = null;
		name = '';
		description = '';
		emoji = '📋';
		items = [{ title: '', assigneeRole: 'shared' }];
	}

	function openEdit(t: Template) {
		editing = t;
		creating = false;
		name = t.name;
		description = t.description ?? '';
		emoji = t.emoji;
		items = t.items.map((i) => ({ ...i }));
	}

	function close() {
		editing = null;
		creating = false;
	}

	function addRow() {
		items = [...items, { title: '', assigneeRole: 'shared' }];
	}
	function removeRow(idx: number) {
		items = items.filter((_, i) => i !== idx);
	}

	async function save() {
		const cleaned = items.filter((i) => i.title.trim().length > 0);
		const body = { name, description, emoji, items: cleaned };
		const url = editing ? `/api/templates/${editing.id}` : '/api/templates';
		const method = editing ? 'PATCH' : 'POST';
		await fetch(url, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		await invalidateAll();
		close();
	}

	async function deleteTemplate(t: Template) {
		if (!confirm(`Delete "${t.name}"?`)) return;
		await fetch(`/api/templates/${t.id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function applyNow(t: Template) {
		const res = await fetch(`/api/templates/${t.id}/apply`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		});
		if (res.ok) {
			const d = (await res.json()) as { inserted: unknown[] };
			alert(`Added ${d.inserted.length} tasks`);
		}
	}

	const isEditing = $derived(creating || editing !== null);
</script>

<section class="px-4 sm:px-8 pb-3 flex items-center justify-between">
	<div>
		<h1 class="text-3xl sm:text-4xl font-display font-bold">Templates</h1>
		<p class="text-sm text-[color:var(--color-muted)]">
			Bulk-add presets like "Pre-Trip" or "Saturday Reset"
		</p>
	</div>
	<button
		class="px-4 py-2 rounded-full bg-[color:var(--color-list-blue)] text-white text-sm font-semibold shadow"
		onclick={openNew}
		data-testid="new-template"
	>
		＋ New Template
	</button>
</section>

<div class="px-4 sm:px-8 pb-10 max-w-3xl w-full mx-auto flex-1">
	{#each data.templates as t (t.id)}
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
				<button class="btn ghost" onclick={() => applyNow(t)}>Apply</button>
				<button class="btn ghost" onclick={() => openEdit(t)}>Edit</button>
				<button class="btn danger" onclick={() => deleteTemplate(t)}>Delete</button>
			</div>
		</div>
	{:else}
		<p class="text-[color:var(--color-muted)] text-sm">No templates yet.</p>
	{/each}
</div>

{#if isEditing}
	<div class="backdrop" role="presentation" onclick={close}></div>
	<div class="modal" role="dialog" aria-modal="true">
		<header class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-display font-bold">
				{editing ? 'Edit' : 'New'} Template
			</h2>
			<button class="text-xl text-[color:var(--color-muted)]" onclick={close} aria-label="Close">✕</button>
		</header>

		<div class="grid gap-2 mb-3">
			<div class="flex gap-2">
				<input
					bind:value={emoji}
					maxlength="2"
					class="field w-16 text-center text-2xl"
					aria-label="Emoji"
				/>
				<input
					bind:value={name}
					placeholder="Template name"
					class="field flex-1"
					aria-label="Template name"
				/>
			</div>
			<input bind:value={description} placeholder="Description (optional)" class="field" />
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
					<select bind:value={item.assigneeRole} class="field" aria-label="Assignee">
						<option value="self">Self</option>
						<option value="partner">Partner</option>
						<option value="shared">Shared</option>
						{#each data.users as u (u.id)}
							<option value={u.id}>{u.name}</option>
						{/each}
					</select>
					<button class="text-[color:var(--color-muted)] px-2" onclick={() => removeRow(i)} aria-label="Remove">✕</button>
				</div>
			{/each}
		</div>

		<button class="btn ghost mb-4" onclick={addRow}>＋ Add row</button>

		<div class="flex justify-end gap-2">
			<button class="btn ghost" onclick={close}>Cancel</button>
			<button class="btn primary" onclick={save} data-testid="save-template">Save</button>
		</div>
	</div>
{/if}

<style>
	.card {
		display: flex;
		gap: 1rem;
		align-items: center;
		background: white;
		padding: 1rem 1.25rem;
		border-radius: 1.1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
		margin-bottom: 0.75rem;
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
		width: min(620px, calc(100vw - 2rem));
		max-height: 90vh;
		overflow-y: auto;
		background: white;
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.25);
	}
</style>
