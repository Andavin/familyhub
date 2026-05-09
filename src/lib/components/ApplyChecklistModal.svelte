<script lang="ts">
	import type { Checklist } from '$lib/server/schema';

	type Props = {
		open: boolean;
		checklists: Checklist[];
		onclose: () => void;
		onapplied: (insertedCount: number) => void;
	};
	let { open, checklists, onclose, onapplied }: Props = $props();
	let busyId = $state<number | null>(null);

	async function apply(t: Checklist) {
		busyId = t.id;
		try {
			const res = await fetch(`/api/checklists/${t.id}/apply`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({})
			});
			if (res.ok) {
				const data = (await res.json()) as { inserted: unknown[] };
				onapplied(data.inserted.length);
				onclose();
			}
		} finally {
			busyId = null;
		}
	}
</script>

{#if open}
	<div class="backdrop" onclick={onclose} role="presentation"></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Apply Checklist">
		<header class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-display font-bold">Apply a Checklist</h2>
			<button class="text-[color:var(--color-muted)] text-xl" aria-label="Close" onclick={onclose}>✕</button>
		</header>
		<p class="text-sm text-[color:var(--color-muted)] mb-3">
			Adds all the tasks in the checklist at once. Items go to the right person automatically.
		</p>
		<div class="space-y-2 max-h-[60vh] overflow-y-auto">
			{#each checklists as t (t.id)}
				<button
					class="checklist-card"
					disabled={busyId !== null}
					onclick={() => apply(t)}
					data-testid="apply-checklist-{t.id}"
				>
					<span class="text-2xl">{t.emoji}</span>
					<div class="flex-1 text-left">
						<div class="font-semibold">{t.name}</div>
						{#if t.description}
							<div class="text-sm text-[color:var(--color-muted)]">
								{t.description}
							</div>
						{/if}
						<div class="text-xs text-[color:var(--color-muted)] mt-0.5">
							{t.items.length} {t.items.length === 1 ? 'task' : 'tasks'}
						</div>
					</div>
					{#if busyId === t.id}
						<span class="text-sm text-[color:var(--color-list-blue)]">Adding…</span>
					{:else}
						<span class="text-[color:var(--color-list-blue)] font-semibold">Apply</span>
					{/if}
				</button>
			{:else}
				<p class="text-sm text-[color:var(--color-muted)]">No checklists yet — create one below.</p>
			{/each}
		</div>

		<a
			href="/checklists"
			class="manage-link"
			onclick={onclose}
			data-testid="manage-checklists"
		>
			Manage Checklists →
		</a>
	</div>
{/if}

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
		background: white;
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.25);
	}
	.checklist-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.85rem 1rem;
		background: var(--color-canvas);
		border-radius: 1rem;
		transition: background 120ms ease;
	}
	.checklist-card:hover {
		background: var(--color-canvas-2);
	}
	.checklist-card:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.manage-link {
		display: block;
		margin-top: 0.85rem;
		padding: 0.7rem 0;
		text-align: center;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-list-blue);
		border-top: 1px solid var(--color-divider);
	}
	.manage-link:hover {
		color: color-mix(in srgb, var(--color-list-blue) 80%, black);
	}
</style>
