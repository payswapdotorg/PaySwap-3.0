/**
 * @payswap/adversarial — structural pin: the chain vocabulary
 * (P6-W3, lane r4-w3).
 *
 * LAYER LAW: zero sibling imports (MODULE-OWNERSHIP layer `security`).
 * Chain identity is owned by the onchain-domain lane
 * (packages/onchain-domain/src, P4-W1/R2-W1); the security kernel
 * carries it as the neutral `ChainRef` string
 * (packages/onchain-security/src/types.ts). This pin mirrors BOTH
 * levels the adversarial plane needs:
 *
 * - `ChainRef` — the kernel's neutral chain reference wire (a chainKey
 *   string, e.g. `ethereum:mainnet`); the kernel's types.ts declares it
 *   as a bare string alias, pinned identically here;
 * - `isValidChainKey` / `CHAIN_KEY_PATTERN` — the onchain-domain
 *   validator verbatim (`${namespace}:${network}`, lowercase
 *   [a-z0-9-] segments, each starting alphanumerically;
 *   packages/onchain-domain/src/family.ts).
 *
 * Provider observations reference chains through this pin only: a
 * provider outage or finality anomaly names the chain it was observed
 * on by chainKey, never by a vendor-specific network id (INV-17: a
 * blockchain is one settlement rail family, not a parallel identity).
 *
 * Deterministic only: pure data + pure functions.
 */

/** Neutral chain reference — a canonical chainKey string (INV-17). */
export type ChainRef = string;

/** Canonical chainKey pattern (onchain-domain family.ts, verbatim). */
export const CHAIN_KEY_PATTERN = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;

/** Type predicate: is the value a canonical chainKey? */
export function isValidChainKey(value: unknown): value is string {
  return typeof value === "string" && CHAIN_KEY_PATTERN.test(value);
}
