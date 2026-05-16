import { apiError } from './api-error';

/**
 * Validate-and-coerce an unknown value as an ISO-8601 timestamp body
 * field. Routes pass `null`/`undefined` through as a stored `NULL`;
 * any other shape that isn't a parseable date string returns a 400
 * with a clear, field-named message rather than letting a malformed
 * `new Date(...)` produce an Invalid Date that propagates into the
 * database (or worse, gets stored as the unix epoch).
 *
 * Lives here (not inside the api-error module) so the validation
 * helpers stay grouped — adding more (parseIntField, parseEnumField,
 * etc.) would slot in alongside this one.
 */
export function parseDateField(value: unknown, field: string): Date | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== 'string') {
		apiError(400, `${field} must be an ISO-8601 string or null`);
	}
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) {
		apiError(400, `${field} is not a valid ISO-8601 timestamp`);
	}
	return d;
}
