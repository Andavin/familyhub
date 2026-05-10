<script lang="ts">
	import { colorVar } from '$lib/colors';

	export type EventDetail = {
		summary: string;
		location: string | null;
		description: string | null;
		start: Date;
		end: Date;
		allDay: boolean;
		feedName: string;
		color: string | null;
	};

	type Props = {
		open: boolean;
		event: EventDetail | null;
		onclose: () => void;
	};
	let { open, event, onclose }: Props = $props();

	function colorOrLiteral(c: string | null): string {
		if (!c) return 'var(--color-list-blue)';
		if (c.startsWith('#') || c.startsWith('rgb')) return c;
		return colorVar(c);
	}

	function formatDate(d: Date, asUtc = false) {
		// All-day dates are stored as UTC midnight by the parser. Format them
		// in UTC so a viewer west of UTC doesn't see the date roll back a day.
		const opts: Intl.DateTimeFormatOptions = {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			timeZone: asUtc ? 'UTC' : undefined
		};
		const year = asUtc ? d.getUTCFullYear() : d.getFullYear();
		if (year !== new Date().getFullYear()) opts.year = 'numeric';
		return d.toLocaleDateString([], opts);
	}

	function formatTime(d: Date) {
		return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	}

	function timeRange(ev: EventDetail) {
		if (ev.allDay) {
			const dayMs = 86_400_000;
			const days = Math.round((ev.end.getTime() - ev.start.getTime()) / dayMs);
			if (days <= 1) return formatDate(ev.start, true);
			const inclusiveEnd = new Date(ev.end.getTime() - dayMs);
			return `${formatDate(ev.start, true)} – ${formatDate(inclusiveEnd, true)}`;
		}
		const sameDay =
			ev.start.getFullYear() === ev.end.getFullYear() &&
			ev.start.getMonth() === ev.end.getMonth() &&
			ev.start.getDate() === ev.end.getDate();
		if (sameDay) {
			return `${formatDate(ev.start)} · ${formatTime(ev.start)} – ${formatTime(ev.end)}`;
		}
		return `${formatDate(ev.start)} ${formatTime(ev.start)} – ${formatDate(
			ev.end
		)} ${formatTime(ev.end)}`;
	}
</script>

{#if open && event}
	<div class="backdrop" role="presentation" onclick={onclose}></div>
	<div
		class="modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="event-modal-title"
		style="--c: {colorOrLiteral(event.color)}"
	>
		<header class="flex items-start justify-between mb-3 gap-3">
			<div class="flex items-start gap-2 min-w-0">
				<span class="ebar-big" aria-hidden="true"></span>
				<div class="min-w-0">
					<h2 id="event-modal-title" class="text-xl font-display font-bold leading-tight">
						{event.summary}
					</h2>
					<div class="text-xs text-[color:var(--color-muted)] mt-0.5 truncate">
						{event.feedName}
					</div>
				</div>
			</div>
			<button
				class="text-xl text-[color:var(--color-muted)]"
				onclick={onclose}
				aria-label="Close"
			>
				✕
			</button>
		</header>

		<div class="row">
			<span class="row-icon" aria-hidden="true">🗓️</span>
			<span>
				{event.allDay ? 'All day · ' : ''}
				{timeRange(event)}
			</span>
		</div>

		{#if event.location}
			<div class="row">
				<span class="row-icon" aria-hidden="true">📍</span>
				<span>{event.location}</span>
			</div>
		{/if}

		{#if event.description}
			<div class="row align-top">
				<span class="row-icon" aria-hidden="true">📝</span>
				<div class="whitespace-pre-wrap text-sm">{event.description}</div>
			</div>
		{/if}

		<div class="flex justify-end mt-5">
			<button class="btn ghost" onclick={onclose}>Close</button>
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
		width: min(480px, calc(100vw - 2rem));
		max-height: 90vh;
		overflow-y: auto;
		background: var(--color-card);
		border-radius: 1.5rem;
		padding: 1.25rem;
		z-index: 50;
		box-shadow: 0 25px 60px -15px var(--color-shadow-lg);
	}
	.ebar-big {
		width: 4px;
		min-height: 36px;
		align-self: stretch;
		background: var(--c);
		border-radius: 4px;
		flex-shrink: 0;
		margin-top: 0.15rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0;
		font-size: 0.95rem;
		border-top: 1px solid var(--color-divider);
	}
	.row.align-top {
		align-items: flex-start;
	}
	.row-icon {
		font-size: 1rem;
		width: 1.4rem;
		flex-shrink: 0;
		text-align: center;
	}
	.btn {
		padding: 0.5rem 1rem;
		border-radius: 9999px;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.btn.ghost {
		background: var(--color-canvas);
	}
</style>
