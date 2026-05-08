export function formatDueLabel(d: Date | null | undefined): string {
	if (!d) return '';
	const now = new Date();
	const t = new Date(d);
	const sameDay = (a: Date, b: Date) =>
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate();

	const tomorrow = new Date(now);
	tomorrow.setDate(now.getDate() + 1);
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);

	const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	const isMidnight = t.getHours() === 0 && t.getMinutes() === 0;

	if (sameDay(t, now)) return isMidnight ? 'Today' : `Today at ${time}`;
	if (sameDay(t, tomorrow)) return isMidnight ? 'Tomorrow' : `Tomorrow at ${time}`;
	if (sameDay(t, yesterday)) return isMidnight ? 'Yesterday' : `Yesterday at ${time}`;

	const opts: Intl.DateTimeFormatOptions =
		t.getFullYear() === now.getFullYear()
			? { weekday: 'short', month: 'short', day: 'numeric' }
			: { month: 'short', day: 'numeric', year: 'numeric' };
	const datePart = t.toLocaleDateString([], opts);
	return isMidnight ? datePart : `${datePart} at ${time}`;
}

export function isOverdue(d: Date | null | undefined): boolean {
	if (!d) return false;
	return new Date(d).getTime() < Date.now();
}
