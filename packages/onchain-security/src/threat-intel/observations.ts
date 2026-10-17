/**
 * @payswap/onchain-security/threat-intel — the threat-intelligence
 * observation bundle (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/observations.ts, split for the
 * ≤400-line law; the entry types live in observations-intel.ts and
 * observations-chain.ts).
 *
 * The adversarial agent never guesses: it consumes an OBSERVATION BUNDLE —
 * deterministic, secret-scanned, provenance-carrying intelligence about
 * the world the write will execute in. Every entry carries an observation
 * id: signals reference exactly these ids in their evidence chains
 * (evidence.ts). The bundle itself is content-addressed (kernel digest) —
 * assessments pin it.
 *
 * The bundle is AGENT-FACING: the kernel secret scan
 * (assertNoSecretMaterial) runs on the whole bundle at record time; node
 * credentials, provider secrets or key-shaped material are rejected by
 * construction (INV-19).
 *
 * Deterministic only: the observer supplies every instant; no ambient
 * clock, no randomness, no network.
 */

import type { SlippageDisclosure, LiquidityImpactDisclosure } from "../pins/index.ts";
import { assertNoSecretMaterial } from "../secrets.ts";
import { contentDigest } from "../digest.ts";
import type { AddressIntelligence, SpenderIntelligence, TokenRegistryEntry } from "./observations-intel.ts";
import {
  validateAddressIntelligence,
  validateSpenderIntelligence,
  validateTokenRegistryEntry,
} from "./observations-intel.ts";
import type {
  BridgeHealthObservation,
  DomainObservation,
  FinalityObservation,
  MempoolObservation,
  OracleObservation,
} from "./observations-chain.ts";
import {
  validateBridgeHealthObservation,
  validateDomainObservation,
  validateFinalityObservation,
  validateMempoolObservation,
  validateOracleObservation,
} from "./observations-chain.ts";

/**
 * The observation bundle: one deterministic, secret-scanned,
 * content-addressed intelligence snapshot the agent analyzes. Optional
 * sections are ABSENT intelligence, not clean bills: detectors treat
 * absence as evidence-weak (registry_absence method, low band) only where
 * the policy demands coverage.
 */
export interface OnchainThreatObservationBundle {
  readonly bundleId: string;
  /** Observer provenance (who assembled this bundle). */
  readonly observer: string;
  /** Observation instant (ms) — the bundle's freshness anchor. */
  readonly observedAt: number;
  readonly spenders?: readonly SpenderIntelligence[];
  readonly tokens?: readonly TokenRegistryEntry[];
  readonly oracles?: readonly OracleObservation[];
  readonly bridges?: readonly BridgeHealthObservation[];
  readonly finality?: FinalityObservation;
  readonly mempool?: MempoolObservation;
  readonly domain?: DomainObservation;
  readonly addresses?: readonly AddressIntelligence[];
  /** Execution-quote disclosures (typed structural inputs — see pins/quote.ts). */
  readonly quoteSlippage?: SlippageDisclosure;
  readonly quoteLiquidityImpact?: LiquidityImpactDisclosure;
  /** When the quote was observed / expires (ms), when quotes are supplied. */
  readonly quoteObservedAt?: number;
  readonly quoteValidUntil?: number;
  /** Content digest binding the whole bundle (computed at record time). */
  readonly bundleDigest: string;
}

/** The bundle minus the computed digest (recordObservationBundle input). */
export type OnchainThreatObservationBundleInput = Omit<
  OnchainThreatObservationBundle,
  "bundleDigest"
>;

/** Raised when a bundle fails structural validation (fail closed). */
export class InvalidObservationBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidObservationBundleError";
  }
}

// ---------------------------------------------------------------------------
// Implementation (record)
// ---------------------------------------------------------------------------

function requireUniqueIds(
  entries: readonly { observationId: string }[],
  label: string,
): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.observationId)) {
      throw new InvalidObservationBundleError(
        `duplicate observationId '${entry.observationId}' in ${label}`,
      );
    }
    seen.add(entry.observationId);
  }
}

/**
 * Validate, secret-scan, freeze and content-address an observation bundle.
 * Fail-closed: malformed intelligence is never repaired or guessed. The
 * secret scan is the kernel's (INV-19: no key material crosses the
 * agent-facing boundary — not even inside "intelligence").
 */
export function recordObservationBundle(
  bundle: OnchainThreatObservationBundleInput,
): OnchainThreatObservationBundle {
  assertNoSecretMaterial(bundle, "onchain threat observation bundle");

  if (bundle.bundleId.length === 0) {
    throw new InvalidObservationBundleError("bundleId must be non-empty");
  }
  if (bundle.observer.length === 0) {
    throw new InvalidObservationBundleError("observer must be a non-empty provenance ref");
  }
  if (!Number.isInteger(bundle.observedAt) || bundle.observedAt < 0) {
    throw new InvalidObservationBundleError(
      "observedAt must be a non-negative integer (ms)",
    );
  }

  if (bundle.spenders !== undefined) {
    requireUniqueIds(bundle.spenders, "spender intelligence");
    for (const entry of bundle.spenders) {
      validateSpenderIntelligence(entry);
    }
  }
  if (bundle.tokens !== undefined) {
    requireUniqueIds(bundle.tokens, "token registry");
    for (const entry of bundle.tokens) {
      validateTokenRegistryEntry(entry);
    }
  }
  if (bundle.oracles !== undefined) {
    requireUniqueIds(bundle.oracles, "oracle observations");
    for (const entry of bundle.oracles) {
      validateOracleObservation(entry);
    }
  }
  if (bundle.bridges !== undefined) {
    requireUniqueIds(bundle.bridges, "bridge health");
    for (const entry of bundle.bridges) {
      validateBridgeHealthObservation(entry);
    }
  }
  if (bundle.finality !== undefined) {
    validateFinalityObservation(bundle.finality);
  }
  if (bundle.mempool !== undefined) {
    validateMempoolObservation(bundle.mempool);
  }
  if (bundle.domain !== undefined) {
    validateDomainObservation(bundle.domain);
  }
  if (bundle.addresses !== undefined) {
    requireUniqueIds(bundle.addresses, "address intelligence");
    for (const entry of bundle.addresses) {
      validateAddressIntelligence(entry);
    }
  }
  for (const instant of [bundle.quoteObservedAt, bundle.quoteValidUntil]) {
    if (instant !== undefined && (!Number.isInteger(instant) || instant < 0)) {
      throw new InvalidObservationBundleError(
        "quote instants must be non-negative integers (ms)",
      );
    }
  }
  if (
    bundle.quoteSlippage === undefined &&
    bundle.quoteLiquidityImpact !== undefined
  ) {
    throw new InvalidObservationBundleError(
      "quoteLiquidityImpact requires quoteSlippage (a quote carries both or neither)",
    );
  }
  if (
    (bundle.quoteObservedAt === undefined) !==
    (bundle.quoteSlippage === undefined)
  ) {
    throw new InvalidObservationBundleError(
      "quoteObservedAt is mandatory exactly when a quote is supplied",
    );
  }

  const bundleDigest = contentDigest({
    bundleId: bundle.bundleId,
    observer: bundle.observer,
    observedAt: bundle.observedAt,
    spenders: bundle.spenders,
    tokens: bundle.tokens,
    oracles: bundle.oracles,
    bridges: bundle.bridges,
    finality: bundle.finality,
    mempool: bundle.mempool,
    domain: bundle.domain,
    addresses: bundle.addresses,
    quoteSlippage: bundle.quoteSlippage,
    quoteLiquidityImpact: bundle.quoteLiquidityImpact,
    quoteObservedAt: bundle.quoteObservedAt,
    quoteValidUntil: bundle.quoteValidUntil,
  });

  return Object.freeze({
    bundleId: bundle.bundleId,
    observer: bundle.observer,
    observedAt: bundle.observedAt,
    ...(bundle.spenders === undefined
      ? {}
      : { spenders: Object.freeze(bundle.spenders.map((s) => Object.freeze(s))) }),
    ...(bundle.tokens === undefined
      ? {}
      : { tokens: Object.freeze(bundle.tokens.map((t) => Object.freeze(t))) }),
    ...(bundle.oracles === undefined
      ? {}
      : { oracles: Object.freeze(bundle.oracles.map((o) => Object.freeze(o))) }),
    ...(bundle.bridges === undefined
      ? {}
      : {
          bridges: Object.freeze(
            bundle.bridges.map((b) => Object.freeze(b)),
          ),
        }),
    ...(bundle.finality === undefined ? {} : { finality: Object.freeze(bundle.finality) }),
    ...(bundle.mempool === undefined ? {} : { mempool: Object.freeze(bundle.mempool) }),
    ...(bundle.domain === undefined ? {} : { domain: Object.freeze(bundle.domain) }),
    ...(bundle.addresses === undefined
      ? {}
      : {
          addresses: Object.freeze(
            bundle.addresses.map((a) => Object.freeze(a)),
          ),
        }),
    ...(bundle.quoteSlippage === undefined
      ? {}
      : { quoteSlippage: bundle.quoteSlippage }),
    ...(bundle.quoteLiquidityImpact === undefined
      ? {}
      : { quoteLiquidityImpact: bundle.quoteLiquidityImpact }),
    ...(bundle.quoteObservedAt === undefined ? {} : { quoteObservedAt: bundle.quoteObservedAt }),
    ...(bundle.quoteValidUntil === undefined ? {} : { quoteValidUntil: bundle.quoteValidUntil }),
    bundleDigest,
  });
}
