<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	type ListedApiKey = {
		id: number;
		name: string;
		prefix: string;
		userId: number | null;
		createdAt: string | Date;
		lastUsedAt: string | Date | null;
	};

	type Props = {
		keys: ListedApiKey[];
		// userId for newly-created keys. null = shared (no user binding).
		userId: number | null;
		testIdPrefix?: string;
	};
	let { keys, userId, testIdPrefix = 'api-key' }: Props = $props();

	let newName = $state('');
	let busy = $state(false);
	// Plaintext from the most recent successful create. Cleared when the
	// user dismisses the panel — this is the only chance to copy it.
	let revealed = $state<{ plaintext: string; name: string } | null>(null);
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | null = null;
	// User-facing error string for create/revoke failures. The server
	// emits a 4xx with a specific `message`; we render that verbatim so
	// the user knows what went wrong instead of seeing the spinner stop
	// with nothing else happening.
	let errorMsg = $state<string | null>(null);
	// When the clipboard API refuses (insecure context, denied perms,
	// iframe sandbox), `copied` stays false on purpose — but we ALSO
	// surface a hint pointing at the pre-selected token text so the
	// user has a path forward and doesn't dismiss the panel thinking
	// the key is safely in their clipboard.
	let copyFailed = $state(false);
	let tokenEl = $state<HTMLElement | null>(null);

	async function add() {
		if (!newName.trim() || busy) return;
		busy = true;
		errorMsg = null;
		try {
			const res = await fetch('/api/api-keys', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: newName.trim(), userId })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body.message ?? body.error ?? `Could not create key (HTTP ${res.status}).`;
				return;
			}
			const row = (await res.json()) as { plaintext: string; name: string };
			revealed = { plaintext: row.plaintext, name: row.name };
			copied = false;
			copyFailed = false;
			newName = '';
			await invalidateAll();
		} catch (err) {
			console.error('[api-keys] create failed', err);
			errorMsg = 'Could not reach the server. Check your connection and try again.';
		} finally {
			busy = false;
		}
	}

	function selectTokenText() {
		if (!tokenEl) return;
		const range = document.createRange();
		range.selectNodeContents(tokenEl);
		const sel = window.getSelection();
		if (!sel) return;
		sel.removeAllRanges();
		sel.addRange(range);
	}

	async function copy() {
		if (!revealed) return;
		try {
			await navigator.clipboard.writeText(revealed.plaintext);
			copied = true;
			copyFailed = false;
			// Revert the check back to the clipboard icon after a beat,
			// matching the GitHub pattern. Lets the user copy again if
			// the paste target didn't take.
			if (copiedTimer) clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => {
				copied = false;
				copiedTimer = null;
			}, 1800);
		} catch (err) {
			// Clipboard API rejected. Don't claim success — instead, select
			// the token text so the user can hit Ctrl/Cmd+C manually, and
			// show an explicit "couldn't copy" hint. Without this, a user
			// who didn't realize the click failed will dismiss the panel
			// and lose the only chance to capture the key.
			console.warn('[api-keys] clipboard write failed', err);
			copied = false;
			copyFailed = true;
			selectTokenText();
		}
	}

	function dismissReveal() {
		revealed = null;
		copied = false;
		copyFailed = false;
		if (copiedTimer) {
			clearTimeout(copiedTimer);
			copiedTimer = null;
		}
	}

	async function revoke(id: number) {
		busy = true;
		errorMsg = null;
		try {
			const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				errorMsg = body.message ?? body.error ?? `Could not revoke key (HTTP ${res.status}).`;
				// Skip invalidateAll on failure so the user keeps seeing
				// the row that's actually still live on the server.
				return;
			}
			await invalidateAll();
		} catch (err) {
			console.error('[api-keys] revoke failed', err);
			errorMsg = 'Could not reach the server. Key may still be active.';
		} finally {
			busy = false;
		}
	}

	function formatLastUsed(v: string | Date | null): string {
		if (!v) return 'never used';
		const d = new Date(v);
		const diffMs = Date.now() - d.getTime();
		const min = Math.floor(diffMs / 60_000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min}m ago`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h ago`;
		const days = Math.floor(hr / 24);
		if (days < 30) return `${days}d ago`;
		return d.toLocaleDateString();
	}
</script>

<div class="space-y-1.5 mb-2">
	{#each keys as k (k.id)}
		<div class="key-row" data-testid="{testIdPrefix}-row-{k.id}">
			<div class="flex-1 min-w-0">
				<div class="font-medium truncate">{k.name}</div>
				<div class="text-xs text-[color:var(--color-muted)] truncate">
					<span class="prefix">{k.prefix}…</span>
					<span aria-hidden="true">·</span>
					{formatLastUsed(k.lastUsedAt)}
				</div>
			</div>
			<button
				class="text-[color:var(--color-muted)] text-sm px-1.5"
				aria-label={`Revoke ${k.name}`}
				onclick={() => revoke(k.id)}
				disabled={busy}
				data-testid="{testIdPrefix}-delete-{k.id}"
			>
				✕
			</button>
		</div>
	{/each}
</div>

{#if revealed}
	<div class="reveal" role="status" data-testid="{testIdPrefix}-reveal">
		<div class="reveal-head">
			<strong>Save this key now</strong>
			<span class="text-xs text-[color:var(--color-muted)]">
				You won't be able to see it again.
			</span>
		</div>
		<div class="token-wrap">
			<code
				class="token"
				bind:this={tokenEl}
				data-testid="{testIdPrefix}-plaintext"
			>{revealed.plaintext}</code>
			<button
				type="button"
				class="copy-icon"
				class:success={copied}
				onclick={copy}
				data-testid="{testIdPrefix}-copy"
				aria-label={copied ? 'Copied to clipboard' : 'Copy API key to clipboard'}
				title={copied ? 'Copied' : 'Copy'}
			>
				{#if copied}
					<!-- Octicons check -->
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
						<path
							fill="currentColor"
							d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"
						/>
					</svg>
				{:else}
					<!-- Octicons copy -->
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
						<path
							fill="currentColor"
							d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"
						/>
						<path
							fill="currentColor"
							d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"
						/>
					</svg>
				{/if}
			</button>
		</div>
		{#if copyFailed}
			<p
				class="copy-fallback text-xs"
				role="alert"
				data-testid="{testIdPrefix}-copy-failed"
			>
				Couldn't access the clipboard. The token is selected — press Ctrl/Cmd + C to copy it manually.
			</p>
		{/if}
		<button
			class="btn ghost dismiss"
			onclick={dismissReveal}
			data-testid="{testIdPrefix}-dismiss"
		>
			I've saved it
		</button>
	</div>
{/if}

{#if errorMsg}
	<p class="error-banner" role="alert" data-testid="{testIdPrefix}-error">
		{errorMsg}
	</p>
{/if}

<div class="key-add">
	<input
		type="text"
		placeholder="Integration name (e.g. Apple Reminders sync)"
		class="field"
		bind:value={newName}
		aria-label="API key name"
		data-testid="{testIdPrefix}-name-input"
	/>
	<button
		class="btn primary"
		onclick={add}
		disabled={busy || !newName.trim()}
		data-testid="{testIdPrefix}-add-btn"
	>
		Create key
	</button>
</div>

<style>
	.key-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		background: var(--color-canvas);
		border-radius: 0.65rem;
	}
	.prefix {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}
	.reveal {
		background: color-mix(in srgb, var(--color-list-blue) 8%, var(--color-card));
		border: 1px solid color-mix(in srgb, var(--color-list-blue) 30%, transparent);
		border-radius: 0.7rem;
		padding: 0.75rem;
		margin-bottom: 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.reveal-head {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.token-wrap {
		position: relative;
	}
	.token {
		display: block;
		background: var(--color-canvas);
		padding: 0.5rem 2.4rem 0.5rem 0.6rem;
		border-radius: 0.5rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.8rem;
		overflow-x: auto;
		white-space: nowrap;
	}
	.copy-icon {
		position: absolute;
		top: 50%;
		right: 0.35rem;
		transform: translateY(-50%);
		width: 1.85rem;
		height: 1.85rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.4rem;
		color: var(--color-muted);
		background: transparent;
		cursor: pointer;
		transition: background 100ms ease, color 100ms ease, transform 80ms ease;
	}
	.copy-icon:hover {
		background: color-mix(in srgb, var(--color-ink) 10%, var(--color-canvas));
		color: var(--color-ink);
	}
	.copy-icon:active {
		transform: translateY(-50%) scale(0.92);
	}
	.copy-icon:focus-visible {
		outline: 2px solid var(--color-list-blue);
		outline-offset: 2px;
	}
	.copy-icon.success {
		color: var(--color-list-green);
	}
	.copy-icon.success:hover {
		background: color-mix(in srgb, var(--color-list-green) 14%, var(--color-canvas));
	}
	.dismiss {
		align-self: flex-end;
	}
	.copy-fallback {
		margin: 0;
		color: var(--color-list-orange);
	}
	.error-banner {
		margin: 0 0 0.6rem;
		padding: 0.55rem 0.75rem;
		border-radius: 0.6rem;
		background: color-mix(in srgb, var(--color-list-red) 12%, var(--color-canvas));
		border: 1px solid color-mix(in srgb, var(--color-list-red) 35%, transparent);
		color: var(--color-list-red);
		font-size: 0.85rem;
	}
	.key-add {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.field {
		flex: 1;
		min-width: 12rem;
		padding: 0.55rem 0.8rem;
		background: var(--color-canvas);
		border-radius: 0.65rem;
		outline: none;
	}
	.field:focus {
		box-shadow: 0 0 0 2px var(--color-list-blue);
	}
	.btn {
		padding: 0.55rem 1rem;
		border-radius: 9999px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 100ms ease, color 100ms ease, transform 80ms ease;
	}
	.btn:active {
		transform: scale(0.97);
	}
	.btn.primary {
		background: var(--color-list-blue);
		color: white;
	}
	.btn.primary:hover {
		background: color-mix(in srgb, var(--color-list-blue) 88%, black);
	}
	.btn.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.btn.ghost {
		background: var(--color-canvas);
		color: var(--color-ink-2);
	}
	.btn.ghost:hover {
		background: color-mix(in srgb, var(--color-ink) 10%, var(--color-canvas));
		color: var(--color-ink);
	}
</style>
