/**
 * Shared channel definitions for the realtime SSE layer.
 *
 * Lives outside `$lib/server/` so the client realtime subscriber can
 * import it without dragging in any server-only modules. The server
 * broadcaster re-exports `Channel` for the same reason.
 */
export const CHANNELS = [
	'tasks',
	'lists',
	'users',
	'tags',
	'feeds',
	'checklists',
	'grocery',
	'stores',
	'api-keys'
] as const;
export type Channel = (typeof CHANNELS)[number];

const CHANNEL_SET: ReadonlySet<string> = new Set(CHANNELS);
export function isChannel(value: string): value is Channel {
	return CHANNEL_SET.has(value);
}

/**
 * Custom dependency URI for SvelteKit's `depends()` / `invalidate()`.
 * Loaders call `event.depends(dep('tasks'))`; the realtime subscriber
 * calls `invalidate(dep('tasks'))` on the matching SSE event.
 *
 * Keeping this helper next to the channel list means a loader can
 * declare its dependencies as `[dep('tasks'), dep('users')]` without
 * importing strings that could drift from the server's broadcast call.
 */
export function dep(channel: Channel): string {
	return `app:${channel}`;
}
