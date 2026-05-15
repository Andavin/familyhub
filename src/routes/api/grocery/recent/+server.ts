import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recentPurchases } from '$lib/server/grocery';

export const GET: RequestHandler = async ({ url }) => {
	const daysRaw = Number(url.searchParams.get('days'));
	const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
	return json(await recentPurchases(days));
};
