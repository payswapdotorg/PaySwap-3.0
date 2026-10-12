/**
 * @payswap/capability — shared internal type guards (P2-W1).
 *
 * NOT exported from the package index: internal helpers shared by the
 * validation surfaces, kept in one place so each law cites the same shape.
 */

/** Non-empty string guard (shared by every validator). */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Non-empty-string array guard. */
export function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

/** Shallow structural object guard. */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/**
 * Deep-clone then freeze a JSON-ish value: stored records are immutable AND
 * caller-supplied objects are never frozen out from under their owner (same
 * policy as the protocol envelope factories and the old certification
 * ledger).
 */
export function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze((value as readonly unknown[]).map(cloneAndFreeze)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      copy[key] = cloneAndFreeze(source[key]);
    }
    return Object.freeze(copy) as T;
  }
  return value;
}
