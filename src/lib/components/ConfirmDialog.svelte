<script lang="ts">
	type Props = {
		open: boolean;
		title: string;
		message?: string;
		confirmLabel?: string;
		destructive?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	};
	let {
		open,
		title,
		message,
		confirmLabel = 'Confirm',
		destructive = false,
		onconfirm,
		oncancel
	}: Props = $props();
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={oncancel}></div>
	<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
		<h2 id="confirm-title" class="text-lg font-display font-bold">{title}</h2>
		{#if message}
			<p class="text-sm text-[color:var(--color-muted)] mt-2">{message}</p>
		{/if}
		<div class="flex justify-end gap-2 mt-5">
			<button class="btn ghost" onclick={oncancel} data-testid="confirm-cancel">Cancel</button>
			<button
				class="btn"
				class:destructive
				class:primary={!destructive}
				onclick={onconfirm}
				data-testid="confirm-ok"
			>
				{confirmLabel}
			</button>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: var(--color-backdrop);
		z-index: 60;
	}
	.modal {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		width: min(380px, calc(100vw - 2rem));
		background: var(--color-card);
		border-radius: 1.25rem;
		padding: 1.25rem;
		z-index: 70;
		box-shadow: 0 25px 60px -15px var(--color-shadow-lg);
	}
	.btn {
		padding: 0.55rem 1.1rem;
		border-radius: 9999px;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.btn.ghost {
		background: var(--color-canvas);
	}
	.btn.primary {
		background: var(--color-list-blue);
		color: white;
	}
	.btn.destructive {
		background: var(--color-list-red);
		color: white;
	}
</style>
