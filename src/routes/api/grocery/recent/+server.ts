import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recentPurchases } from '$lib/server/grocery';
import { apiError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ url }) => {
	const raw = url.searchParams.get('days');
	let days = 30;
	if (raw !== null) {
		const n = Number(raw);
		if (!Number.isFinite(n) || n <= 0) {
			apiError(400, 'days must be a positive number');
		}
		days = n;
	}
	return json(await recentPurchases(days));
};
