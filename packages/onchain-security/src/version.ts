/**
 * @payswap/onchain-security — wire-contract version stamps (R2-W2).
 *
 * Every contract this package exports is a VERSIONED, CANONICAL wire shape
 * (Work Order P4-W2 commit 1: "pinned wire shapes"). The stamps below are
 * the deterministic compatibility surface: consumers may pin them in
 * evidence records, and the package-local suite asserts they match the
 * contracts actually exported. A stamp changes ONLY through an accepted
 * Work Order + ADR (frozen-architecture law, INV-29 discipline).
 *
 * - KERNEL_WIRE_VERSION: identity + write + simulation + diff + gates +
 *   authorization + delegation + recheck + pipeline + signer contracts
 *   (the core barrel, ".").
 * - THREAT_INTEL_WIRE_VERSION: the threat-intelligence vocabulary
 *   (families, evidence, confidence, observations, signals, policy,
 *   detectors, agent, verdict, advisory bridge — "./threat-intel").
 * - ADAPTER_WIRE_VERSION: EVM signing semantics behind "./adapters/*"
 *   (EIP-712 typed data, ERC-1271 envelopes).
 */

/** Version of the kernel wire contracts exported from the root barrel. */
export const KERNEL_WIRE_VERSION = "onchain-security-kernel/1" as const;

/** Version of the threat-intelligence wire contracts ("./threat-intel"). */
export const THREAT_INTEL_WIRE_VERSION = "onchain-threat-intel/1" as const;

/** Version of the signer-adapter wire contracts ("./adapters/*"). */
export const ADAPTER_WIRE_VERSION = "onchain-signer-adapters/1" as const;
