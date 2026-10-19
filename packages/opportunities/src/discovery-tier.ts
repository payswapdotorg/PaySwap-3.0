/**
 * @payswap/opportunities — the STRUCTURAL discovery-never-authorization
 * discriminator (P6-W2, lane r4-w2; PORTED from payswap.org@8a735bf
 * packages/onchain-opportunities/src/discovery-tier.ts; the seam
 * vocabulary extends to opportunity -> proposal -> decision in
 * proposal-seam.ts).
 *
 * 1. BRANDED TYPES: the phantom brand makes a tiered record
 *    TYPE-INCOMPATIBLE with any authorization surface (no exported
 *    conversion, on purpose). 2. DERIVED-ONLY CONSTRUCTION: every
 *    opportunity is constructed by `discoverOpportunity`, which stamps
 *    the tier structurally; no tier-less constructor, no stripping API.
 *    3. RUNTIME RE-DERIVATION: `assertDiscoveryTier` fails closed on
 *    forgeries; the proposal-seam marker scan rejects tiered records
 *    where command/authority shape is demanded. 4. THE EXECUTION GATE:
 *    `discoveryPermitsExecution()` is literal false;
 *    `rejectDiscoveryForExecution()` ALWAYS throws.
 */

import { DiscoveryExecutionRejectedError, ValidationError } from "./errors.ts";

/** The one discovery tier this package may ever produce. */
export const DISCOVERY_TIER = "DISCOVERY_NEVER_AUTHORIZATION" as const;

/** Raised when a tiered discovery artifact is fed to an execution gate. */
export class DiscoveryTierError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryTierError";
  }
}

/** Nominal brand: this value is a discovery record, never execution authority. */
declare const DISCOVERY_TIER_BRAND: unique symbol;

/**
 * The structural discovery mark. Phantom property (unique symbol, never
 * constructible outside this module) plus a re-derivable runtime field, so
 * tiered discovery records are nominally distinct from every
 * authorization shape (the pinned INV-13 instance scope, the pinned
 * proposal command markers, any settlement input).
 */
export interface OpportunityDiscoveryBrand {
  readonly [DISCOVERY_TIER_BRAND]: typeof DISCOVERY_TIER;
  /** Runtime re-derivation field (defense in depth against brand forgery). */
  readonly discoveryTier: typeof DISCOVERY_TIER;
}

/** Runtime guard: does this value carry the opportunity discovery tier? */
export function isDiscoveryTieredValue(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<OpportunityDiscoveryBrand>;
  return candidate.discoveryTier === DISCOVERY_TIER;
}

/**
 * Fail-closed tier assertion: the record must carry the re-derivable
 * runtime tier field with the exact tier value. A tier-less or forged
 * record is rejected (never guessed).
 */
export function assertDiscoveryTier(
  value: unknown,
): asserts value is OpportunityDiscoveryBrand {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError(
      "discovery tier assertion failed: value is not an object — tiered discovery records are structurally branded, never guessed",
    );
  }
  const candidate = value as Partial<OpportunityDiscoveryBrand>;
  if (candidate.discoveryTier !== DISCOVERY_TIER) {
    throw new ValidationError(
      `discovery tier assertion failed: expected the structural tier '${DISCOVERY_TIER}' (a discovery record without the tier brand is malformed and fails closed)`,
    );
  }
}

/**
 * Deterministic restatement of the discovery-never-authorization law for
 * every consumer of this package: a discovered opportunity NEVER permits
 * execution. Returns false, always.
 */
export function discoveryPermitsExecution(): false {
  return false;
}

/**
 * THE downstream execution gate. ALWAYS throws (there is no input that
 * makes a discovered opportunity executable): any execution-adjacent
 * consumer that receives one of this package's artifacts calls this gate
 * and fails closed. The rejection is a tested, first-class contract —
 * not a comment. Execution authority exists ONLY downstream of the
 * decision seam (opportunity -> proposal -> decision), on the lanes that
 * own authorization — which this package never imports, never wraps and
 * never re-implements.
 */
export function rejectDiscoveryForExecution(value: unknown): never {
  const description = isDiscoveryTieredValue(value)
    ? `a tiered discovery record (tier '${DISCOVERY_TIER}')`
    : "a non-tiered value passed where execution authority was demanded";
  throw new DiscoveryExecutionRejectedError(
    `execution rejected: ${description} carries no authority to execute — discovery/recommendation is never authorization, and the only route onward is the proposal -> decision seam owned by the authorization lanes (P6-W2 law)`,
  );
}
