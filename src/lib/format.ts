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

/**
 * Whether a due date should be flagged as overdue right now.
 *
 * When `hasTime` is true, the task is overdue any moment after dueAt.
 * When `hasTime` is false (date-only), the task is only overdue once the
 * entire day has passed — a task scheduled for "today" without a specific
 * time isn't overdue at 9 a.m.
 */
export function isOverdue(d: Date | null | undefined, hasTime = true): boolean {
	if (!d) return false;
	const due = new Date(d);
	if (hasTime) return due.getTime() < Date.now();
	const endOfDueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
	return endOfDueDay.getTime() < Date.now();
}
