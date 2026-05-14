<script lang="ts">
	import TagPicker from './TagPicker.svelte';
	import type { Checklist, Tag } from '$lib/server/schema';

	type Props = {
		open: boolean;
		checklist: Checklist | null;
		tags: Tag[];
		/** Tag IDs pre-attached to this checklist via the editor. */
		defaultTagIds: number[];
		/** Called when the user backs out — page should re-open the picker. */
		oncancel: () => void;
		/** Called after a successful apply — page should dismiss everything. */
		onapplied: (insertedCount: number) => Promise<void> | void;
		oncreatedTag?: (tag: Tag) => void;
	};
	let {
		open,
		checklist,
		tags,
		defaultTagIds,
		oncancel,
		onapplied,
		oncreatedTag
	}: Props = $props();

	let dueDate = $state('');
	let dueTime = $state('');
	let priority = $state(0);
	let tagIds = $state<number[]>([]);
	let busy = $state(false);

	// Reset whenever a fresh checklist is loaded. Pre-fill from the
	// checklist's saved defaults so the picker shows the configured
	// values; the user can still tweak them per-run.
	$effect(() => {
		if (open && checklist) {
			dueDate = '';
			dueTime = checklist.defaultDueTime ?? '';
			priority = checklist.defaultPriority ?? 0;
			tagIds = [...defaultTagIds];
		}
	});

	async function apply() {
		if (!checklist || busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/checklists/${checklist.id}/apply`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					// Send the raw YYYY-MM-DD so the server interprets it
					// as a calendar day rather than us round-tripping
					// through ISO/UTC and losing the date in TZs west of
					// the server.
					startDate: dueDate || undefined,
					dueTime: dueTime || null,
					priority,
					tagIds
				})
			});
			if (res.ok) {
				const data = (await res.json()) as { inserted: unknown[] };
				await onapplied(data.inserted.length);
			}
		} finally {
			busy = false;
		}
	}
</script>

{#if open && checklist}
	<div class="backdrop" role="presentation" onclick={oncancel}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="apply-opts-title">
		<header class="flex items-center justify-between mb-3">
			<div class="flex items-center gap-2 min-w-0">
				<span class="text-2xl" aria-hidden="true">{checklist.emoji}</span>
				<h2 id="apply-opts-title" class="text-lg font-display font-bold truncate">
					{checklist.name}
				</h2>
			</div>
			<button
				class="text-xl text-[color:var(--color-muted)]"
				aria-label="Close"
				onclick={oncancel}>✕</button
			>
		</header>

		<p class="text-sm text-[color:var(--color-muted)] mb-4">
			{checklist.items.length}
			{checklist.items.length === 1 ? 'task' : 'tasks'} will be added. Choose how they
			start.
		</p>

		<div class="rows">
			<div class="row">
				<span class="label">Date</span>
				<input
					type="date"
					bind:value={dueDate}
					class="field"
					aria-label="Start date"
					data-testid="apply-opts-date"
				/>
				{#if dueDate}
					<button
						class="text-sm text-[color:var(--color-muted)]"
						aria-label="Clear date"
						onclick={() => {
							dueDate = '';
							dueTime = '';
						}}>✕</button
					>
				{/if}
			</div>

			<div class="row">
				<span class="label">Time</span>
				<input
					type="time"
					bind:value={dueTime}
					class="field"
					aria-label="Time"
					data-testid="apply-opts-time"
				/>
				{#if dueTime}
					<button
						class="text-sm text-[color:var(--color-muted)]"
						aria-label="Clear time"
						onclick={() => (dueTime = '')}>✕</button
					>
				{/if}
			</div>

			<div class="row">
				<span class="label">Priority</span>
				<div class="seg" role="radiogroup" aria-label="Priority">
					{#each [
						{ v: 0, label: 'None' },
						{ v: 1, label: '!' },
						{ v: 2, label: '!!' },
						{ v: 3, label: '!!!' }
					] as o (o.v)}
						<button
							type="button"
							class:active={priority === o.v}
							onclick={() => (priority = o.v)}
							aria-pressed={priority === o.v}
							data-testid="apply-opts-priority-{o.v}"
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
						{tags}
						selectedIds={tagIds}
						onchange={(ids) => (tagIds = ids)}
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
				onclick={apply}
				disabled={busy}
				data-testid="apply-opts-confirm"
			>
				{busy ? 'Adding…' : 'Apply'}
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
