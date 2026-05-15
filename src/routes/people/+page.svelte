<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import UserEditModal from '$lib/components/UserEditModal.svelte';
	import CalendarFeedsEditor from '$lib/components/CalendarFeedsEditor.svelte';
	import { colorVar } from '$lib/colors';
	import { themeStore, setTheme, type Theme } from '$lib/theme.svelte';
	import type { PageData } from './$types';
	import type { User, CalendarFeed } from '$lib/server/schema';

	let { data }: { data: PageData } = $props();

	let modalOpen = $state(false);
	let editing = $state<User | null>(null);

	const sharedFeeds = $derived(data.feeds.filter((f: CalendarFeed) => f.userId === null));

	function countsFor(userId: number) {
		const calendars = data.feeds.filter((f) => f.userId === userId).length;
		const lists = data.lists.filter((l) => l.ownerId === userId && l.kind === 'chores').length;
		return { calendars, lists };
	}

	function pluralize(n: number, singular: string, plural = singular + 's') {
		return `${n} ${n === 1 ? singular : plural}`;
	}

	function openCreate() {
		editing = null;
		modalOpen = true;
	}
	function openEdit(u: User) {
		editing = u;
		modalOpen = true;
	}
</script>

<section class="px-4 sm:px-8 pb-3 flex items-center justify-between">
	<div>
		<h1 class="text-2xl sm:text-3xl xl:text-4xl font-display font-bold">People</h1>
		<p class="text-sm text-[color:var(--color-muted)]">Family members in this household</p>
	</div>
	<button
		class="px-4 py-2 rounded-full bg-[color:var(--color-list-blue)] text-white text-sm font-semibold shadow"
		onclick={openCreate}
		data-testid="add-user"
	>
		＋ Add Person
	</button>
</section>

<div class="px-4 sm:px-8 pb-10 max-w-3xl w-full mx-auto flex-1">
	{#each data.users as u (u.id)}
		{@const counts = countsFor(u.id)}
		<button
			class="card"
			style="--c: {colorVar(u.color)}"
			onclick={() => openEdit(u)}
			data-testid="user-card-{u.id}"
		>
			<div class="dot"></div>
			<div class="text-3xl">{u.emoji}</div>
			<div class="flex-1 text-left">
				<div class="font-bold text-lg">{u.name}</div>
				<div class="text-sm text-[color:var(--color-muted)]">
					{pluralize(counts.calendars, 'calendar')} ·
					{pluralize(counts.lists, 'task list')}
				</div>
			</div>
			<div class="text-[color:var(--color-muted)]">›</div>
		</button>
	{:else}
		<p class="text-[color:var(--color-muted)] text-sm">
			No people yet. Add one to get started.
		</p>
	{/each}

	<section class="shared-section" data-testid="shared-calendars">
		<header class="flex items-center gap-2 mb-1">
			<span class="shared-icon" aria-hidden="true">🏡</span>
			<h2 class="font-bold text-lg">Shared Calendars</h2>
		</header>
		<p class="text-xs text-[color:var(--color-muted)] mb-3">
			Calendars not tied to one person — Family, Trips, Birthdays. Always visible
			under the "Shared" filter chip on the calendar.
		</p>
		<CalendarFeedsEditor
			feeds={sharedFeeds}
			userId={null}
			defaultColor="orange"
			testIdPrefix="shared-feed"
		/>
	</section>

	<section class="settings-section" data-testid="appearance-section">
		<header class="flex items-center gap-2 mb-1">
			<span class="shared-icon" aria-hidden="true">🎨</span>
			<h2 class="font-bold text-lg">Appearance</h2>
		</header>
		<p class="text-xs text-[color:var(--color-muted)] mb-3">
			Light or dark — applies to everyone using this kiosk.
		</p>
		<div class="theme-seg" role="radiogroup" aria-label="Theme">
			{#each [
				{ v: 'light' as Theme, label: 'Light', icon: '☀' },
				{ v: 'dark' as Theme, label: 'Dark', icon: '☾' }
			] as o (o.v)}
				<button
					type="button"
					class="theme-option"
					class:active={themeStore.value === o.v}
					onclick={() => setTheme(o.v)}
					aria-pressed={themeStore.value === o.v}
					data-testid="theme-{o.v}"
				>
					<span aria-hidden="true" class="theme-glyph">{o.icon}</span>
					<span>{o.label}</span>
				</button>
			{/each}
		</div>
	</section>
</div>

<UserEditModal
	open={modalOpen}
	user={editing}
	feeds={editing ? data.feeds.filter((f: CalendarFeed) => f.userId === editing!.id) : []}
	onclose={() => (modalOpen = false)}
	onsaved={async () => {
		await invalidateAll();
	}}
/>

<style>
	.card {
		display: flex;
		gap: 1rem;
		align-items: center;
		background: var(--color-card);
		padding: 1rem 1.25rem;
		border-radius: 1.1rem;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		margin-bottom: 0.75rem;
		width: 100%;
		text-align: left;
		transition: transform 120ms ease;
	}
	.card:hover {
		transform: translateY(-1px);
	}
	.dot {
		width: 14px;
		height: 14px;
		border-radius: 9999px;
		background: var(--c);
		flex-shrink: 0;
	}
	.shared-section,
	.settings-section {
		background: var(--color-card);
		padding: 1.25rem 1.25rem 1rem;
		border-radius: 1.1rem;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
		margin-top: 1.25rem;
	}
	.shared-icon {
		font-size: 1.4rem;
	}
	.theme-seg {
		display: inline-flex;
		gap: 0.3rem;
		background: var(--color-canvas);
		border-radius: 0.7rem;
		padding: 0.25rem;
	}
	.theme-option {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.9rem;
		border-radius: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--color-ink-2);
	}
	.theme-option.active {
		background: var(--color-card);
		color: var(--color-list-blue);
		font-weight: 700;
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}
	.theme-glyph {
		font-size: 1.05rem;
		line-height: 1;
	}
</style>
