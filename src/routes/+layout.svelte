<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();
</script>

<svelte:head>
	<title>FamilyHub</title>
</svelte:head>

{#if page.url.pathname === '/login'}
	{@render children()}
{:else}
	<div class="min-h-screen flex flex-col">
		<nav class="px-4 sm:px-8 pt-4 pb-2 flex items-center justify-between">
			<a href="/" class="font-display font-bold text-2xl text-[color:var(--color-ink)]"
				>FamilyHub</a
			>
			<div class="flex items-center gap-1 text-sm">
				<a
					href="/"
					class="px-3 py-1.5 rounded-full font-medium transition-colors"
					class:active={page.url.pathname === '/'}
					>Tasks</a
				>
				<a
					href="/calendar"
					class="px-3 py-1.5 rounded-full font-medium transition-colors"
					class:active={page.url.pathname.startsWith('/calendar')}
					>Calendar</a
				>
				<a
					href="/grocery"
					class="px-3 py-1.5 rounded-full font-medium transition-colors"
					class:active={page.url.pathname.startsWith('/grocery')}
					>Grocery</a
				>
				<a
					href="/templates"
					class="px-3 py-1.5 rounded-full font-medium transition-colors"
					class:active={page.url.pathname.startsWith('/templates')}
					>Templates</a
				>
				<a
					href="/people"
					class="px-3 py-1.5 rounded-full font-medium transition-colors"
					class:active={page.url.pathname.startsWith('/people')}
					>People</a
				>
			</div>
		</nav>
		<main class="flex-1 flex flex-col min-h-0">
			{@render children()}
		</main>
	</div>
{/if}

<style>
	.active {
		background: var(--color-card);
		color: var(--color-list-blue);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
	}
	a {
		color: var(--color-ink-2);
	}
	a:hover {
		color: var(--color-ink);
	}
</style>
