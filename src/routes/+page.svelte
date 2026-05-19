<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import AddTaskInline from '$lib/components/AddTaskInline.svelte';
	import ApplyChecklistModal from '$lib/components/ApplyChecklistModal.svelte';
	import ApplyChecklistOptionsModal from '$lib/components/ApplyChecklistOptionsModal.svelte';
	import CompletedByModal from '$lib/components/CompletedByModal.svelte';
	import ListEditModal from '$lib/components/ListEditModal.svelte';
	import TaskDetailModal from '$lib/components/TaskDetailModal.svelte';
	import { CompletionFlow } from '$lib/completion-flow.svelte';
	import { colorVar } from '$lib/colors';
	import { buildScheduled } from '$lib/scheduled';
	import type { PageData } from './$types';
	import type { Task, List, Checklist } from '$lib/server/schema';
	import type { DoneEntry } from '$lib/server/done';

	let { data }: { data: PageData } = $props();

	const tagsById = $derived(new Map(data.tags.map((t) => [t.id, t])));
	function tagsFor(taskId: number) {
		return (data.taskTags[taskId] ?? [])
			.map((id) => tagsById.get(id))
			.filter((t): t is NonNullable<typeof t> => !!t);
	}

	// View-level filter + sort. Persist in localStorage so the kiosk
	// remembers what was last visible.
	const FILTER_KEY = 'fh_task_tag_filter';
	const SORT_KEY = 'fh_task_sort';
	type SortMode = 'date' | 'tag';
	let activeTagIds = $state<Set<number>>(new Set());
	let sortMode = $state<SortMode>('date');

	$effect(() => {
		if (typeof window === 'undefined') return;
		try {
			const f = window.localStorage.getItem(FILTER_KEY);
			if (f) activeTagIds = new Set(JSON.parse(f) as number[]);
			const s = window.localStorage.getItem(SORT_KEY);
			if (s === 'tag' || s === 'date') sortMode = s;
		} catch {
			// ignore
		}
	});

	function toggleTagFilter(id: number) {
		const next = new Set(activeTagIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		activeTagIds = next;
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(FILTER_KEY, JSON.stringify([...next]));
		}
	}

	function clearTagFilter() {
		activeTagIds = new Set();
		if (typeof window !== 'undefined') window.localStorage.removeItem(FILTER_KEY);
	}

	function setSortMode(m: SortMode) {
		sortMode = m;
		if (typeof window !== 'undefined') window.localStorage.setItem(SORT_KEY, m);
	}

	function taskPassesFilter(taskId: number): boolean {
		if (activeTagIds.size === 0) return true;
		const ids = data.taskTags[taskId] ?? [];
		return ids.some((id) => activeTagIds.has(id));
	}

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

	// Chronological order: dated tasks first (earliest dueAt), then
	// untimed tasks by createdAt. Used as the default sort and as the
	// secondary sort inside every tag group when sortMode === 'tag'.
	function byDateThenCreated(a: Task, b: Task): number {
		const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
		const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
		if (ad !== bd) return ad - bd;
		return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
	}

	const columns = $derived.by<Column[]>(() => {
		const cutoff = endOfToday();
		return data.lists.map((list) => {
			const listOpen = data.openTasks
				.filter((t) => t.listId === list.id)
				.filter((t) => taskPassesFilter(t.id));
			// Today: needs attention now — no due date, overdue, or due today.
			const today = listOpen
				.filter((t) => !t.dueAt || new Date(t.dueAt).getTime() <= cutoff)
				.sort(byDateThenCreated);
			// Scheduled: date-bound tasks that aren't overdue yet — i.e. due
			// today (still actionable) or in the future. Overdue items already
			// surface in Today with the red pill, so duplicating them here
			// just adds clutter.
			//
			// Overdue *recurring* tasks are a special case: the stored row
			// stays in Today (overdue), but we want a preview of the next
			// upcoming occurrence in Scheduled. The server pre-projects those
			// into projectedRecurring; merge them into this column's Scheduled.
			const projected = data.projectedRecurring
				.filter((t) => t.listId === list.id)
				.filter((t) => taskPassesFilter(t.id));
			const scheduled = buildScheduled(listOpen, projected).sort(byDateThenCreated);
			return {
				list,
				today,
				scheduled,
				done: data.doneEntries
					.filter((e) => e.task.listId === list.id)
					.filter((e) => taskPassesFilter(e.task.id))
			};
		});
	});

	type TagGroup = { tag: { id: number; name: string } | null; tasks: Task[] };

	/**
	 * Group `today` tasks by their primary tag (first tag alphabetically)
	 * when sortMode === 'tag'. Tasks without tags fall into a trailing
	 * group with `tag: null`. Each group is internally chronological.
	 */
	function groupByTag(tasks: Task[]): TagGroup[] {
		const buckets = new Map<number | 'untagged', TagGroup>();
		for (const t of tasks) {
			const tags = tagsFor(t.id).sort((a, b) => a.name.localeCompare(b.name));
			const primary = tags[0];
			const key: number | 'untagged' = primary ? primary.id : 'untagged';
			let bucket = buckets.get(key);
			if (!bucket) {
				bucket = { tag: primary ? { id: primary.id, name: primary.name } : null, tasks: [] };
				buckets.set(key, bucket);
			}
			bucket.tasks.push(t);
		}
		const tagged = [...buckets.values()].filter((g) => g.tag !== null);
		tagged.sort((a, b) => (a.tag!.name).localeCompare(b.tag!.name));
		const untagged = buckets.get('untagged');
		for (const g of tagged) g.tasks.sort(byDateThenCreated);
		if (untagged) {
			untagged.tasks.sort(byDateThenCreated);
			return [...tagged, untagged];
		}
		return tagged;
	}

	let checklistModal = $state(false);
	let applyOptionsOpen = $state(false);
	let checklistToApply = $state<Checklist | null>(null);
	let listModalOpen = $state(false);
	let listBeingEdited = $state<List | null>(null);
	let taskModalOpen = $state(false);
	let taskBeingEdited = $state<Task | null>(null);
	let expandedDone = $state<Record<number, boolean>>({});
	let expandedScheduled = $state<Record<number, boolean>>({});
	// Shared flow handles the "ask who completed an unassigned task" UX +
	// the actual POST. See lib/completion-flow.svelte.ts.
	const completion = new CompletionFlow();

	let filterOpen = $state(false);
	let filterSearch = $state('');
	const filteredTagList = $derived.by(() => {
		// Strip a leading `#` so users typing `#cleaning` get the same
		// results as `cleaning`. Tag names are stored lowercase via
		// normalizeTagName, but lowercase t.name too in case a future
		// bypass slips through.
		const q = filterSearch.trim().toLowerCase().replace(/^#+/, '');
		if (!q) return data.tags;
		return data.tags.filter((t) => t.name.toLowerCase().includes(q));
	});

	let toast = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	function showToast(msg: string) {
		toast = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2400);
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

	// Position of each list within the rendered column order; used to
	// gate the disabled state on the move-left/right buttons. The inbox
	// is included — its system marker only protects delete + picker
	// exclusion, not ordering.
	const listIdxById = $derived(new Map(data.lists.map((l, i) => [l.id, i])));

	let boardEl = $state<HTMLDivElement | null>(null);

	async function moveList(listId: number, direction: 'left' | 'right') {
		const idx = listIdxById.get(listId);
		if (idx === undefined) return;
		const target = direction === 'left' ? idx - 1 : idx + 1;
		if (target < 0 || target >= data.lists.length) return;

		// Stop the browser from yanking the board sideways when the
		// moved column's button keeps focus and slides to a new x in
		// the DOM. Capture scrollLeft + blur the trigger now, then
		// restore both scroll position and focus after Svelte commits
		// the reordered DOM. The button's DOM node is preserved by
		// Svelte's keyed each, so the captured ref stays valid.
		const scrollLeft = boardEl?.scrollLeft ?? 0;
		const trigger =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		trigger?.blur();

		const reordered = [...data.lists];
		[reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
		await fetch('/api/lists', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ orderedIds: reordered.map((l) => l.id) })
		});
		await invalidateAll();
		requestAnimationFrame(() => {
			if (boardEl) boardEl.scrollLeft = scrollLeft;
			trigger?.focus({ preventScroll: true });
		});
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

<section class="px-3 sm:px-8 pb-3 flex items-center justify-between gap-3 flex-wrap">
	<div>
		<h1 class="text-2xl sm:text-3xl xl:text-4xl font-display font-bold">
			{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
		</h1>
	</div>
	<div class="flex items-center gap-2 flex-wrap">
		{#if data.tags.length > 0}
			<div class="filter-wrap">
				<button
					type="button"
					class="filter-trigger"
					class:has-active={activeTagIds.size > 0}
					onclick={() => (filterOpen = !filterOpen)}
					aria-expanded={filterOpen}
					aria-haspopup="true"
					data-testid="open-tag-filter"
				>
					Filter{activeTagIds.size > 0 ? ` (${activeTagIds.size})` : ''} ▾
				</button>
				{#if filterOpen}
					<div
						class="filter-backdrop"
						role="presentation"
						onclick={() => (filterOpen = false)}
					></div>
					<div class="filter-popover" role="dialog" aria-label="Filter tasks by tag">
						<input
							type="search"
							bind:value={filterSearch}
							placeholder="Search tags…"
							class="filter-search"
							aria-label="Search tags"
							data-testid="tag-filter-search"
						/>
						<div class="filter-list" data-testid="tag-filter-list">
							{#each filteredTagList as t (t.id)}
								<button
									type="button"
									class="filter-item"
									class:active={activeTagIds.has(t.id)}
									onclick={() => toggleTagFilter(t.id)}
									aria-pressed={activeTagIds.has(t.id)}
									data-testid="tag-filter-{t.id}"
								>
									<span class="filter-check" aria-hidden="true">
										{activeTagIds.has(t.id) ? '✓' : ''}
									</span>
									<span>#{t.name}</span>
								</button>
							{:else}
								<div class="filter-empty">No tags match.</div>
							{/each}
						</div>
						{#if activeTagIds.size > 0}
							<button
								type="button"
								class="filter-clear-btn"
								onclick={() => {
									clearTagFilter();
								}}
							>
								Clear filter
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
		<label class="sort-select">
			<span class="text-xs text-[color:var(--color-muted)] mr-1">Sort by</span>
			<select
				value={sortMode}
				onchange={(e) => setSortMode((e.currentTarget as HTMLSelectElement).value as SortMode)}
				aria-label="Sort tasks by"
				data-testid="task-sort"
			>
				<option value="date">Date</option>
				<option value="tag">Tag</option>
			</select>
		</label>
		<button
			class="px-4 py-2 rounded-full bg-[color:var(--color-list-blue)] text-white text-sm font-semibold shadow"
			onclick={() => (checklistModal = true)}
			data-testid="open-checklists"
		>
			＋ Apply Checklist
		</button>
	</div>
</section>

<div class="board snap-cols no-scrollbar" data-testid="board" bind:this={boardEl}>
	{#each columns as col (col.list.id)}
		{@const today = col.today}
		{@const scheduled = col.scheduled}
		{@const done = col.done}
		{@const isDoneOpen = !!expandedDone[col.list.id]}
		{@const isScheduledOpen = !!expandedScheduled[col.list.id]}
		{@const li = listIdxById.get(col.list.id) ?? -1}
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
					class="col-move"
					aria-label="Move list left"
					title="Move list left"
					disabled={li <= 0}
					onclick={() => moveList(col.list.id, 'left')}
					data-testid="move-list-left-{col.list.id}"
				>
					‹
				</button>
				<button
					class="col-move"
					aria-label="Move list right"
					title="Move list right"
					disabled={li < 0 || li >= data.lists.length - 1}
					onclick={() => moveList(col.list.id, 'right')}
					data-testid="move-list-right-{col.list.id}"
				>
					›
				</button>
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
				{#if sortMode === 'tag'}
					{#each groupByTag(today) as group (group.tag?.id ?? 'untagged')}
						<div class="tag-group">
							<div class="tag-group-header">
								{group.tag ? `#${group.tag.name}` : 'Untagged'}
								<span class="tag-group-count">{group.tasks.length}</span>
							</div>
							{#each group.tasks as task (task.id)}
								<TaskRow
									{task}
									color={col.list.color}
									tags={tagsFor(task.id)}
									onComplete={completion.start}
									onopen={openTask}
								/>
							{/each}
						</div>
					{/each}
				{:else}
					{#each today as task (task.id)}
						<TaskRow
							{task}
							color={col.list.color}
							tags={tagsFor(task.id)}
							onComplete={completion.start}
							onopen={openTask}
						/>
					{/each}
				{/if}
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
										tags={tagsFor(task.id)}
										onComplete={completion.start}
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
										tags={tagsFor(entry.task.id)}
										onComplete={completion.start}
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
	onpick={(t) => {
		checklistToApply = t;
		checklistModal = false;
		applyOptionsOpen = true;
	}}
/>

<ApplyChecklistOptionsModal
	open={applyOptionsOpen}
	checklist={checklistToApply}
	tags={data.tags}
	defaultTagIds={checklistToApply ? (data.checklistTags[checklistToApply.id] ?? []) : []}
	oncancel={() => {
		applyOptionsOpen = false;
		checklistModal = true;
	}}
	onapplied={async (n) => {
		applyOptionsOpen = false;
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
	tags={data.tags}
	initialTagIds={taskBeingEdited ? (data.taskTags[taskBeingEdited.id] ?? []) : []}
	onclose={() => (taskModalOpen = false)}
	onsaved={async () => {
		await invalidateAll();
	}}
/>

<CompletedByModal
	open={completion.pending !== null}
	users={data.users}
	taskTitle={completion.pending?.title ?? ''}
	onpick={completion.pickCompletedBy}
	oncancel={completion.cancelPicker}
/>

{#if toast}
	<div class="toast" role="status">{toast}</div>
{/if}

<style>
	.filter-wrap {
		position: relative;
	}
	.filter-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.85rem;
		border-radius: 9999px;
		background: var(--color-card);
		color: var(--color-ink-2);
		font-size: 0.85rem;
		font-weight: 600;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}
	.filter-trigger:hover {
		color: var(--color-ink);
	}
	.filter-trigger.has-active {
		color: var(--color-list-blue);
		background: color-mix(in srgb, var(--color-list-blue) 14%, var(--color-card));
	}
	.filter-backdrop {
		position: fixed;
		inset: 0;
		z-index: 30;
	}
	.filter-popover {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		z-index: 40;
		width: min(280px, calc(100vw - 2rem));
		background: var(--color-card);
		border-radius: 0.9rem;
		padding: 0.65rem;
		box-shadow: 0 12px 32px -10px var(--color-shadow-lg), 0 0 0 1px var(--color-divider);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.filter-search {
		padding: 0.45rem 0.7rem;
		background: var(--color-canvas);
		border-radius: 0.55rem;
		font-size: 0.88rem;
		outline: none;
	}
	.filter-search:focus {
		box-shadow: 0 0 0 2px var(--color-list-blue);
	}
	.filter-list {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		max-height: 50vh;
		overflow-y: auto;
	}
	.filter-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		text-align: left;
		color: var(--color-ink);
		background: transparent;
	}
	.filter-item:hover {
		background: var(--color-canvas);
	}
	.filter-item.active {
		color: var(--color-list-blue);
		font-weight: 600;
	}
	.filter-check {
		display: inline-flex;
		justify-content: center;
		width: 1rem;
		color: var(--color-list-blue);
		font-weight: 700;
	}
	.filter-empty {
		padding: 0.5rem 0.6rem;
		font-size: 0.85rem;
		color: var(--color-muted);
	}
	.filter-clear-btn {
		padding: 0.4rem 0.6rem;
		border-radius: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-list-red);
		background: transparent;
		text-align: left;
	}
	.filter-clear-btn:hover {
		background: color-mix(in srgb, var(--color-list-red) 10%, transparent);
	}
	.sort-select {
		display: inline-flex;
		align-items: center;
		background: var(--color-card);
		padding: 0.25rem 0.6rem;
		border-radius: 9999px;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.sort-select select {
		background: transparent;
		border: none;
		outline: none;
		color: var(--color-ink);
		font-weight: 600;
		cursor: pointer;
	}
	.tag-group {
		margin-bottom: 0.5rem;
	}
	.tag-group-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-muted);
		padding: 0.5rem 0 0.25rem;
		border-top: 1px solid var(--color-divider);
	}
	.tag-group:first-child .tag-group-header {
		border-top: none;
		padding-top: 0;
	}
	.tag-group-count {
		font-weight: 600;
		opacity: 0.7;
	}
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
	.col-move {
		padding: 0 0.4rem;
		font-size: 1.2rem;
		color: var(--color-muted);
		line-height: 1;
	}
	.col-move:hover:not(:disabled) {
		color: var(--color-ink);
	}
	.col-move:disabled {
		opacity: 0.3;
		cursor: not-allowed;
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
