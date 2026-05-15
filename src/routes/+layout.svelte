<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { initTheme } from '$lib/theme.svelte';

	let { children } = $props();

	$effect(() => {
		initTheme();
	});

	type NavItem = {
		href: string;
		label: string;
		match: (p: string) => boolean;
	};
	const navItems: NavItem[] = [
		{ href: '/', label: 'Tasks', match: (p) => p === '/' },
		{ href: '/calendar', label: 'Calendar', match: (p) => p.startsWith('/calendar') },
		{ href: '/grocery', label: 'Grocery', match: (p) => p.startsWith('/grocery') },
		{ href: '/people', label: 'People', match: (p) => p.startsWith('/people') }
	];
</script>

<svelte:head>
	<title>Family Hub</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

{#if page.url.pathname === '/login'}
	{@render children()}
{:else}
	<div class="min-h-screen flex flex-col">
		<!--
			Top nav: phone hides it (we surface navigation on the bottom
			bar instead, plus the brand wastes a row at this width); tablet
			and desktop show it. The brand collapses to just 🏠 on tablet
			to leave room for the link row inside 1180px.
		-->
		<nav
			class="hidden md:flex px-4 sm:px-8 pt-4 pb-2 items-center justify-between gap-3"
		>
			<a
				href="/"
				class="font-display font-bold text-2xl text-[color:var(--color-ink)] flex items-center gap-2"
			>
				<span aria-hidden="true">🏠</span>
				<span class="hidden xl:inline">Family Hub</span>
			</a>
			<div class="flex items-center gap-1 text-sm">
				{#each navItems as item (item.href)}
					<a
						href={item.href}
						class="nav-link px-3 py-1.5 rounded-full font-medium transition-colors"
						class:active={item.match(page.url.pathname)}
					>
						{item.label}
					</a>
				{/each}
			</div>
		</nav>

		<main class="flex-1 flex flex-col min-h-0 pb-bottom-nav md:pb-0">
			{@render children()}
		</main>

		<nav class="bottom-nav" aria-label="Primary">
			{#each navItems as item (item.href)}
				{@const active = item.match(page.url.pathname)}
				<a
					href={item.href}
					class="bottom-nav-link"
					class:active
					aria-current={active ? 'page' : undefined}
				>
					<span class="bottom-nav-icon" aria-hidden="true">
						{#if item.href === '/'}
							{#if active}
								<!-- filled checkmark in a circle -->
								<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path
										d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.1 14.3-4.2-4.2 1.4-1.4 2.8 2.8 5.6-5.6 1.4 1.4-7 7z"
									/>
								</svg>
							{:else}
								<!-- outline checkmark in a circle -->
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<circle cx="12" cy="12" r="9" />
									<path d="m8 12 3 3 5-6" />
								</svg>
							{/if}
						{:else if item.href === '/calendar'}
							{#if active}
								<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path
										d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1zm13 7H4v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9z"
									/>
								</svg>
							{:else}
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<rect x="3" y="5" width="18" height="16" rx="2" />
									<path d="M3 10h18M8 3v4M16 3v4" />
								</svg>
							{/if}
						{:else if item.href === '/grocery'}
							{#if active}
								<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path
										d="M2 3a1 1 0 0 1 1-1h2.5a1 1 0 0 1 .97.76L7.13 6H21a1 1 0 0 1 .98 1.2l-1.5 7A1 1 0 0 1 19.5 15H8.27l-.34 1.5H19a1 1 0 1 1 0 2H7.13a1 1 0 0 1-.98-1.22l.55-2.43L4.27 4H3a1 1 0 0 1-1-1zm6 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
									/>
								</svg>
							{:else}
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M3 3h2.5l2 11h12L21 7H7" />
									<circle cx="9" cy="19" r="1.25" />
									<circle cx="18" cy="19" r="1.25" />
								</svg>
							{/if}
						{:else if item.href === '/people'}
							{#if active}
								<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
									<path
										d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 19c0-3.314 3.134-6 7-6s7 2.686 7 6v1H2v-1zm14.2-5.7c2.93.45 5.3 2.8 5.3 5.7v1h-4.5v-1c0-2.05-.8-3.92-2.1-5.34a8.4 8.4 0 0 1 1.3-.36z"
									/>
								</svg>
							{:else}
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<circle cx="9" cy="8" r="3.5" />
									<path d="M2.5 20c0-3.3 2.9-6 6.5-6s6.5 2.7 6.5 6" />
									<circle cx="17" cy="9" r="2.5" />
									<path d="M16 14.5c3 .4 5 2.6 5 5.5" />
								</svg>
							{/if}
						{/if}
					</span>
					<span class="bottom-nav-label">{item.label}</span>
				</a>
			{/each}
		</nav>
	</div>
{/if}

<style>
	.nav-link {
		color: var(--color-ink-2);
	}
	.nav-link:hover {
		color: var(--color-ink);
	}
	.nav-link.active {
		background: var(--color-card);
		color: var(--color-list-blue);
		box-shadow: 0 1px 3px var(--color-shadow-sm);
	}

	/*
	 * Phone bottom tab bar. Four equal slots (no theme toggle — that's
	 * on the floating button now). Stroked SVG icons fill on active.
	 */
	.bottom-nav {
		display: none;
	}
	@media (max-width: 767px) {
		.bottom-nav {
			position: fixed;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 30;
			display: flex;
			align-items: stretch;
			justify-content: space-around;
			background: var(--color-card);
			border-top: 1px solid var(--color-divider);
			box-shadow: 0 -2px 10px var(--color-shadow-sm);
			padding: 0.3rem 0.25rem;
			padding-bottom: calc(0.3rem + env(safe-area-inset-bottom, 0px));
		}
	}
	.bottom-nav-link {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.18rem;
		padding: 0.4rem 0.25rem 0.3rem;
		color: var(--color-muted);
		font-size: 0.68rem;
		font-weight: 500;
		letter-spacing: 0.005em;
		text-decoration: none;
		position: relative;
		transition: color 120ms ease;
	}
	.bottom-nav-link.active {
		color: var(--color-list-blue);
		font-weight: 600;
	}
	.bottom-nav-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
	}
	.bottom-nav-icon :global(svg) {
		width: 24px;
		height: 24px;
	}
	.bottom-nav-label {
		line-height: 1;
	}

	:global(.pb-bottom-nav) {
		padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
	}
</style>
