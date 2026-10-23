import { isCalendarDay } from './event-time';

/** LastUpdate is the producer's update date; the DATAtourisme ingestion date is not interchangeable. */
export function normalizeSourceUpdatedAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (isCalendarDay(value)) return value;
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/.exec(value);
  if (!match || !isCalendarDay(match[1])) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function isCanonicalSourceUpdatedAt(value: unknown): value is string {
  return typeof value === 'string' && normalizeSourceUpdatedAt(value) === value;
}
