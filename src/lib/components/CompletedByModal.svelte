<script lang="ts">
	import { colorVar } from '$lib/colors';
	import type { User } from '$lib/server/schema';
	import { tick } from 'svelte';

	type Props = {
		open: boolean;
		users: User[];
		/** What is being completed — shown for context in the prompt. */
		taskTitle: string;
		onpick: (userId: number) => void;
		oncancel: () => void;
	};
	let { open, users, taskTitle, onpick, oncancel }: Props = $props();

	let modalEl = $state<HTMLDivElement | undefined>();
	let previouslyFocused: HTMLElement | null = null;

	// Move focus into the modal on open and restore it on close. Stash
	// the previously-focused element so keyboard users land back where
	// they were after the modal dismisses.
	$effect(() => {
		if (open) {
			previouslyFocused = (document.activeElement as HTMLElement) ?? null;
			tick().then(() => {
				const first = modalEl?.querySelector<HTMLElement>(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				);
				first?.focus();
			});
		} else if (previouslyFocused) {
			previouslyFocused.focus();
			previouslyFocused = null;
		}
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			oncancel();
		}
	}
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={oncancel}></div>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="completed-by-title"
		tabindex="-1"
		bind:this={modalEl}
		{onkeydown}
	>
		<header class="mb-3">
			<h2 id="completed-by-title" class="text-lg font-display font-bold">Who completed this?</h2>
			<p class="text-sm text-[color:var(--color-muted)] truncate">{taskTitle}</p>
		</header>

		<div class="user-grid">
			{#each users as u (u.id)}
				<button
					type="button"
					class="user-tile"
					style="--c: {colorVar(u.color)}"
					onclick={() => onpick(u.id)}
					data-testid="completed-by-{u.id}"
				>
					<span class="user-emoji">{u.emoji}</span>
					<span class="user-name">{u.name}</span>
				</button>
			{/each}
		</div>

		<div class="flex justify-end mt-4">
			<button class="btn ghost" onclick={oncancel}>Cancel</button>
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
		width: min(420px, calc(100vw - 2rem));
		background: var(--color-card);
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px var(--color-shadow-lg);
	}
	.user-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
		gap: 0.6rem;
	}
	.user-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.8rem 0.6rem;
		border-radius: 0.9rem;
		background: var(--color-canvas);
		border: 2px solid transparent;
		transition: border-color 120ms ease, background 120ms ease;
	}
	.user-tile:hover {
		border-color: var(--c);
		background: var(--color-canvas-2);
	}
	.user-emoji {
		font-size: 1.85rem;
		line-height: 1;
	}
	.user-name {
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--color-ink);
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
</style>
