/** Identity invariants already used by Event draft creation. */
export function isEventName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 120;
}

export function normalizeEventSlug(value: unknown): string {
  return typeof value === 'string'
    ? value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : '';
}

export function isEventSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 3 && value.length <= 80 &&
    normalizeEventSlug(value) === value;
}
