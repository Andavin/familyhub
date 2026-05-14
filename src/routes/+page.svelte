<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import AddTaskInline from '$lib/components/AddTaskInline.svelte';
	import ApplyChecklistModal from '$lib/components/ApplyChecklistModal.svelte';
	import CompletedByModal from '$lib/components/CompletedByModal.svelte';
	import ListEditModal from '$lib/components/ListEditModal.svelte';
	import TaskDetailModal from '$lib/components/TaskDetailModal.svelte';
	import { colorVar } from '$lib/colors';
	import { isOverdue } from '$lib/format';
	import type { PageData } from './$types';
	import type { Task, List } from '$lib/server/schema';
	import type { DoneEntry } from '$lib/server/done';

	let { data }: { data: PageData } = $props();

	type Column = {
		list: List;
		today: Task[];
		scheduled: Task[];
		done: DoneEntry[];
	};

	function endOfToday(): number {
		const d = new Date();
		d.setHours(23, 59, 59, 999);
		return d.getTime();
	}

	const columns = $derived.by<Column[]>(() => {
		const cutoff = endOfToday();
		return data.lists.map((list) => {
			const listOpen = data.openTasks.filter((t) => t.listId === list.id);
			// Today: needs attention now — no due date, overdue, or due today.
			const today = listOpen.filter(
				(t) => !t.dueAt || new Date(t.dueAt).getTime() <= cutoff
			);
			// Scheduled: date-bound tasks that aren't overdue yet — i.e. due
			// today (still actionable) or in the future. Overdue items already
			// surface in Today with the red pill, so duplicating them here
			// just adds clutter.
			//
			// Overdue *recurring* tasks are a special case: the stored row
			// stays in Today (overdue), but we want a preview of the next
			// upcoming occurrence in Scheduled. The server pre-projects those
			// into projectedRecurring; merge them into this column's Scheduled.
			const projected = data.projectedRecurring.filter((t) => t.listId === list.id);
			const scheduled = [
				...listOpen.filter(
					(t) => t.dueAt && !isOverdue(new Date(t.dueAt), t.dueHasTime)
				),
				...projected
			].sort(
				(a, b) =>
					new Date(a.dueAt as Date).getTime() - new Date(b.dueAt as Date).getTime()
			);
			return {
				list,
				today,
				scheduled,
				done: data.doneEntries.filter((e) => e.task.listId === list.id)
			};
		});
	});

	let checklistModal = $state(false);
	let listModalOpen = $state(false);
	let listBeingEdited = $state<List | null>(null);
	let taskModalOpen = $state(false);
	let taskBeingEdited = $state<Task | null>(null);
	let expandedDone = $state<Record<number, boolean>>({});
	let expandedScheduled = $state<Record<number, boolean>>({});
	// When the user checks off an unassigned task we ask who completed it
	// before posting. Holding the pending task here is what keeps the
	// modal open and remembers what to post when they pick.
	let pendingCompletion = $state<Task | null>(null);

	let toast = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	function showToast(msg: string) {
		toast = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2400);
	}

	async function postComplete(t: Task, done: boolean, completedById: number | null) {
		await fetch(`/api/tasks/${t.id}/complete`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				action: done ? 'complete' : 'uncomplete',
				completedById
			})
		});
		await invalidateAll();
	}

	async function complete(t: Task, done: boolean) {
		// Assigned tasks → the assignee is the implicit "did it" answer.
		// Unassigned + completing → ask who, since we have no default. Uncompleting
		// always passes through (the server clears completedBy regardless).
		if (done && t.assigneeId === null) {
			pendingCompletion = t;
			return;
		}
		await postComplete(t, done, t.assigneeId);
	}

	async function addTask(col: Column, title: string) {
		await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				listId: col.list.id,
				title,
				assigneeId: col.list.ownerId
			})
		});
		await invalidateAll();
	}

	function openListEdit(list: List | null) {
		listBeingEdited = list;
		listModalOpen = true;
	}

	function openTask(t: Task) {
		taskBeingEdited = t;
		taskModalOpen = true;
	}

	function toggleDone(listId: number) {
		expandedDone = { ...expandedDone, [listId]: !expandedDone[listId] };
	}
	function toggleScheduled(listId: number) {
		expandedScheduled = { ...expandedScheduled, [listId]: !expandedScheduled[listId] };
	}
</script>

<section class="px-4 sm:px-8 pb-3 flex items-center justify-between gap-3">
	<div>
		<h1 class="text-3xl sm:text-4xl font-display font-bold">
			{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
		</h1>
	</div>
	<button
		class="px-4 py-2 rounded-full bg-[color:var(--color-list-blue)] text-white text-sm font-semibold shadow"
		onclick={() => (checklistModal = true)}
		data-testid="open-checklists"
	>
		＋ Apply Checklist
	</button>
</section>

<div class="board snap-cols no-scrollbar" data-testid="board">
	{#each columns as col (col.list.id)}
		{@const today = col.today}
		{@const scheduled = col.scheduled}
		{@const done = col.done}
		{@const isDoneOpen = !!expandedDone[col.list.id]}
		{@const isScheduledOpen = !!expandedScheduled[col.list.id]}
		<article
			class="column"
			style="--c: {colorVar(col.list.color)}"
			data-testid="column-{col.list.id}"
		>
			<header class="col-head">
				<span class="dot"></span>
				<span class="col-title">{col.list.name}</span>
				<span class="col-count">{today.length}</span>
				<button
					class="col-edit"
					aria-label="Edit list"
					title="Edit list"
					onclick={() => openListEdit(col.list)}
					data-testid="edit-list-{col.list.id}"
				>
					⋯
				</button>
			</header>
			<div class="col-body">
				{#each today as task (task.id)}
					<TaskRow
						{task}
						color={col.list.color}
						onComplete={complete}
						onopen={openTask}
					/>
				{/each}
				<AddTaskInline
					color={col.list.color}
					placeholder="New Task"
					onsubmit={(title) => addTask(col, title)}
				/>

				{#if scheduled.length > 0}
					<div class="section-block">
						<button
							class="section-toggle"
							aria-expanded={isScheduledOpen}
							onclick={() => toggleScheduled(col.list.id)}
							data-testid="toggle-scheduled-{col.list.id}"
						>
							<span class="chev" class:open={isScheduledOpen}>›</span>
							<span>Scheduled</span>
							<span class="section-count">{scheduled.length}</span>
						</button>
						{#if isScheduledOpen}
							<div class="scheduled-list">
								{#each scheduled as task (task.id)}
									<TaskRow
										{task}
										color={col.list.color}
										onComplete={complete}
										onopen={openTask}
									/>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				{#if done.length > 0}
					<div class="section-block">
						<button
							class="section-toggle"
							aria-expanded={isDoneOpen}
							onclick={() => toggleDone(col.list.id)}
							data-testid="toggle-completed-{col.list.id}"
						>
							<span class="chev" class:open={isDoneOpen}>›</span>
							<span>Completed</span>
							<span class="section-count">{done.length}</span>
						</button>
						{#if isDoneOpen}
							<div class="completed-list">
								{#each done as entry (entry.uid)}
									<TaskRow
										task={entry.task}
										color={col.list.color}
										onComplete={complete}
										onopen={openTask}
										readOnly={!!entry.orphan}
									/>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</article>
	{/each}

	<button class="add-column" onclick={() => openListEdit(null)} data-testid="add-list">
		<span>＋</span>
		<span>Add list</span>
	</button>
</div>

<ApplyChecklistModal
	open={checklistModal}
	checklists={data.checklists}
	onclose={() => (checklistModal = false)}
	onapplied={async (n) => {
		showToast(`Added ${n} ${n === 1 ? 'task' : 'tasks'}`);
		await invalidateAll();
	}}
/>

<ListEditModal
	open={listModalOpen}
	list={listBeingEdited}
	users={data.users}
	onclose={() => (listModalOpen = false)}
	onsaved={async () => {
		await invalidateAll();
	}}
/>

<TaskDetailModal
	open={taskModalOpen}
	task={taskBeingEdited}
	users={data.users}
	lists={data.lists}
	onclose={() => (taskModalOpen = false)}
	onsaved={async () => {
		await invalidateAll();
	}}
/>

<CompletedByModal
	open={pendingCompletion !== null}
	users={data.users}
	taskTitle={pendingCompletion?.title ?? ''}
	onpick={async (userId) => {
		const t = pendingCompletion;
		pendingCompletion = null;
		if (t) await postComplete(t, true, userId);
	}}
	oncancel={() => (pendingCompletion = null)}
/>

{#if toast}
	<div class="toast" role="status">{toast}</div>
{/if}

<style>
	.board {
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 0.5rem 1rem 2rem;
		/* Make scroll-snap respect the container's left padding so the
		   first column doesn't slam against the viewport edge when you
		   bounce back to the start. */
		scroll-padding-left: 1rem;
		flex: 1;
		align-items: stretch;
	}
	@media (min-width: 640px) {
		.board {
			padding-left: 2rem;
			padding-right: 2rem;
			scroll-padding-left: 2rem;
		}
	}
	.column {
		background: var(--color-card);
		border-radius: 1.25rem;
		padding: 1rem 1.1rem 1.25rem;
		min-width: 320px;
		max-width: 360px;
		flex: 0 0 80vw;
		display: flex;
		flex-direction: column;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}
	@media (min-width: 640px) {
		.column {
			flex: 0 0 340px;
		}
	}
	.col-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 0.5rem;
	}
	.dot {
		width: 22px;
		height: 22px;
		border-radius: 9999px;
		background: var(--c);
		flex-shrink: 0;
	}
	.col-title {
		font-weight: 700;
		font-size: 1.05rem;
		flex: 1;
	}
	.col-count {
		font-size: 1.2rem;
		font-weight: 700;
		color: color-mix(in srgb, var(--c) 60%, transparent);
		font-family: var(--font-display);
	}
	.col-edit {
		padding: 0 0.5rem;
		font-size: 1.3rem;
		color: var(--color-muted);
		line-height: 1;
	}
	.col-edit:hover {
		color: var(--color-ink);
	}
	.col-body {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}
	.section-block {
		margin-top: 0.85rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--color-divider);
	}
	.section-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-muted);
		padding: 0.35rem 0;
		width: 100%;
	}
	.chev {
		display: inline-block;
		transition: transform 160ms ease;
		font-weight: 700;
	}
	.chev.open {
		transform: rotate(90deg);
	}
	.section-count {
		margin-left: auto;
		color: var(--color-muted);
	}
	.completed-list :global(.task-row) {
		opacity: 0.6;
	}
	.add-column {
		flex: 0 0 240px;
		min-height: 110px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border-radius: 1.25rem;
		border: 2px dashed color-mix(in srgb, var(--color-muted) 40%, transparent);
		color: var(--color-muted);
		font-weight: 600;
		font-size: 0.95rem;
		background: transparent;
		transition: background 120ms, color 120ms, border-color 120ms;
		align-self: stretch;
	}
	.add-column:hover {
		background: var(--color-hover);
		color: var(--color-ink);
		border-color: var(--color-ink);
	}
	.add-column span:first-child {
		font-size: 1.5rem;
		font-weight: 400;
	}
	.toast {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: var(--color-toast-bg);
		color: var(--color-toast-fg);
		padding: 0.6rem 1.1rem;
		border-radius: 9999px;
		font-size: 0.9rem;
		z-index: 60;
		box-shadow: 0 6px 24px -6px var(--color-shadow-lg);
	}
</style>
