/**
 * @payswap/zcode-bridge — shared internal guards (P3-W3).
 *
 * NOT exported from the package index: internal helpers shared by the wire
 * validators (ported discipline from the accepted @payswap/surface and
 * @payswap/capability lanes — one place so every law cites the same shape).
 *
 * Determinism law: no ambient clock, no randomness, no environment, no
 * filesystem. All functions are pure structural checks.
 */

/** Non-empty string guard. */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Shallow structural object guard (arrays are objects too; callers check). */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Plain string array guard (empty allowed unless caller says otherwise). */
export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Non-empty string array guard. */
export function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return isStringArray(value) && value.length > 0;
}

/** Record<string, string> guard. */
export function isStringRecord(
  value: unknown,
): value is Readonly<Record<string, string>> {
  if (!isRecord(value)) return false;
  for (const key of Object.keys(value)) {
    if (typeof value[key] !== "string") return false;
  }
  return true;
}

/** Non-negative finite integer guard. */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Positive finite integer guard. */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** Positive finite number guard (durations may be fractional). */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Boolean guard. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * Deep-clone then freeze a JSON-ish value: stored records are immutable AND
 * caller-supplied objects are never frozen out from under their owner (same
 * policy as the accepted capability/trust lanes).
 */
export function cloneAndFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze((value as readonly unknown[]).map(cloneAndFreeze)) as T;
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      copy[key] = cloneAndFreeze(source[key]);
    }
    return Object.freeze(copy) as T;
  }
  return value;
}
