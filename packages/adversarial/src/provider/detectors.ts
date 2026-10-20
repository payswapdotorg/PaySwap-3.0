/**
 * @payswap/adversarial — the detector sweep (P6-W3, lane r4-w3; ADAPT
 * of the old adversarial suite's "runs every fault family" /
 * "covers every family exactly once" laws — one deterministic sweep
 * over the bundle runs EVERY family detector exactly once and returns
 * the severity-ordered, deduplicated signal set).
 *
 * The sweep is the provider agent's only detector entry (./agent.ts):
 * pure, total, deterministic. A family missing from the sweep is a
 * fail-closed defect — `assertFullFamilyCoverage` proves the sweep
 * covers every member of PROVIDER_THREAT_FAMILIES exactly once.
 *
 * Deterministic only: same bundle + same thresholds → byte-identical
 * signals in a deterministic total order.
 */

import type { ProviderObservationBundle } from "./observations.ts";
import type { ProviderThreatSignal } from "./signals.ts";
import { validateProviderObservationBundle } from "./observations.ts";
import type { ProviderDetectorThresholds } from "./detectors-context.ts";
import { DEFAULT_PROVIDER_THRESHOLDS, validateThresholds } from "./detectors-context.ts";
import type { DetectorContext } from "./detectors-provider.ts";
import {
  detectAmbiguousProvider,
  detectClockSkew,
  detectDuplicatedCommands,
  detectLostWebhooks,
  detectPartialPayment,
  detectProviderOutage,
} from "./detectors-provider.ts";
import type { AgentDetectorContext } from "./detectors-agent.ts";
import {
  detectAccountTakeover,
  detectIncentiveAbuse,
  detectLeaderboardGaming,
  detectMaliciousAgent,
  detectPackageCompromise,
} from "./detectors-agent.ts";
import { PROVIDER_THREAT_FAMILIES, type ProviderThreatFamily } from "./families.ts";
import { compareProviderSignals } from "./signals.ts";

/** Everything the sweep consumes (pure data). */
export interface ProviderDetectorSweepInput {
  readonly bundle: ProviderObservationBundle;
  readonly thresholds?: ProviderDetectorThresholds;
}

/** Raised when the sweep does not cover every family exactly once (fail closed). */
export class DetectorCoverageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetectorCoverageError";
  }
}

/** The families the sweep runs, in sweep order (explicit, exported data). */
export const SWEPT_FAMILIES: readonly ProviderThreatFamily[] = Object.freeze([
  "duplicated_commands",
  "lost_webhooks",
  "ambiguous_provider",
  "account_takeover",
  "malicious_agent",
  "package_compromise",
  "incentive_sybil_collusion_wash",
  "leaderboard_gaming",
  "provider_outage",
  "clock_skew",
  "partial_payment",
]);

/** Prove the sweep covers every family EXACTLY ONCE (fail closed). */
export function assertFullFamilyCoverage(): void {
  const seen = new Set<ProviderThreatFamily>();
  for (const family of SWEPT_FAMILIES) {
    if (seen.has(family)) {
      throw new DetectorCoverageError(
        `detector sweep covers family '${family}' more than once`,
      );
    }
    seen.add(family);
  }
  for (const family of PROVIDER_THREAT_FAMILIES) {
    if (!seen.has(family)) {
      throw new DetectorCoverageError(
        `detector sweep does not cover family '${family}' (a missing family is a fail-closed defect)`,
      );
    }
  }
}

/**
 * Run EVERY family detector exactly once over the bundle and return
 * the severity-ordered, deduplicated signal set (deterministic total
 * order: severity desc, family, code, signalId).
 */
export function runAllProviderDetectors(
  input: ProviderDetectorSweepInput,
): readonly ProviderThreatSignal[] {
  assertFullFamilyCoverage();
  const thresholds = input.thresholds ?? DEFAULT_PROVIDER_THRESHOLDS;
  validateThresholds(thresholds);
  validateProviderObservationBundle(input.bundle);
  const providerContext: DetectorContext = {
    bundle: input.bundle,
    thresholds,
  };
  const agentContext: AgentDetectorContext = {
    bundle: input.bundle,
    thresholds,
  };
  const signals: ProviderThreatSignal[] = [
    ...detectDuplicatedCommands(providerContext),
    ...detectLostWebhooks(providerContext),
    ...detectAmbiguousProvider(providerContext),
    ...detectAccountTakeover(agentContext),
    ...detectMaliciousAgent(agentContext),
    ...detectPackageCompromise(agentContext),
    ...detectIncentiveAbuse(agentContext),
    ...detectLeaderboardGaming(agentContext),
    ...detectProviderOutage(providerContext),
    ...detectClockSkew(providerContext),
    ...detectPartialPayment(providerContext),
  ];
  const seen = new Set<string>();
  const unique: ProviderThreatSignal[] = [];
  for (const signal of signals) {
    if (!seen.has(signal.signalId)) {
      seen.add(signal.signalId);
      unique.push(signal);
    }
  }
  return Object.freeze(unique.sort(compareProviderSignals));
}
