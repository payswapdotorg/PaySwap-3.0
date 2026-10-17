/**
 * @payswap/onchain-security/threat-intel — chain-infrastructure
 * observations: oracle, bridge, finality, mempool and signature-domain
 * intelligence (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/observations.ts, split for the
 * ≤400-line law).
 *
 * Prices, quorums and deviations are EXACT canonical rationals
 * ("num/den", den > 0) — never floating point (INV-2 discipline). All
 * entries are AGENT-FACING (the kernel secret scan runs on the whole
 * bundle at record time, INV-19).
 */

import type { ChainRef } from "../types.ts";
import { validateChainRef } from "../types.ts";
import { ValidationError } from "../pins/index.ts";

/**
 * One oracle reading (exact rational price, e.g. "998750/1000"). Prices
 * are canonical "num/den" rationals — never floating point.
 */
export interface OracleObservation {
  readonly observationId: string;
  /** Oracle component id (e.g. "oracle:chainlink-usdc-eth"). */
  readonly oracleId: string;
  /** The quoted pair, e.g. "USC/USD". */
  readonly pair: string;
  /** Exact rational price "num/den" (den > 0). */
  readonly observedPrice: string;
  /** When the oracle last updated this price (ms). */
  readonly priceUpdatedAt: number;
  /** Age of the oracle update at bundle observation (ms, ≥ 0). */
  readonly feedAgeMs: number;
}

/** Observed health of one bridge the route may cross. */
export interface BridgeHealthObservation {
  readonly observationId: string;
  readonly bridgeId: string;
  readonly status: "healthy" | "degraded" | "halted";
  /** When the validator set last changed (ms), when known. */
  readonly validatorSetChangedAt?: number;
  /** Observed attestation quorum as exact rational "num/den", when known. */
  readonly attestationQuorum?: string;
  readonly observedAt: number;
}

/** Observed chain finality state (head, safe head, last reorg depth). */
export interface FinalityObservation {
  readonly observationId: string;
  readonly chain: ChainRef;
  /** Observed chain head block (non-negative integer). */
  readonly headBlock: number;
  /** Observed safe/finality-candidate block (≤ head). */
  readonly safeBlock: number;
  /** Depth of the last observed reorg in blocks, when one occurred. */
  readonly lastReorgDepthBlocks?: number;
  readonly observedAt: number;
}

/** Observed mempool visibility of the pending write. */
export interface MempoolObservation {
  readonly observationId: string;
  readonly chain: ChainRef;
  /** True when the write's payload is visible pre-confirmation (public mempool). */
  readonly writeVisible: boolean;
  /** Count of competing transactions observed for the same venue/pool. */
  readonly competingTransactions?: number;
  readonly observedAt: number;
}

/**
 * Signature-domain intelligence for the exact payload digest of this write
 * (EIP-712 style): has this digest been observed before (replay), under
 * which domain/chain, and has its nonce/permit deadline expired.
 */
export interface DomainObservation {
  readonly observationId: string;
  /** The payload digest this intelligence is bound to. */
  readonly payloadDigest: string;
  /** The observed signing-domain identifier (opaque, e.g. domain hash ref). */
  readonly domainRef: string;
  /** The chain the signing domain is bound to, when known. */
  readonly domainChain?: ChainRef;
  /** True when this exact digest was previously observed (replay risk). */
  readonly digestPreviouslyObserved: boolean;
  /** When the write's nonce was last used (nonce reuse), when known. */
  readonly nonceLastUsedAt?: number;
  /** Permit deadline (ms) carried by the signed payload, when present. */
  readonly permitDeadline?: number;
  readonly observedAt: number;
}

// ---------------------------------------------------------------------------
// Implementation (validators)
// ---------------------------------------------------------------------------

const RATIONAL_ONLY_PATTERN = /^(0|[1-9][0-9]*)\/([1-9][0-9]*)$/;

/** Validate one oracle observation (fail closed). */
export function validateOracleObservation(entry: OracleObservation): void {
  if (entry.observationId.length === 0) {
    throw new ValidationError("oracle observation requires an observationId");
  }
  if (entry.oracleId.length === 0 || entry.pair.length === 0) {
    throw new ValidationError("oracle observation requires oracleId and pair");
  }
  if (!RATIONAL_ONLY_PATTERN.test(entry.observedPrice)) {
    throw new ValidationError(
      `oracle price '${entry.observedPrice}' must be a canonical rational "num/den"`,
    );
  }
  if (
    !Number.isInteger(entry.priceUpdatedAt) ||
    entry.priceUpdatedAt < 0 ||
    !Number.isInteger(entry.feedAgeMs) ||
    entry.feedAgeMs < 0
  ) {
    throw new ValidationError(
      "oracle observation requires non-negative integer priceUpdatedAt and feedAgeMs",
    );
  }
}

/** Validate one bridge-health observation (fail closed). */
export function validateBridgeHealthObservation(entry: BridgeHealthObservation): void {
  if (entry.observationId.length === 0) {
    throw new ValidationError("bridge health observation requires an observationId");
  }
  if (entry.bridgeId.length === 0) {
    throw new ValidationError("bridge health observation requires a bridgeId");
  }
  if (
    entry.status !== "healthy" &&
    entry.status !== "degraded" &&
    entry.status !== "halted"
  ) {
    throw new ValidationError(
      `unknown bridge status '${String(entry.status)}'`,
    );
  }
  if (entry.validatorSetChangedAt !== undefined && entry.validatorSetChangedAt < 0) {
    throw new ValidationError("validatorSetChangedAt must be non-negative ms");
  }
  if (
    entry.attestationQuorum !== undefined &&
    !RATIONAL_ONLY_PATTERN.test(entry.attestationQuorum)
  ) {
    throw new ValidationError(
      `attestation quorum '${entry.attestationQuorum}' must be a canonical rational "num/den"`,
    );
  }
  if (!Number.isInteger(entry.observedAt) || entry.observedAt < 0) {
    throw new ValidationError("bridge observedAt must be a non-negative integer");
  }
}

/** Validate one finality observation (fail closed). */
export function validateFinalityObservation(entry: FinalityObservation): void {
  if (entry.observationId.length === 0) {
    throw new ValidationError("finality observation requires an observationId");
  }
  validateChainRef(entry.chain);
  if (
    !Number.isInteger(entry.headBlock) ||
    entry.headBlock < 0 ||
    !Number.isInteger(entry.safeBlock) ||
    entry.safeBlock < 0
  ) {
    throw new ValidationError(
      "finality observation requires non-negative integer headBlock and safeBlock",
    );
  }
  if (entry.safeBlock > entry.headBlock) {
    throw new ValidationError(
      `safeBlock ${entry.safeBlock} cannot exceed headBlock ${entry.headBlock}`,
    );
  }
  if (
    entry.lastReorgDepthBlocks !== undefined &&
    (!Number.isInteger(entry.lastReorgDepthBlocks) ||
      entry.lastReorgDepthBlocks < 0)
  ) {
    throw new ValidationError("lastReorgDepthBlocks must be a non-negative integer");
  }
  if (!Number.isInteger(entry.observedAt) || entry.observedAt < 0) {
    throw new ValidationError("finality observedAt must be a non-negative integer");
  }
}

/** Validate one mempool observation (fail closed). */
export function validateMempoolObservation(entry: MempoolObservation): void {
  if (entry.observationId.length === 0) {
    throw new ValidationError("mempool observation requires an observationId");
  }
  validateChainRef(entry.chain);
  if (
    entry.competingTransactions !== undefined &&
    (!Number.isInteger(entry.competingTransactions) ||
      entry.competingTransactions < 0)
  ) {
    throw new ValidationError("competingTransactions must be a non-negative integer");
  }
  if (!Number.isInteger(entry.observedAt) || entry.observedAt < 0) {
    throw new ValidationError("mempool observedAt must be a non-negative integer");
  }
}

/** Validate one signature-domain observation (fail closed). */
export function validateDomainObservation(entry: DomainObservation): void {
  if (entry.observationId.length === 0) {
    throw new ValidationError("domain observation requires an observationId");
  }
  if (entry.payloadDigest.length === 0 || entry.domainRef.length === 0) {
    throw new ValidationError(
      "domain observation requires payloadDigest and domainRef",
    );
  }
  if (entry.domainChain !== undefined) {
    validateChainRef(entry.domainChain);
  }
  if (entry.nonceLastUsedAt !== undefined && entry.nonceLastUsedAt < 0) {
    throw new ValidationError("nonceLastUsedAt must be non-negative ms");
  }
  if (entry.permitDeadline !== undefined && entry.permitDeadline < 0) {
    throw new ValidationError("permitDeadline must be non-negative ms");
  }
  if (!Number.isInteger(entry.observedAt) || entry.observedAt < 0) {
    throw new ValidationError("domain observedAt must be a non-negative integer");
  }
}
