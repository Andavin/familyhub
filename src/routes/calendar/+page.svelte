<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import EventDetailModal, {
		type EventDetail
	} from '$lib/components/EventDetailModal.svelte';
	import TaskDetailModal from '$lib/components/TaskDetailModal.svelte';
	import CompletedByModal from '$lib/components/CompletedByModal.svelte';
	import { CompletionFlow } from '$lib/completion-flow.svelte';
	import { colorVar } from '$lib/colors';
	import type { PageData } from './$types';
	import type { Task } from '$lib/server/schema';
	import type { DoneEntry } from '$lib/server/done';

	let { data }: { data: PageData } = $props();

	// Per-person filter — null is the "unassigned / shared" bucket. Persist in
	// localStorage so the kiosk remembers which chips you toggled.
	const FILTER_KEY = 'fh_cal_filter';
	type PersonId = number | 'shared';
	const allChipIds = $derived<PersonId[]>([
		...data.users.map((u) => u.id as PersonId),
		'shared'
	]);

	let activeIds = $state<Set<PersonId>>(new Set());

	$effect(() => {
		// Initialise from storage on mount; default to everyone.
		if (typeof window === 'undefined') return;
		try {
			const raw = window.localStorage.getItem(FILTER_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as (number | 'shared')[];
				activeIds = new Set(parsed);
				return;
			}
		} catch {
			// ignore
		}
		activeIds = new Set(allChipIds);
	});

	function toggleChip(id: PersonId) {
		const next = new Set(activeIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		activeIds = next;
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(FILTER_KEY, JSON.stringify([...next]));
		}
	}

	function isPersonVisible(uid: number | null): boolean {
		const id: PersonId = uid ?? 'shared';
		return activeIds.has(id);
	}

	const monthName = $derived(
		new Date(data.month.year, data.month.month, 1).toLocaleString([], {
			month: 'long',
			year: 'numeric'
		})
	);

	function buildGrid(year: number, month: number) {
		const firstOfMonth = new Date(year, month, 1);
		const startOffset = firstOfMonth.getDay();
		const start = new Date(year, month, 1 - startOffset);
		const cells: Date[] = [];
		for (let i = 0; i < 42; i++) {
			cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
		}
		return cells;
	}
	const grid = $derived(buildGrid(data.month.year, data.month.month));

	function sameDay(a: Date, b: Date) {
		return (
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate()
		);
	}

	function startOfUtcDay(d: Date): Date {
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	}

	type Pill = {
		key: string;
		label: string;
		color: string;
		kind: 'event' | 'reminder' | 'ghost';
		time: number;
		// Whether this pill belongs in a specific hour slot in the day view.
		// false for: all-day events, reminders without dueHasTime, ghosts of
		// untimed recurring tasks. Those go in the "All day" section.
		hasTime: boolean;
		task?: Task;
		event?: EventDetail;
		location?: string | null;
		endTime?: number;
		allDay?: boolean;
	};

	function userColor(uid: number | null): string {
		const u = data.users.find((u) => u.id === uid);
		return u?.color ?? 'orange';
	}

	function pillsForDay(d: Date): Pill[] {
		const pills: Pill[] = [];
		for (const e of data.events) {
			if (!isPersonVisible(e.userId)) continue;
			const start = new Date(e.start);
			const end = new Date(e.end);
			// All-day events span [start, end) in UTC date-only. Render the
			// pill on every day from start (inclusive) up to end (exclusive).
			const matches = e.allDay
				? d.getTime() >= startOfUtcDay(start).getTime() &&
				  d.getTime() < startOfUtcDay(end).getTime()
				: sameDay(start, d);
			if (matches) {
				pills.push({
					key: 'e' + e.uid + start.toISOString(),
					label: e.summary,
					color: e.color ?? 'blue',
					kind: 'event',
					time: start.getTime(),
					hasTime: !e.allDay,
					endTime: end.getTime(),
					location: e.location,
					allDay: e.allDay,
					event: {
						summary: e.summary,
						location: e.location,
						description: e.description,
						start,
						end,
						allDay: e.allDay,
						feedName: e.feedName,
						color: e.color
					}
				});
			}
		}
		for (const t of data.tasks) {
			if (!t.dueAt) continue;
			if (!isPersonVisible(t.assigneeId)) continue;
			const due = new Date(t.dueAt);
			if (sameDay(due, d)) {
				pills.push({
					key: 't' + t.id,
					label: t.title,
					color: userColor(t.assigneeId),
					kind: 'reminder',
					time: due.getTime(),
					hasTime: t.dueHasTime,
					task: t
				});
			}
		}
		for (const g of data.ghosts) {
			const at = new Date(g.at);
			// Ghosts come from tasks; filter by the underlying assignee. We
			// don't have it directly on the ghost record, so look it up.
			const t = data.tasks.find((x) => x.id === g.taskId);
			if (t && !isPersonVisible(t.assigneeId)) continue;
			if (sameDay(at, d)) {
				pills.push({
					key: 'g' + g.taskId + g.at,
					label: g.title,
					color: g.color,
					kind: 'ghost',
					time: g.at,
					hasTime: t?.dueHasTime ?? false
				});
			}
		}
		return pills.sort((a, b) => a.time - b.time);
	}

	function completedForDay(d: Date): DoneEntry[] {
		return data.doneEntries.filter(
			(e) =>
				e.task.completedAt &&
				sameDay(new Date(e.task.completedAt), d) &&
				isPersonVisible(e.task.assigneeId)
		);
	}

	function colorOrLiteral(c: string): string {
		if (c.startsWith('#') || c.startsWith('rgb')) return c;
		return colorVar(c);
	}

	function jump(delta: number) {
		const next = new Date(data.month.year, data.month.month + delta, 1);
		const m = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
		goto(`/calendar?month=${m}`);
	}

	const today = new Date();

	let selected = $state<Date | null>(today);
	// On phone we hide the day-detail pane by default and only surface it
	// as a modal sheet when the user taps a day — otherwise the entire
	// pane sits below the month grid and you'd have to scroll past the
	// whole calendar to see what's happening on a given day.
	let showDayModal = $state(false);
	function isPhone(): boolean {
		if (typeof window === 'undefined') return false;
		return window.matchMedia('(max-width: 767px)').matches;
	}
	function selectDay(d: Date) {
		selected = new Date(d);
		if (isPhone()) showDayModal = true;
	}

	$effect(() => {
		// reset selection when month changes
		selected = new Date(data.month.year, data.month.month, today.getDate());
	});

	$effect(() => {
		if (!showDayModal) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') showDayModal = false;
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
	const dayPills = $derived(selected ? pillsForDay(selected) : []);
	const dayDone = $derived(selected ? completedForDay(selected) : []);
	const untimedPills = $derived(dayPills.filter((p) => !p.hasTime));
	const timedPills = $derived(dayPills.filter((p) => p.hasTime));
	const hourSlots = Array.from({ length: 24 }, (_, h) => h);

	let completedExpanded = $state(false);
	let eventModalOpen = $state(false);
	let eventBeingShown = $state<EventDetail | null>(null);
	let taskModalOpen = $state(false);
	let taskBeingEdited = $state<Task | null>(null);
	let overflowOpen = $state(false);
	let overflowItems = $state<Pill[]>([]);
	let overflowHourLabel = $state('');
	// Shared completion flow — see lib/completion-flow.svelte.ts.
	const completion = new CompletionFlow();

	function openEvent(ev: EventDetail) {
		eventBeingShown = ev;
		eventModalOpen = true;
	}

	function openTaskDetail(t: Task) {
		taskBeingEdited = t;
		taskModalOpen = true;
	}

	function openOverflow(hour: number, items: Pill[]) {
		overflowItems = items;
		overflowHourLabel = new Date(2026, 0, 1, hour).toLocaleTimeString([], {
			hour: 'numeric'
		});
		overflowOpen = true;
	}

	// Bind to the shared completion flow's start handler so day-view
	// rows behave identically to the tasks board (modal for unassigned,
	// straight POST otherwise).
	const setComplete = completion.start;
</script>

{#snippet pillRow(p: Pill)}
	{#if p.kind === 'event' && p.event}
		<button
			type="button"
			class="event-block"
			style="--pc: {colorOrLiteral(p.color)}"
			onclick={() => openEvent(p.event!)}
		>
			<span class="event-title">{p.label}</span>
		</button>
	{:else if p.kind === 'reminder' && p.task}
		<div class="task-line" style="--pc: {colorOrLiteral(p.color)}">
			<Checkbox
				checked={false}
				color={p.color}
				size={18}
				label={`Mark "${p.task.title}" complete`}
				onchange={(next) => p.task && setComplete(p.task, next)}
			/>
			<button
				type="button"
				class="task-title-btn"
				onclick={() => p.task && openTaskDetail(p.task)}
			>
				{p.label}
			</button>
		</div>
	{:else}
		<div class="ghost-line" style="--pc: {colorOrLiteral(p.color)}">
			<span class="rdot small" aria-hidden="true"></span>
			<span class="ghost-title">{p.label}</span>
		</div>
	{/if}
{/snippet}

<section class="px-3 sm:px-8 pb-3 flex items-center justify-between gap-3 flex-wrap">
	<div>
		<h1 class="text-2xl sm:text-3xl xl:text-4xl font-display font-bold">{monthName}</h1>
	</div>
	<div class="flex gap-2 items-center flex-wrap">
		<div class="chips" data-testid="filter-chips">
			{#each data.users as u (u.id)}
				<button
					type="button"
					class="chip"
					class:active={activeIds.has(u.id)}
					style="--c: {colorVar(u.color)}"
					onclick={() => toggleChip(u.id)}
					aria-pressed={activeIds.has(u.id)}
					data-testid="chip-{u.id}"
				>
					<span class="chip-dot"></span>
					<span class="chip-emoji">{u.emoji}</span>
					<span>{u.name}</span>
				</button>
			{/each}
			<button
				type="button"
				class="chip"
				class:active={activeIds.has('shared')}
				style="--c: var(--color-muted)"
				onclick={() => toggleChip('shared')}
				aria-pressed={activeIds.has('shared')}
				data-testid="chip-shared"
			>
				<span class="chip-dot"></span>
				<span>Shared</span>
			</button>
		</div>
		<button class="nav-btn" aria-label="Previous month" onclick={() => jump(-1)}>‹</button>
		<button class="nav-btn" aria-label="Today" onclick={() => goto('/calendar')}>Today</button>
		<button class="nav-btn" aria-label="Next month" onclick={() => jump(1)}>›</button>
	</div>
</section>

<div class="px-4 sm:px-8 pb-8 flex-1 flex flex-col gap-4 lg:flex-row">
	<div class="cal flex-1">
		<div class="dow">
			{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as d, i (i)}
				<div class:weekend={i === 0 || i === 6}>{d}</div>
			{/each}
		</div>
		<div class="grid">
			{#each grid as d (d.toISOString())}
				{@const pills = pillsForDay(d)}
				{@const inMonth = d.getMonth() === data.month.month}
				{@const isToday = sameDay(d, today)}
				{@const isSelected = selected && sameDay(d, selected)}
				<button
					class="cell"
					class:out={!inMonth}
					class:today={isToday}
					class:selected={isSelected}
					onclick={() => selectDay(d)}
					data-testid="cal-day-{d.toISOString().slice(0, 10)}"
				>
					<div class="num">{d.getDate()}</div>
					<div class="pills">
						{#each pills.slice(0, 3) as p (p.key)}
							<div
								class="pill"
								class:reminder={p.kind === 'reminder' || p.kind === 'ghost'}
								class:ghost={p.kind === 'ghost'}
								style="--pc: {colorOrLiteral(p.color)}"
							>
								{#if p.kind === 'reminder' || p.kind === 'ghost'}<span class="rdot"></span>{/if}
								<span class="plabel">{p.label}</span>
							</div>
						{/each}
						{#if pills.length > 3}
							<div class="more">+{pills.length - 3} more</div>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	</div>

	{#if showDayModal}
		<button
			type="button"
			class="phone-modal-backdrop"
			onclick={() => (showDayModal = false)}
			aria-label="Close day details"
		></button>
	{/if}
	<aside class="day-detail" class:phone-modal={showDayModal}>
		<header>
			<div>
				<div class="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
					{selected ? selected.toLocaleDateString([], { weekday: 'long' }) : ''}
				</div>
				<div class="text-3xl font-display font-bold">
					{selected ? selected.getDate() : ''}
					<span class="text-base font-normal text-[color:var(--color-muted)]">
						{selected ? selected.toLocaleString([], { month: 'long' }) : ''}
					</span>
				</div>
			</div>
			<button
				type="button"
				class="phone-close-btn"
				onclick={() => (showDayModal = false)}
				aria-label="Close"
				data-testid="day-modal-close"
			>
				✕
			</button>
		</header>

		<div class="day-list" data-testid="day-list">
			{#if untimedPills.length > 0}
				<div class="all-day">
					<div class="all-day-label">All day</div>
					<div class="all-day-rows">
						{#each untimedPills as p (p.key)}
							{@render pillRow(p)}
						{/each}
					</div>
				</div>
			{/if}

			<div class="hour-grid">
				{#each hourSlots as h (h)}
					{@const inHour = timedPills.filter((p) => new Date(p.time).getHours() === h)}
					{@const visible = inHour.length <= 2 ? inHour : inHour.slice(0, 1)}
					{@const overflow = inHour.length - visible.length}
					<div class="hour-row" class:filled={inHour.length > 0}>
						<span class="hour-label">
							{new Date(2026, 0, 1, h).toLocaleTimeString([], {
								hour: 'numeric'
							})}
						</span>
						<div class="hour-content">
							{#each visible as p (p.key)}
								<div class="hour-cell">
									{@render pillRow(p)}
								</div>
							{/each}
							{#if overflow > 0}
								<button
									type="button"
									class="hour-cell overflow-btn"
									onclick={() => openOverflow(h, inHour)}
								>
									+{overflow} more
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>

		{#if dayDone.length > 0}
			<div class="completed-block">
				<button
					class="completed-toggle"
					aria-expanded={completedExpanded}
					onclick={() => (completedExpanded = !completedExpanded)}
					data-testid="cal-toggle-completed"
				>
					<span class="chev" class:open={completedExpanded}>›</span>
					<span>Completed</span>
					<span class="completed-count">{dayDone.length}</span>
				</button>
				{#if completedExpanded}
					<div class="completed-list">
						{#each dayDone as entry (entry.uid)}
							{@const t = entry.task}
							<div
								class="day-row"
								style="--pc: {colorOrLiteral(userColor(t.assigneeId))}"
							>
								<Checkbox
									checked
									color={userColor(t.assigneeId)}
									size={20}
									readOnly={!!entry.orphan}
									label={`Mark "${t.title}" incomplete`}
									onchange={(next) => setComplete(t, next)}
								/>
								<div class="flex-1 min-w-0">
									<div class="font-medium truncate done-title">{t.title}</div>
									<div class="text-xs text-[color:var(--color-muted)]">
										Completed ·
										{new Date(t.completedAt as Date).toLocaleTimeString([], {
											hour: 'numeric',
											minute: '2-digit'
										})}
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	</aside>
</div>

<EventDetailModal
	open={eventModalOpen}
	event={eventBeingShown}
	onclose={() => (eventModalOpen = false)}
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

{#if overflowOpen}
	<div class="backdrop" role="presentation" onclick={() => (overflowOpen = false)}></div>
	<div class="modal hour-overflow-modal" role="dialog" aria-modal="true" aria-label="Hour items">
		<header class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-display font-bold">{overflowHourLabel}</h2>
			<button
				class="text-xl text-[color:var(--color-muted)]"
				onclick={() => (overflowOpen = false)}
				aria-label="Close"
			>
				✕
			</button>
		</header>
		<div class="overflow-list">
			{#each overflowItems as p (p.key)}
				<div class="overflow-item">{@render pillRow(p)}</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.nav-btn {
		padding: 0.4rem 0.85rem;
		border-radius: 9999px;
		background: var(--color-card);
		font-size: 0.9rem;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}
	.chips {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.75rem;
		border-radius: 9999px;
		background: var(--color-card);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--color-muted);
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		opacity: 0.55;
		transition: opacity 120ms ease, background 120ms ease;
	}
	.chip.active {
		opacity: 1;
		color: var(--color-ink);
	}
	.chip-dot {
		width: 9px;
		height: 9px;
		border-radius: 9999px;
		background: var(--c);
	}
	.chip-emoji {
		font-size: 0.95rem;
		line-height: 1;
	}
	.cal {
		background: var(--color-card);
		border-radius: 1.25rem;
		padding: 0.75rem 1rem 1rem;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}
	.dow {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 1px;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-muted);
		text-align: center;
		padding: 0.5rem 0;
	}
	.weekend {
		color: color-mix(in srgb, var(--color-muted) 75%, white);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
	}
	.cell {
		min-height: 88px;
		padding: 0.4rem 0.5rem;
		border-radius: 0.6rem;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		background: var(--color-canvas);
		transition: background 120ms ease;
		overflow: hidden;
	}
	.cell:hover {
		background: var(--color-canvas-2);
	}
	.cell.out {
		opacity: 0.4;
	}
	.cell.today .num {
		background: var(--color-list-red);
		color: white;
		border-radius: 9999px;
		width: 1.7rem;
		height: 1.7rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
	}
	.cell.selected {
		outline: 2px solid var(--color-list-blue);
		outline-offset: -2px;
	}
	.num {
		font-size: 0.88rem;
		font-weight: 600;
	}
	.pills {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.pill {
		font-size: 0.7rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.3rem;
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--pc) 18%, transparent);
		color: color-mix(in srgb, var(--pc) 65%, var(--color-ink));
	}
	.pill .plabel {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pill.reminder {
		background: transparent;
		color: var(--color-ink);
	}
	.pill.ghost {
		opacity: 0.45;
	}
	.rdot {
		width: 7px;
		height: 7px;
		border-radius: 9999px;
		border: 1.4px solid var(--pc);
		flex-shrink: 0;
	}
	.more {
		font-size: 0.65rem;
		color: var(--color-muted);
	}
	.day-detail {
		background: var(--color-card);
		border-radius: 1.25rem;
		padding: 1rem 1.25rem;
		min-width: 280px;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}
	.day-detail header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}
	@media (min-width: 1024px) {
		.day-detail {
			width: 320px;
			flex-shrink: 0;
		}
	}

	/*
	 * Phone: hide the inline day-detail entirely and re-render it as a
	 * fixed bottom-sheet when the user taps a day. The backdrop sits
	 * just below it so taps outside dismiss. The close button (✕) only
	 * shows on phone — desktop / tablet keep the always-visible pane.
	 */
	.phone-close-btn {
		display: none;
	}
	@media (max-width: 767px) {
		.day-detail {
			display: none;
		}
		.day-detail.phone-modal {
			display: block;
			position: fixed;
			top: 2rem;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 51;
			margin: 0;
			min-width: 0;
			overflow-y: auto;
			border-radius: 1.25rem 1.25rem 0 0;
			padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
			box-shadow: 0 -10px 30px -8px var(--color-shadow-lg);
		}
		.phone-modal-backdrop {
			position: fixed;
			inset: 0;
			background: var(--color-backdrop);
			z-index: 50;
			border: none;
			padding: 0;
		}
		.day-detail.phone-modal .phone-close-btn {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 2rem;
			height: 2rem;
			background: var(--color-canvas);
			color: var(--color-ink-2);
			border-radius: 9999px;
			font-size: 1rem;
			flex-shrink: 0;
		}
	}
	.day-list {
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.all-day {
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--color-divider);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.all-day-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-muted);
	}
	.all-day-rows {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.hour-grid {
		display: flex;
		flex-direction: column;
		max-height: 60vh;
		overflow-y: auto;
		margin-top: 0.25rem;
	}
	.hour-row {
		display: grid;
		grid-template-columns: 48px 1fr;
		gap: 0.5rem;
		min-height: 32px;
		padding: 0.25rem 0;
		border-top: 1px solid var(--color-divider);
		align-items: start;
	}
	.hour-row:first-child {
		border-top: none;
	}
	.hour-label {
		font-size: 0.7rem;
		color: var(--color-muted);
		text-align: right;
		padding-top: 0.15rem;
	}
	.hour-content {
		display: flex;
		gap: 0.4rem;
		min-width: 0;
	}
	.hour-cell {
		flex: 1 1 0;
		min-width: 0;
	}
	.overflow-btn {
		padding: 0.4rem 0.55rem;
		border-radius: 0.4rem;
		background: var(--color-canvas);
		color: var(--color-muted);
		font-size: 0.78rem;
		font-weight: 600;
		text-align: center;
		cursor: pointer;
		transition: background 100ms ease;
	}
	.overflow-btn:hover {
		background: var(--color-canvas-2);
		color: var(--color-ink);
	}
	.day-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.event-block {
		display: block;
		width: 100%;
		text-align: left;
		padding: 0.4rem 0.6rem;
		border-radius: 0.4rem;
		background: color-mix(in srgb, var(--pc) 18%, white);
		border-left: 3px solid var(--pc);
		font-size: 0.88rem;
		line-height: 1.25;
		transition: background 120ms ease;
		cursor: pointer;
	}
	.event-block:hover {
		background: color-mix(in srgb, var(--pc) 28%, white);
	}
	.event-title {
		display: block;
		font-weight: 600;
		color: color-mix(in srgb, var(--pc) 65%, var(--color-ink));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.task-line {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}
	.task-title-btn {
		flex: 1;
		text-align: left;
		font-size: 0.92rem;
		font-weight: 500;
		background: transparent;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.task-title-btn:hover {
		text-decoration: underline;
		text-decoration-color: var(--color-muted);
		text-underline-offset: 3px;
	}
	.ghost-line {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		opacity: 0.55;
		font-size: 0.92rem;
	}
	.ghost-line .rdot.small {
		width: 8px;
		height: 8px;
		border-width: 1.6px;
	}
	.ghost-title {
		color: var(--color-muted);
		font-style: italic;
	}
	.completed-block {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-divider);
	}
	.completed-toggle {
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
	.completed-count {
		margin-left: auto;
		color: var(--color-muted);
	}
	.completed-list {
		margin-top: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.completed-list .done-title {
		text-decoration: line-through;
		color: var(--color-muted);
	}
	.backdrop {
		position: fixed;
		inset: 0;
		background: var(--color-backdrop);
		z-index: 40;
	}
	.modal.hour-overflow-modal {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 2rem));
		max-height: 90vh;
		overflow-y: auto;
		background: var(--color-card);
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px var(--color-shadow-lg);
	}
	.overflow-list {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
</style>
