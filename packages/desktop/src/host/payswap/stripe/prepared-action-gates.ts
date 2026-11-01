/**
 * PaySwap Desktop (P24-2, ADR-0017 D10) — the dispatch-GATE support:
 * the small law-shaped pieces the executor's execute() composes over.
 * Extracted from prepared-action-executor.ts per the ≤400-line file law.
 *
 * - APPROVAL_TIER_RANK: the approval-tier ladder. A tier INCREASE after
 *   approval invalidates the recorded confirmation (a stronger tier
 *   demands a new, stronger human confirmation); a decrease never does.
 * - sealApiKeyOf: the material shape the seal consumer validates
 *   (fail-closed; never echoes the material).
 * - StripeGrantRefusal: the typed refusal raised INSIDE the seal when
 *   the re-derived grant refuses (ADR-0008 law) — mapped by the
 *   executor to FAILED/PERMISSION_MISSING, never an untyped throw.
 */

/** The approval-tier rank (a tier INCREASE after approval invalidates it). */
export const APPROVAL_TIER_RANK: Readonly<Record<string, number>> = Object.freeze({
  NONE: 0,
  CONFIRM: 1,
  STRONG_CONFIRM: 2,
  REAUTH: 3,
});

/** The material shape the seal consumer validates (never echoes it). */
export function sealApiKeyOf(material: unknown): string {
  if (material === null || typeof material !== "object" || Array.isArray(material)) {
    throw new Error("the sealed credential material is malformed");
  }
  const apiKey = (material as { apiKey?: unknown }).apiKey;
  if (typeof apiKey !== "string" || apiKey.length === 0) {
    throw new Error("the sealed credential material carries no apiKey");
  }
  return apiKey;
}

/** A typed refusal raised inside the seal (mapped to PERMISSION_MISSING). */
export class StripeGrantRefusal extends Error {}
