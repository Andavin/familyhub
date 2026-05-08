<script lang="ts">
	import Checkbox from './Checkbox.svelte';
	import { formatDueLabel, isOverdue } from '$lib/format';
	import type { Task } from '$lib/server/schema';

	type Props = {
		task: Task;
		color: string;
		onComplete: (task: Task) => void;
		ondelete?: (task: Task) => void;
		onflag?: (task: Task) => void;
	};
	let { task, color, onComplete, ondelete, onflag }: Props = $props();

	const completed = $derived(!!task.completedAt);
	const due = $derived(task.dueAt ? new Date(task.dueAt) : null);
	const overdue = $derived(!completed && isOverdue(due));
</script>

<div class="task-row" class:task-done={completed} data-testid="task-row">
	<Checkbox
		checked={completed}
		{color}
		label={completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
		onchange={() => onComplete(task)}
	/>
	<div class="flex-1 min-w-0">
		<div class="flex items-center gap-1.5 min-w-0">
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
			<div class="text-[13px] mt-0.5 flex items-center gap-1.5">
				<span
					class:overdue
					class="text-[color:var(--color-muted)]"
				>
					{formatDueLabel(due)}
				</span>
				{#if task.rrule}
					<span class="text-[11px] text-[color:var(--color-muted)]" title={task.rrule}
						>↻</span
					>
				{/if}
			</div>
		{/if}
	</div>
	{#if ondelete}
		<button
			type="button"
			class="row-action"
			aria-label="Delete task"
			onclick={() => ondelete?.(task)}
		>
			✕
		</button>
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
	.overdue {
		color: var(--color-list-red) !important;
	}
	.row-action {
		opacity: 0;
		color: var(--color-muted);
		font-size: 13px;
		padding: 0.25rem 0.5rem;
		transition: opacity 120ms ease;
	}
	.task-row:hover .row-action {
		opacity: 1;
	}
</style>
