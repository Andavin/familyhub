<script lang="ts">
	import Checkbox from './Checkbox.svelte';
	import { formatDueLabel, isOverdue } from '$lib/format';
	import type { Task } from '$lib/server/schema';

	type Props = {
		task: Task;
		color: string;
		// `done` is the new desired state from the checkbox toggle.
		onComplete: (task: Task, done: boolean) => void;
		onopen?: (task: Task) => void;
		// True for orphan completion rows (parent task deleted) — disables
		// both the checkbox and the title-tap handler.
		readOnly?: boolean;
	};
	let { task, color, onComplete, onopen, readOnly = false }: Props = $props();

	const completed = $derived(!!task.completedAt);
	const due = $derived(task.dueAt ? new Date(task.dueAt) : null);
	const overdue = $derived(!completed && isOverdue(due, task.dueHasTime));
	const priorityLabel = $derived(
		task.priority === 1 ? '!' : task.priority === 2 ? '!!' : task.priority === 3 ? '!!!' : ''
	);

	function dueText(d: Date): string {
		if (task.dueHasTime) return formatDueLabel(d);
		return formatDueLabel(d).replace(/ at \d.*/, '');
	}

	function open(e: MouseEvent | KeyboardEvent) {
		if (e.target instanceof HTMLElement && e.target.closest('button')) return;
		onopen?.(task);
	}
</script>

<div class="task-row" class:task-done={completed} data-testid="task-row">
	<Checkbox
		checked={completed}
		{color}
		{readOnly}
		label={completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
		onchange={(next) => onComplete(task, next)}
	/>
	{#snippet body()}
		<div class="flex items-center gap-1.5 min-w-0">
			{#if priorityLabel}
				<span class="prio" data-prio={task.priority}>{priorityLabel}</span>
			{/if}
			<span class="task-title truncate">{task.title}</span>
			{#if task.flagged}
				<span aria-label="Flagged" title="Flagged" class="text-[color:var(--color-list-orange)]">⚑</span>
			{/if}
		</div>
		{#if task.notes}
			<div class="text-[13px] text-[color:var(--color-muted)] mt-0.5 truncate">
				{task.notes}
			</div>
		{/if}
		{#if due}
			<div class="text-[13px] mt-0.5 flex items-center gap-1.5 flex-wrap">
				{#if overdue}
					<span class="overdue-pill">Overdue</span>
				{/if}
				<span class="text-[color:var(--color-muted)]" class:overdue-text={overdue}>
					{dueText(due)}
				</span>
				{#if task.rrule}
					<span class="text-[11px] text-[color:var(--color-muted)]" title={task.rrule}>↻</span>
				{/if}
			</div>
		{/if}
	{/snippet}

	{#if readOnly}
		<div class="flex-1 min-w-0">{@render body()}</div>
	{:else}
		<div
			class="flex-1 min-w-0 cursor-pointer"
			role="button"
			tabindex="0"
			aria-label="Open task details"
			onclick={open}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					open(e);
				}
			}}
		>
			{@render body()}
		</div>
	{/if}
</div>

<style>
	.task-row {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		padding: 0.55rem 0;
		min-width: 0;
	}
	.task-row + :global(.task-row) {
		border-top: 1px solid var(--color-divider);
	}
	.task-title {
		font-size: 0.95rem;
		line-height: 1.3;
		color: var(--color-ink);
	}
	.prio {
		font-weight: 800;
		font-size: 0.8rem;
		letter-spacing: -0.05em;
	}
	.prio[data-prio='1'] {
		color: var(--color-list-blue);
	}
	.prio[data-prio='2'],
	.prio[data-prio='3'] {
		color: var(--color-list-red);
	}
	.overdue-pill {
		display: inline-block;
		padding: 1px 6px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-list-red) 15%, white);
		color: var(--color-list-red);
		font-weight: 700;
		font-size: 0.7rem;
		letter-spacing: 0.02em;
	}
	.overdue-text {
		color: var(--color-list-red) !important;
		font-weight: 600;
	}
</style>
