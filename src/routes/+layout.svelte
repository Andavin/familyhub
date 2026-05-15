<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { initTheme } from '$lib/theme.svelte';

	let { children } = $props();

	$effect(() => {
		initTheme();
	});

	const navItems = [
		{ href: '/', label: 'Tasks', icon: '✓', match: (p: string) => p === '/' },
		{
			href: '/calendar',
			label: 'Calendar',
			icon: '🗓',
			match: (p: string) => p.startsWith('/calendar')
		},
		{
			href: '/grocery',
			label: 'Grocery',
			icon: '🛒',
			match: (p: string) => p.startsWith('/grocery')
		},
		{
			href: '/people',
			label: 'People',
			icon: '👥',
			match: (p: string) => p.startsWith('/people')
		}
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
				<ThemeToggle />
			</div>
		</nav>

		<main class="flex-1 flex flex-col min-h-0 pb-bottom-nav md:pb-0">
			{@render children()}
		</main>

		<!--
			Phone bottom tab bar. Fixed-bottom, safe-area aware, only
			rendered below the md breakpoint (tablet+ uses the top nav).
			The `pb-bottom-nav` utility on <main> reserves the height so
			content doesn't tuck under it.
		-->
		<nav class="bottom-nav" aria-label="Primary">
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					class="bottom-nav-link"
					class:active={item.match(page.url.pathname)}
				>
					<span class="bottom-nav-icon" aria-hidden="true">{item.icon}</span>
					<span class="bottom-nav-label">{item.label}</span>
				</a>
			{/each}
			<div class="bottom-nav-link" aria-hidden="false">
				<ThemeToggle />
			</div>
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
	 * Bottom tab bar (phone only). The 64px height + safe-area padding
	 * is also encoded in the `.pb-bottom-nav` utility below so main
	 * content reserves the same space. Hidden by default; the media
	 * query reveals it below the md breakpoint (768px). A Tailwind
	 * `md:hidden` utility would lose to the `display: flex` here because
	 * Tailwind v4 doesn't !important its utilities — the media query
	 * keeps the relationship explicit either way.
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
			padding: 0.35rem 0.25rem;
			padding-bottom: calc(0.35rem + env(safe-area-inset-bottom, 0px));
		}
	}
	.bottom-nav-link {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.15rem;
		padding: 0.25rem 0.1rem;
		color: var(--color-muted);
		font-size: 0.7rem;
		font-weight: 600;
		text-decoration: none;
	}
	.bottom-nav-link.active {
		color: var(--color-list-blue);
	}
	.bottom-nav-icon {
		font-size: 1.25rem;
		line-height: 1;
	}
	.bottom-nav-label {
		line-height: 1;
	}

	:global(.pb-bottom-nav) {
		padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
	}
</style>
