<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		loading = true;
		error = '';
		const res = await fetch('/api/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ password })
		});
		loading = false;
		if (!res.ok) {
			error = 'Wrong password';
			return;
		}
		const next = page.url.searchParams.get('next') ?? '/';
		await goto(next, { invalidateAll: true });
	}
</script>

<div class="min-h-screen flex items-center justify-center p-6">
	<form
		onsubmit={submit}
		class="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 space-y-5"
	>
		<div class="text-center space-y-1">
			<div class="text-4xl">🏠</div>
			<h1 class="text-2xl font-display font-bold">Family Hub</h1>
			<p class="text-sm text-[color:var(--color-muted)]">Enter the family password</p>
		</div>
		<input
			type="password"
			bind:value={password}
			placeholder="Password"
			autocomplete="current-password"
			class="w-full px-4 py-3 bg-[color:var(--color-canvas)] rounded-xl text-base outline-none focus:ring-2 focus:ring-[color:var(--color-list-blue)]"
			required
		/>
		{#if error}
			<p class="text-sm text-[color:var(--color-list-red)]">{error}</p>
		{/if}
		<button
			type="submit"
			disabled={loading}
			class="w-full py-3 rounded-xl bg-[color:var(--color-list-blue)] text-white font-semibold disabled:opacity-50"
		>
			{loading ? 'Signing in…' : 'Sign In'}
		</button>
	</form>
</div>
