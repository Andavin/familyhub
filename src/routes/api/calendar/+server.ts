import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchEvents } from '$lib/server/caldav';

export const GET: RequestHandler = async ({ url }) => {
	const startStr = url.searchParams.get('start');
	const endStr = url.searchParams.get('end');
	const start = startStr ? new Date(startStr) : new Date();
	const end = endStr ? new Date(endStr) : new Date(Date.now() + 30 * 86_400_000);
	const events = await fetchEvents(start, end);
	return json(events);
};
