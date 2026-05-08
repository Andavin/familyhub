export const LIST_COLORS = [
	'red',
	'orange',
	'yellow',
	'green',
	'mint',
	'teal',
	'cyan',
	'blue',
	'indigo',
	'purple',
	'pink',
	'brown'
] as const;

export type ListColor = (typeof LIST_COLORS)[number];

export function colorVar(c: string): string {
	if ((LIST_COLORS as readonly string[]).includes(c)) return `var(--color-list-${c})`;
	return 'var(--color-list-blue)';
}
