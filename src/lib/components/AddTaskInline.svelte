<script lang="ts">
	import { colorVar } from '$lib/colors';

	type Props = {
		color: string;
		placeholder?: string;
		onsubmit: (title: string) => Promise<void> | void;
	};
	let { color, placeholder = 'New Reminder', onsubmit }: Props = $props();

	let value = $state('');
	let busy = $state(false);
	let inputEl: HTMLInputElement;

	async function send() {
		const v = value.trim();
		if (!v || busy) return;
		busy = true;
		try {
			await onsubmit(v);
			value = '';
			inputEl?.focus();
		} finally {
			busy = false;
		}
	}
	function key(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			send();
		}
	}
</script>

<div class="add-row" style="--c: {colorVar(color)}">
	<span class="bullet" aria-hidden="true"></span>
	<input
		bind:this={inputEl}
		bind:value
		onkeydown={key}
		onblur={send}
		{placeholder}
		class="flex-1 outline-none bg-transparent text-[0.95rem] text-[color:var(--color-ink)]"
		aria-label="Add task"
		data-testid="add-task-input"
	/>
</div>

<style>
	.add-row {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.55rem 0;
		border-top: 1px solid var(--color-divider);
	}
	.bullet {
		width: 22px;
		height: 22px;
		border-radius: 9999px;
		border: 1.6px dashed color-mix(in srgb, var(--c) 50%, transparent);
		flex-shrink: 0;
	}
	input::placeholder {
		color: var(--color-muted);
	}
</style>
