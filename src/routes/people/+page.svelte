<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import UserEditModal from '$lib/components/UserEditModal.svelte';
	import { colorVar } from '$lib/colors';
	import type { PageData } from './$types';
	import type { User } from '$lib/server/schema';

	let { data }: { data: PageData } = $props();

	let modalOpen = $state(false);
	let editing = $state<User | null>(null);

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
		<h1 class="text-3xl sm:text-4xl font-display font-bold">People</h1>
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
					{u.color}
				</div>
			</div>
			<div class="text-[color:var(--color-muted)]">›</div>
		</button>
	{:else}
		<p class="text-[color:var(--color-muted)] text-sm">
			No people yet. Add one to get started.
		</p>
	{/each}
</div>

<UserEditModal
	open={modalOpen}
	user={editing}
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
		background: white;
		padding: 1rem 1.25rem;
		border-radius: 1.1rem;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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
</style>
