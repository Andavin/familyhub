<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import TaskRow from '$lib/components/TaskRow.svelte';
	import AddTaskInline from '$lib/components/AddTaskInline.svelte';
	import ApplyTemplateModal from '$lib/components/ApplyTemplateModal.svelte';
	import { colorVar } from '$lib/colors';
	import type { PageData } from './$types';
	import type { Task } from '$lib/server/schema';

	let { data }: { data: PageData } = $props();

	type Column = {
		title: string;
		emoji: string;
		color: string;
		listId: number;
		assigneeId: number | null;
		tasks: Task[];
	};

	const columns = $derived.by<Column[]>(() => {
		const cols: Column[] = [];
		for (const u of data.users) {
			const list = data.lists.find((l) => l.ownerId === u.id);
			if (!list) continue;
			cols.push({
				title: u.name,
				emoji: u.emoji,
				color: u.color,
				listId: list.id,
				assigneeId: u.id,
				tasks: data.tasks.filter((t) => t.listId === list.id || t.assigneeId === u.id)
			});
		}
		const family = data.lists.find((l) => l.ownerId === null && l.kind === 'chores');
		if (family) {
			cols.push({
				title: family.name,
				emoji: '🏡',
				color: family.color,
				listId: family.id,
				assigneeId: null,
				tasks: data.tasks.filter((t) => t.listId === family.id && !t.assigneeId)
			});
		}
		return cols;
	});

	let templateModal = $state(false);
	let toast = $state('');
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	function showToast(msg: string) {
		toast = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (toast = ''), 2400);
	}

	async function complete(t: Task) {
		await fetch(`/api/tasks/${t.id}/complete`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		});
		await invalidateAll();
	}

	async function addTask(col: Column, title: string) {
		await fetch('/api/tasks', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				listId: col.listId,
				title,
				assigneeId: col.assigneeId
			})
		});
		await invalidateAll();
	}

	async function deleteTask(t: Task) {
		await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<section class="px-4 sm:px-8 pb-3 flex items-center justify-between gap-3">
	<div>
		<h1 class="text-3xl sm:text-4xl font-display font-bold">Today</h1>
		<p class="text-sm text-[color:var(--color-muted)]">
			{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
		</p>
	</div>
	<button
		class="px-4 py-2 rounded-full bg-[color:var(--color-list-blue)] text-white text-sm font-semibold shadow"
		onclick={() => (templateModal = true)}
		data-testid="open-templates"
	>
		＋ Apply Checklist
	</button>
</section>

<div class="board snap-cols no-scrollbar" data-testid="board">
	{#each columns as col (col.listId)}
		<article class="column" style="--c: {colorVar(col.color)}" data-testid="column-{col.listId}">
			<header class="col-head">
				<span class="dot"></span>
				<span class="col-title">
					<span class="emoji">{col.emoji}</span>
					{col.title}
				</span>
				<span class="col-count">{col.tasks.length}</span>
			</header>
			<div class="col-body">
				{#each col.tasks as task (task.id)}
					<TaskRow
						{task}
						color={col.color}
						onComplete={complete}
						ondelete={deleteTask}
					/>
				{/each}
				<AddTaskInline
					color={col.color}
					placeholder="New Reminder"
					onsubmit={(title) => addTask(col, title)}
				/>
			</div>
		</article>
	{/each}
</div>

<ApplyTemplateModal
	open={templateModal}
	templates={data.templates}
	onclose={() => (templateModal = false)}
	onapplied={async (n) => {
		showToast(`Added ${n} ${n === 1 ? 'task' : 'tasks'}`);
		await invalidateAll();
	}}
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
		flex: 1;
		align-items: stretch;
	}
	@media (min-width: 640px) {
		.board {
			padding-left: 2rem;
			padding-right: 2rem;
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
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
	}
	.emoji {
		font-size: 1.1rem;
	}
	.col-count {
		font-size: 1.4rem;
		font-weight: 700;
		color: color-mix(in srgb, var(--c) 60%, transparent);
		font-family: var(--font-display);
	}
	.col-body {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}
	.toast {
		position: fixed;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(28, 28, 30, 0.92);
		color: white;
		padding: 0.6rem 1.1rem;
		border-radius: 9999px;
		font-size: 0.9rem;
		z-index: 60;
		box-shadow: 0 6px 24px -6px rgba(0, 0, 0, 0.3);
	}
</style>
