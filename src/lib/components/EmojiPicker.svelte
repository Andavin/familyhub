<script lang="ts">
	type Category = { label: string; emojis: string[] };
	const CATEGORIES: Category[] = [
		{
			label: 'Smileys',
			emojis: [
				'😀', '😄', '😁', '😂', '🤣', '😊', '🥰', '😍', '😘', '🤗',
				'🙂', '😎', '🥳', '🤩', '😴', '🤔', '😬', '🙃', '😅', '😇'
			]
		},
		{
			label: 'People',
			emojis: [
				'🧔', '👨', '👩', '🧒', '🧑', '👶', '🧓', '👵', '👴', '💁‍♀️',
				'💁‍♂️', '🧑‍🍳', '👨‍💼', '👩‍💼', '🧑‍🎓', '🧑‍🌾', '🧑‍🏫', '🧑‍💻'
			]
		},
		{
			label: 'Home',
			emojis: [
				'🏠', '🏡', '🛏️', '🚪', '🪑', '🛋️', '🚿', '🛁', '🪟', '🧹',
				'🧺', '🧼', '🧽', '🪣', '🧯', '💡', '🔑', '🔌', '🔧', '🔨'
			]
		},
		{
			label: 'Food',
			emojis: [
				'🥦', '🍎', '🍌', '🥕', '🍞', '🥛', '🧀', '🥚', '🍕', '🥗',
				'🍳', '🥪', '🍣', '🍔', '🍰', '🍪', '☕', '🍷', '🍺', '🥤'
			]
		},
		{
			label: 'Activities',
			emojis: [
				'🏃', '🏋️', '🚴', '🏊', '⚽', '🏀', '🎮', '🎨', '📚', '✏️',
				'🎵', '🎬', '🎯', '🧘', '🛒', '💼', '🎓', '🎂', '🎉', '🎁'
			]
		},
		{
			label: 'Travel',
			emojis: [
				'✈️', '🚗', '🚂', '🚌', '🚲', '⛵', '🏖️', '🗺️', '🧳', '🏨',
				'🚀', '🚁', '🛳️', '🚙', '🛵', '🏝️', '🏔️', '🗽', '🎡', '🎢'
			]
		},
		{
			label: 'Nature',
			emojis: [
				'🌳', '🌲', '🌸', '🌷', '🍂', '🌞', '🌙', '⛅', '🌧️', '🌈',
				'🐶', '🐱', '🐦', '🌱', '🍀', '⭐', '⚡', '🔥', '❄️', '🌊'
			]
		},
		{
			label: 'Symbols',
			emojis: [
				'📋', '✅', '☑️', '✔️', '❌', '⚠️', '📌', '🗒️', '🗓️', '📅',
				'⏰', '🔔', '❤️', '⭐', '💯', '💪', '👍', '🙏', '🚨', '📞'
			]
		}
	];

	type Props = {
		value: string;
		onchange: (emoji: string) => void;
	};
	let { value, onchange }: Props = $props();

	let open = $state(false);
	let activeIdx = $state(0);
	let panelEl: HTMLDivElement | undefined = $state();

	function pick(e: string) {
		onchange(e);
		open = false;
	}

	function onWindowClick(e: MouseEvent) {
		if (!open) return;
		if (panelEl && e.target instanceof Node && !panelEl.contains(e.target)) {
			open = false;
		}
	}

	$effect(() => {
		if (open) {
			window.addEventListener('mousedown', onWindowClick);
			return () => window.removeEventListener('mousedown', onWindowClick);
		}
	});
</script>

<div class="picker">
	<button
		type="button"
		class="trigger"
		onclick={(e) => {
			e.stopPropagation();
			open = !open;
		}}
		aria-expanded={open}
		aria-haspopup="dialog"
		aria-label="Pick an emoji"
		data-testid="emoji-trigger"
	>
		<span class="current">{value || '📋'}</span>
		<span class="caret" aria-hidden="true">▾</span>
	</button>

	{#if open}
		<div class="panel" role="dialog" aria-label="Emoji picker" bind:this={panelEl}>
			<div class="tabs" role="tablist">
				{#each CATEGORIES as cat, i (cat.label)}
					<button
						type="button"
						role="tab"
						class:active={activeIdx === i}
						aria-selected={activeIdx === i}
						onclick={() => (activeIdx = i)}
					>
						{cat.label}
					</button>
				{/each}
			</div>
			<div class="grid" role="tabpanel" aria-label={CATEGORIES[activeIdx].label}>
				{#each CATEGORIES[activeIdx].emojis as e (e)}
					<button
						type="button"
						class="cell"
						class:selected={value === e}
						onclick={() => pick(e)}
						aria-label={`Choose ${e}`}
						data-testid="emoji-{e}"
					>
						{e}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.picker {
		position: relative;
	}
	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		background: var(--color-canvas);
		border-radius: 0.65rem;
		padding: 0.4rem 0.55rem 0.4rem 0.7rem;
		min-width: 64px;
	}
	.trigger:hover {
		background: var(--color-canvas-2);
	}
	.current {
		font-size: 1.65rem;
		line-height: 1;
	}
	.caret {
		font-size: 0.7rem;
		color: var(--color-muted);
	}
	.panel {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 60;
		width: min(340px, calc(100vw - 2rem));
		background: white;
		border-radius: 1rem;
		padding: 0.5rem;
		box-shadow: 0 12px 32px -10px rgba(0, 0, 0, 0.25), 0 0 0 1px var(--color-divider);
	}
	.tabs {
		display: flex;
		gap: 0.15rem;
		overflow-x: auto;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--color-divider);
		margin-bottom: 0.4rem;
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}
	.tabs button {
		flex-shrink: 0;
		padding: 0.3rem 0.65rem;
		border-radius: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-muted);
	}
	.tabs button.active {
		background: var(--color-canvas);
		color: var(--color-ink);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 2px;
		max-height: 240px;
		overflow-y: auto;
	}
	.cell {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 1.3rem;
		padding: 0.3rem;
		border-radius: 0.45rem;
		line-height: 1;
		aspect-ratio: 1 / 1;
	}
	.cell:hover {
		background: var(--color-canvas-2);
	}
	.cell.selected {
		background: color-mix(in srgb, var(--color-list-blue) 15%, white);
		outline: 2px solid var(--color-list-blue);
		outline-offset: -2px;
	}
</style>
