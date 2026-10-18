/**
 * @payswap/onchain-domain — shared internal guards (P4-W1, lane R2-W1).
 *
 * NOT exported from the package index: internal helpers shared by the
 * domain validators and the structural-pin validators (ported discipline
 * from the accepted @payswap/zcode-bridge and @payswap/capability lanes —
 * one place so every law cites the same shape).
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

/**
 * Deep-clone then freeze a JSON-ish value: stored records are immutable AND
 * caller-supplied objects are never frozen out from under their owner (same
 * policy as the accepted capability/trust/zcode-bridge lanes).
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

/** Render a collected issue list as one deterministic message. */
export function renderIssues(issues: readonly string[]): string {
  return issues.join("; ");
}
