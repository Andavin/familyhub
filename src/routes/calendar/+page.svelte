<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import EventDetailModal, {
		type EventDetail
	} from '$lib/components/EventDetailModal.svelte';
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
	$effect(() => {
		// reset selection when month changes
		selected = new Date(data.month.year, data.month.month, today.getDate());
	});
	const dayPills = $derived(selected ? pillsForDay(selected) : []);
	const dayDone = $derived(selected ? completedForDay(selected) : []);
	const untimedPills = $derived(dayPills.filter((p) => !p.hasTime));
	const timedPills = $derived(dayPills.filter((p) => p.hasTime));
	const hourSlots = Array.from({ length: 24 }, (_, h) => h);

	let completedExpanded = $state(false);
	let eventModalOpen = $state(false);
	let eventBeingShown = $state<EventDetail | null>(null);

	function openEvent(ev: EventDetail) {
		eventBeingShown = ev;
		eventModalOpen = true;
	}

	async function setComplete(t: Task, done: boolean) {
		await fetch(`/api/tasks/${t.id}/complete`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: done ? 'complete' : 'uncomplete' })
		});
		await invalidateAll();
	}
</script>

<section class="px-4 sm:px-8 pb-3 flex items-center justify-between gap-3 flex-wrap">
	<div>
		<h1 class="text-3xl sm:text-4xl font-display font-bold">{monthName}</h1>
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
					onclick={() => (selected = new Date(d))}
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

	<aside class="day-detail">
		<header>
			<div class="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
				{selected ? selected.toLocaleDateString([], { weekday: 'long' }) : ''}
			</div>
			<div class="text-3xl font-display font-bold">
				{selected ? selected.getDate() : ''}
				<span class="text-base font-normal text-[color:var(--color-muted)]">
					{selected ? selected.toLocaleString([], { month: 'long' }) : ''}
				</span>
			</div>
		</header>
		{#snippet pillRow(p: Pill)}
			{@const meta =
				p.kind === 'event' && p.allDay
					? 'All day'
					: p.kind === 'event' && p.endTime && p.endTime !== p.time
						? new Date(p.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) +
							' – ' +
							new Date(p.endTime).toLocaleTimeString([], {
								hour: 'numeric',
								minute: '2-digit'
							})
						: p.hasTime
							? new Date(p.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
							: ''}
			{@const kindLabel =
				p.kind === 'event' ? 'Event' : p.kind === 'ghost' ? 'Repeats' : 'Reminder'}
			{#if p.kind === 'event' && p.event}
				<button
					type="button"
					class="day-row clickable"
					style="--pc: {colorOrLiteral(p.color)}"
					onclick={() => openEvent(p.event!)}
				>
					<span class="ebar" aria-hidden="true"></span>
					<div class="flex-1 min-w-0 text-left">
						<div class="font-medium truncate">{p.label}</div>
						<div class="text-xs text-[color:var(--color-muted)]">
							{kindLabel}{meta ? ' · ' + meta : ''}
						</div>
						{#if p.location}
							<div class="text-xs text-[color:var(--color-muted)] truncate">
								📍 {p.location}
							</div>
						{/if}
					</div>
				</button>
			{:else}
				<div
					class="day-row"
					class:ghost={p.kind === 'ghost'}
					style="--pc: {colorOrLiteral(p.color)}"
				>
					{#if p.kind === 'reminder' && p.task}
						<Checkbox
							checked={false}
							color={p.color}
							size={20}
							label={`Mark "${p.task.title}" complete`}
							onchange={(next) => p.task && setComplete(p.task, next)}
						/>
					{:else}
						<span class="rdot big" aria-hidden="true"></span>
					{/if}
					<div class="flex-1 min-w-0">
						<div class="font-medium truncate">{p.label}</div>
						<div class="text-xs text-[color:var(--color-muted)]">
							{kindLabel}{meta ? ' · ' + meta : ''}
						</div>
					</div>
				</div>
			{/if}
		{/snippet}

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
					<div class="hour-row" class:filled={timedPills.some((p) => new Date(p.time).getHours() === h)}>
						<span class="hour-label">
							{new Date(2026, 0, 1, h).toLocaleTimeString([], {
								hour: 'numeric'
							})}
						</span>
						<div class="hour-content">
							{#each timedPills.filter((p) => new Date(p.time).getHours() === h) as p (p.key)}
								{@render pillRow(p)}
							{/each}
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

<style>
	.nav-btn {
		padding: 0.4rem 0.85rem;
		border-radius: 9999px;
		background: white;
		font-size: 0.9rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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
		background: white;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--color-muted);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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
		background: white;
		border-radius: 1.25rem;
		padding: 0.75rem 1rem 1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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
	.day-row.ghost {
		opacity: 0.5;
	}
	.rdot {
		width: 7px;
		height: 7px;
		border-radius: 9999px;
		border: 1.4px solid var(--pc);
		flex-shrink: 0;
	}
	.rdot.big {
		width: 10px;
		height: 10px;
		border-width: 2px;
	}
	.ebar {
		width: 4px;
		align-self: stretch;
		background: var(--pc);
		border-radius: 4px;
	}
	.more {
		font-size: 0.65rem;
		color: var(--color-muted);
	}
	.day-detail {
		background: white;
		border-radius: 1.25rem;
		padding: 1rem 1.25rem;
		min-width: 280px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}
	@media (min-width: 1024px) {
		.day-detail {
			width: 320px;
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
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}
	.day-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	button.day-row {
		width: 100%;
		text-align: left;
		background: transparent;
	}
	.day-row.clickable {
		cursor: pointer;
		padding: 0.25rem;
		margin: -0.25rem;
		border-radius: 0.45rem;
		transition: background 100ms ease;
	}
	.day-row.clickable:hover {
		background: var(--color-canvas);
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
</style>
