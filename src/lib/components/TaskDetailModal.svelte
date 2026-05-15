<script lang="ts">
	import ConfirmDialog from './ConfirmDialog.svelte';
	import TagPicker from './TagPicker.svelte';
	import { buildRrule, describeRrule } from '$lib/recurrence-client';
	import type { Task, User, List, Tag } from '$lib/server/schema';

	type Props = {
		open: boolean;
		task: Task | null;
		users: User[];
		lists: List[];
		tags: Tag[];
		/** Tag IDs currently attached to the task being edited. */
		initialTagIds: number[];
		onclose: () => void;
		onsaved: () => Promise<void> | void;
		oncreatedTag?: (tag: Tag) => void;
	};
	let {
		open,
		task,
		users,
		lists,
		tags,
		initialTagIds,
		onclose,
		onsaved,
		oncreatedTag
	}: Props = $props();

	let title = $state('');
	let notes = $state('');
	let listId = $state<number>(0);
	let assigneeId = $state<number | null>(null);
	let dueDate = $state(''); // YYYY-MM-DD
	let dueTime = $state(''); // HH:MM
	let priority = $state(0); // 0=none 1=low 2=med 3=high
	let repeat = $state<'' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('');
	let interval = $state(1);
	let recurFromCompletion = $state(false);
	let tagIds = $state<number[]>([]);
	let confirmDelete = $state(false);
	let recurringDelete = $state(false);
	let busy = $state(false);

	$effect(() => {
		if (open && task) {
			title = task.title;
			notes = task.notes ?? '';
			listId = task.listId;
			assigneeId = task.assigneeId;
			priority = task.priority ?? 0;
			if (task.dueAt) {
				const d = new Date(task.dueAt);
				dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
				dueTime = task.dueHasTime
					? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
					: '';
			} else {
				dueDate = '';
				dueTime = '';
			}
			if (task.rrule) {
				const m = task.rrule.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/);
				const i = task.rrule.match(/INTERVAL=(\d+)/);
				repeat = (m?.[1].toLowerCase() ?? '') as typeof repeat;
				interval = i ? Number(i[1]) : 1;
			} else {
				repeat = '';
				interval = 1;
			}
			recurFromCompletion = task.recurFromCompletion ?? false;
			tagIds = [...initialTagIds];
		}
	});

	const repeatLabel = $derived.by(() => {
		if (!repeat) return 'Never';
		const r = buildRrule(repeat, { interval });
		return r ? describeRrule(r) : 'Never';
	});

	function combineDateTime(): { iso: string | null; hasTime: boolean } {
		if (!dueDate) return { iso: null, hasTime: false };
		if (dueTime) {
			const dt = new Date(`${dueDate}T${dueTime}`);
			return { iso: dt.toISOString(), hasTime: true };
		}
		const dt = new Date(`${dueDate}T00:00`);
		return { iso: dt.toISOString(), hasTime: false };
	}

	async function save() {
		if (!task || !title.trim() || busy) return;
		busy = true;
		try {
			const due = combineDateTime();
			const rrule = repeat ? buildRrule(repeat, { interval }) : null;
			const body = {
				title: title.trim(),
				notes: notes.trim() || null,
				listId,
				assigneeId,
				dueAt: due.iso,
				dueHasTime: due.hasTime,
				priority,
				rrule,
				recurFromCompletion: rrule ? recurFromCompletion : false,
				tagIds
			};
			const res = await fetch(`/api/tasks/${task.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (res.ok) {
				await onsaved();
				onclose();
			}
		} finally {
			busy = false;
		}
	}

	async function deleteTask() {
		if (!task) return;
		busy = true;
		try {
			await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
			await onsaved();
			confirmDelete = false;
			recurringDelete = false;
			onclose();
		} finally {
			busy = false;
		}
	}

	async function skipOccurrence() {
		if (!task) return;
		busy = true;
		try {
			await fetch(`/api/tasks/${task.id}/skip`, { method: 'POST' });
			await onsaved();
			recurringDelete = false;
			onclose();
		} finally {
			busy = false;
		}
	}

	function openDelete() {
		if (task?.rrule) {
			recurringDelete = true;
		} else {
			confirmDelete = true;
		}
	}
</script>

{#if open && task}
	<div class="backdrop" role="presentation" onclick={onclose}></div>
	<div class="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
		<header class="flex items-center justify-between mb-3">
			<h2 id="task-modal-title" class="text-lg font-display font-bold">Details</h2>
			<button class="text-xl text-[color:var(--color-muted)]" onclick={onclose} aria-label="Close">✕</button>
		</header>

		<label class="block mb-3">
			<input
				bind:value={title}
				class="field-lg"
				placeholder="Title"
				aria-label="Title"
				data-testid="task-title-input"
			/>
		</label>

		<label class="block mb-3">
			<textarea
				bind:value={notes}
				class="field w-full min-h-[64px] resize-y"
				placeholder="Notes"
				aria-label="Notes"
			></textarea>
		</label>

		<div class="rows">
			<div class="row">
				<span class="label">List</span>
				<select bind:value={listId} class="field" aria-label="List">
					{#each lists.filter((l) => l.kind === 'chores') as l (l.id)}
						<option value={l.id}>{l.name}</option>
					{/each}
				</select>
			</div>

			<div class="row">
				<span class="label">Assignee</span>
				<select bind:value={assigneeId} class="field" aria-label="Assignee">
					<option value={null}>Unassigned</option>
					{#each users as u (u.id)}
						<option value={u.id}>{u.emoji} {u.name}</option>
					{/each}
				</select>
			</div>

			<div class="row">
				<span class="label">Date</span>
				<input
					type="date"
					bind:value={dueDate}
					class="field"
					aria-label="Due date"
					data-testid="task-due-date"
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

			{#if dueDate}
				<div class="row">
					<span class="label">Time</span>
					<input
						type="time"
						bind:value={dueTime}
						class="field"
						aria-label="Due time"
					/>
					{#if dueTime}
						<button
							class="text-sm text-[color:var(--color-muted)]"
							aria-label="Clear time"
							onclick={() => (dueTime = '')}>✕</button
						>
					{/if}
				</div>
			{/if}

			<div class="row">
				<span class="label">Repeat</span>
				<select bind:value={repeat} class="field" aria-label="Repeat">
					<option value="">Never</option>
					<option value="daily">Daily</option>
					<option value="weekly">Weekly</option>
					<option value="monthly">Monthly</option>
					<option value="yearly">Yearly</option>
				</select>
				{#if repeat}
					<input
						type="number"
						min="1"
						bind:value={interval}
						class="field w-16"
						aria-label="Repeat interval"
					/>
					<span class="text-xs text-[color:var(--color-muted)]">{repeatLabel}</span>
				{/if}
			</div>

			{#if repeat}
				<div class="row">
					<span class="label"></span>
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={recurFromCompletion}
							data-testid="recur-from-completion"
						/>
						<span class="text-sm">From completion</span>
					</label>
				</div>
			{/if}

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
							data-testid="priority-{o.v}"
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
			<button class="btn danger" onclick={openDelete} data-testid="task-delete">
				Delete
			</button>
			<div class="flex-1"></div>
			<button class="btn ghost" onclick={onclose}>Cancel</button>
			<button
				class="btn primary"
				onclick={save}
				disabled={busy || !title.trim()}
				data-testid="task-save"
			>
				Save
			</button>
		</div>
	</div>
{/if}

<ConfirmDialog
	open={confirmDelete}
	title="Delete this task?"
	message="This cannot be undone."
	confirmLabel="Delete"
	destructive
	onconfirm={deleteTask}
	oncancel={() => (confirmDelete = false)}
/>

{#if recurringDelete}
	<div
		class="backdrop"
		role="presentation"
		onclick={() => (recurringDelete = false)}
	></div>
	<div
		class="modal recurring-delete"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="rec-delete-title"
	>
		<h2 id="rec-delete-title" class="text-lg font-display font-bold">
			Delete repeating task?
		</h2>
		<p class="text-sm text-[color:var(--color-muted)] mt-2">
			This task repeats. Skip just this occurrence (it'll come back at the next date),
			or delete the whole series? Past completions stay in history.
		</p>
		<div class="flex flex-col gap-2 mt-5">
			<button
				class="btn skip"
				onclick={skipOccurrence}
				disabled={busy}
				data-testid="skip-occurrence"
			>
				Skip this occurrence
			</button>
			<button
				class="btn destructive"
				onclick={deleteTask}
				disabled={busy}
				data-testid="delete-series"
			>
				Delete entire series
			</button>
			<button
				class="btn ghost"
				onclick={() => (recurringDelete = false)}
				data-testid="recurring-delete-cancel"
			>
				Cancel
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
		width: min(540px, calc(100vw - 2rem));
		max-height: 92vh;
		overflow-y: auto;
		background: var(--color-card);
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px var(--color-shadow-lg);
	}
	.field-lg {
		width: 100%;
		font-size: 1.15rem;
		font-weight: 600;
		padding: 0.6rem 0.85rem;
		background: var(--color-canvas);
		border-radius: 0.75rem;
		outline: none;
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
	.btn.danger {
		background: transparent;
		color: var(--color-list-red);
	}
	.btn.danger:hover {
		background: color-mix(in srgb, var(--color-list-red) 12%, transparent);
	}
	.modal.recurring-delete {
		width: min(380px, calc(100vw - 2rem));
		z-index: 70;
	}
	.btn.skip {
		background: var(--color-list-blue);
		color: white;
		padding: 0.7rem 1rem;
	}
	.btn.destructive {
		background: var(--color-list-red);
		color: white;
		padding: 0.7rem 1rem;
	}
	.btn.skip:disabled,
	.btn.destructive:disabled {
		opacity: 0.5;
	}
</style>
