/**
 * @payswap/onchain-security/threat-intel — behavioral intelligence
 * observations: spender, token-registry and address intelligence (R2-W2;
 * PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/observations.ts, split for the
 * ≤400-line law).
 *
 * Intelligence entries are BEHAVIORAL/REGISTRY OBSERVATIONS, never
 * judgments — the deterministic policy decides. Every entry carries an
 * observation id: signals reference exactly these ids in their evidence
 * chains (evidence.ts). All entries are AGENT-FACING (the kernel secret
 * scan runs on the whole bundle at record time, INV-19).
 */

import type { AssetIdentity } from "../types.ts";
import { validateAddress, validateAssetIdentity } from "../types.ts";
import { ValidationError } from "../pins/index.ts";

/**
 * Intelligence about one spender (allowance recipient). Behavioral,
 * provenance-carrying; NEVER a judgment — the policy decides.
 */
export interface SpenderIntelligence {
  /** Observation id (referenced by evidence chains). */
  readonly observationId: string;
  readonly spender: string;
  /** A known drain pattern is associated with this spender. */
  readonly knownDrainPattern: boolean;
  /** When the spender first appeared in the intelligence horizon (ms). */
  readonly firstObservedAt?: number;
  /** Count of incidents attributed to this spender, when tracked. */
  readonly observedIncidents?: number;
  /** Intelligence sources contributing this entry. */
  readonly sources?: readonly string[];
}

/**
 * One token-registry observation: the observed status of an asset the
 * write touches (transfer asset, approval assets). The registry view is
 * an OBSERVATION of the registry at bundle-observedAt — never a live
 * lookup.
 */
export interface TokenRegistryEntry {
  readonly observationId: string;
  readonly asset: AssetIdentity;
  /** The registry certifies this exact (chain, assetId, symbol) as canonical. */
  readonly canonical: boolean;
  /** When this entry is an impersonator: the canonical assetId it mimics. */
  readonly impersonatesAssetId?: string;
  /** Registry-observed transfer restriction (honeypot marker). */
  readonly transferRestricted?: boolean;
  /** Registry-observed sellability (false = cannot move value out). */
  readonly sellable?: boolean;
}

/**
 * Intelligence about one address: the chains it is known to be active on.
 * Used for destination/chain confusion (an address reused across chains).
 */
export interface AddressIntelligence {
  readonly observationId: string;
  readonly address: string;
  /** Chains the address is observed active on (may be several). */
  readonly chainsActiveOn: readonly string[];
  readonly observedAt: number;
}

// ---------------------------------------------------------------------------
// Implementation (validators)
// ---------------------------------------------------------------------------

/** Validate one spender-intelligence entry (fail closed). */
export function validateSpenderIntelligence(entry: SpenderIntelligence): void {
  if (entry.observationId.length === 0) {
    throw new ValidationError("spender intelligence requires an observationId");
  }
  validateAddress(entry.spender, "spender intelligence address");
  if (entry.firstObservedAt !== undefined && entry.firstObservedAt < 0) {
    throw new ValidationError("firstObservedAt must be a non-negative ms value");
  }
  if (
    entry.observedIncidents !== undefined &&
    (!Number.isInteger(entry.observedIncidents) || entry.observedIncidents < 0)
  ) {
    throw new ValidationError("observedIncidents must be a non-negative integer");
  }
  for (const source of entry.sources ?? []) {
    if (source.length === 0) {
      throw new ValidationError("spender intelligence sources must be non-empty refs");
    }
  }
}

/** Validate one token-registry entry (fail closed). */
export function validateTokenRegistryEntry(entry: TokenRegistryEntry): void {
  if (entry.observationId.length === 0) {
    throw new ValidationError("token registry entry requires an observationId");
  }
  validateAssetIdentity(entry.asset);
  if (entry.impersonatesAssetId !== undefined && entry.impersonatesAssetId.length === 0) {
    throw new ValidationError("impersonatesAssetId must be non-empty when present");
  }
}

/** Validate one address-intelligence entry (fail closed). */
export function validateAddressIntelligence(entry: AddressIntelligence): void {
  if (entry.observationId.length === 0) {
    throw new ValidationError("address intelligence requires an observationId");
  }
  validateAddress(entry.address, "address intelligence address");
  if (entry.chainsActiveOn.length === 0) {
    throw new ValidationError(
      "address intelligence requires at least one active chain",
    );
  }
  if (!Number.isInteger(entry.observedAt) || entry.observedAt < 0) {
    throw new ValidationError("address observedAt must be a non-negative integer");
  }
}
