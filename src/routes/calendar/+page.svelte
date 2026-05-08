<script lang="ts">
	import { goto } from '$app/navigation';
	import { colorVar } from '$lib/colors';
	import type { PageData } from './$types';
	import type { Task, User } from '$lib/server/schema';

	let { data }: { data: PageData } = $props();

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

	type Pill = {
		key: string;
		label: string;
		color: string;
		kind: 'event' | 'reminder';
		time: number;
	};

	function userColor(uid: number | null): string {
		const u = data.users.find((u) => u.id === uid);
		return u?.color ?? 'orange';
	}

	function pillsForDay(d: Date): Pill[] {
		const pills: Pill[] = [];
		for (const e of data.events) {
			const start = new Date(e.start);
			if (sameDay(start, d)) {
				pills.push({
					key: 'e' + e.uid + start.toISOString(),
					label: e.summary,
					color: e.color ?? 'blue',
					kind: 'event',
					time: start.getTime()
				});
			}
		}
		for (const t of data.tasks) {
			if (!t.dueAt) continue;
			const due = new Date(t.dueAt);
			if (sameDay(due, d)) {
				pills.push({
					key: 't' + t.id,
					label: t.title,
					color: userColor(t.assigneeId),
					kind: 'reminder',
					time: due.getTime()
				});
			}
		}
		return pills.sort((a, b) => a.time - b.time);
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
</script>

<section class="px-4 sm:px-8 pb-3 flex items-center justify-between">
	<div>
		<h1 class="text-3xl sm:text-4xl font-display font-bold">{monthName}</h1>
		<p class="text-sm text-[color:var(--color-muted)]">
			Family calendar &amp; reminders
		</p>
	</div>
	<div class="flex gap-1">
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
							<div class="pill" class:reminder={p.kind === 'reminder'} style="--pc: {colorOrLiteral(p.color)}">
								{#if p.kind === 'reminder'}<span class="rdot"></span>{/if}
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
				{selected
					? selected.toLocaleDateString([], { weekday: 'long' })
					: ''}
			</div>
			<div class="text-3xl font-display font-bold">
				{selected ? selected.getDate() : ''}
				<span class="text-base font-normal text-[color:var(--color-muted)]">
					{selected ? selected.toLocaleString([], { month: 'long' }) : ''}
				</span>
			</div>
		</header>
		<div class="day-list">
			{#each dayPills as p (p.key)}
				<div class="day-row" style="--pc: {colorOrLiteral(p.color)}">
					{#if p.kind === 'reminder'}
						<span class="rdot big"></span>
					{:else}
						<span class="ebar"></span>
					{/if}
					<div class="flex-1 min-w-0">
						<div class="font-medium truncate">{p.label}</div>
						<div class="text-xs text-[color:var(--color-muted)]">
							{p.kind === 'reminder' ? 'Reminder' : 'Event'} ·
							{new Date(p.time).toLocaleTimeString([], {
								hour: 'numeric',
								minute: '2-digit'
							})}
						</div>
					</div>
				</div>
			{:else}
				<p class="text-[color:var(--color-muted)] text-sm">Nothing scheduled.</p>
			{/each}
		</div>
	</aside>
</div>

<style>
	.nav-btn {
		padding: 0.4rem 0.85rem;
		border-radius: 9999px;
		background: white;
		font-size: 0.9rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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
	.day-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
</style>
