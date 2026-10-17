/**
 * @payswap/onchain-security/threat-intel — the deterministic threat
 * policy: EVALUATION (R2-W2; PORT+ADAPT of payswap.org@8a735bf
 * packages/onchain-threat-intel/src/policy.ts, split for the ≤400-line
 * law; the contract + validation live in policy.ts).
 *
 * `evaluateThreatPolicy` evaluates the versioned policy over a signal
 * set: the verdict is the MOST RESTRICTIVE per-signal verdict, with
 * confidence floors applied (a below-floor signal caps at the floor's
 * `below` verdict — weak evidence escalates to humans, it never silently
 * blocks or allows). Deterministic: same (signals, policy) → same
 * evaluation.
 */

import type { ThreatSeverity } from "./families.ts";
import type { ThreatSignal } from "./signals.ts";

/** The result of evaluating the policy over a signal set. */
export interface ThreatPolicyEvaluation {
  readonly verdict: ThreatVerdict;
  /** Signals driving the final verdict (most severe first, stable order). */
  readonly drivingSignals: readonly ThreatSignal[];
  /** Human/machine basis entries: one per contributing signal. */
  readonly basis: readonly string[];
  /** The policy ref (id@version) recorded as evidence. */
  readonly policyRef: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

import { threatSeverityRank } from "./families.ts";
import {
  DEFAULT_FAMILY_SEVERITY_VERDICTS,
  isThreatVerdict,
  stricterVerdict,
  validateThreatPolicy,
  VERDICT_RANK,
  type OnchainThreatPolicy,
  type SignalVerdictResolution,
  type ThreatVerdict,
} from "./policy.ts";

/** Deterministic signal ordering: severity desc, then family, then code. */
export function orderThreatSignals(
  signals: readonly ThreatSignal[],
): readonly ThreatSignal[] {
  return [...signals].sort((a, b) => {
    const rank = threatSeverityRank(b.severity) - threatSeverityRank(a.severity);
    if (rank !== 0) {
      return rank;
    }
    if (a.family !== b.family) {
      return a.family < b.family ? -1 : 1;
    }
    if (a.code !== b.code) {
      return a.code < b.code ? -1 : 1;
    }
    return 0;
  });
}


/**
 * Resolve one signal's verdict under the policy: the family table
 * (override or default), capped by the confidence floor when the signal's
 * calibrated confidence is below it (weak evidence escalates to humans,
 * never silently blocks or allows).
 */
export function verdictForSignal(
  signal: ThreatSignal,
  policy: OnchainThreatPolicy,
): SignalVerdictResolution {
  const table =
    policy.familyVerdicts?.[signal.family] ??
    DEFAULT_FAMILY_SEVERITY_VERDICTS[signal.family];
  const verdict = table[signal.severity];
  const floor = policy.confidenceFloors?.[signal.family];
  if (floor !== undefined && signal.confidenceBps < floor.floor) {
    return { verdict: stricterVerdict(floor.below, "REQUIRE_CONFIRMATION"), capped: true, signal };
  }
  return { verdict, capped: false, signal };
}

/**
 * Evaluate the deterministic threat policy over a set of signals.
 * The verdict is the MOST RESTRICTIVE per-signal verdict, with confidence
 * floors applied (a below-floor signal caps at the floor's `below` verdict
 * — weak evidence escalates to humans, it never silently blocks or
 * allows). Deterministic: same (signals, policy) → same evaluation.
 */
export function evaluateThreatPolicy(
  signals: readonly ThreatSignal[],
  policy: OnchainThreatPolicy,
): ThreatPolicyEvaluation {
  validateThreatPolicy(policy);
  if (signals.length === 0) {
    return {
      verdict: "ALLOW",
      drivingSignals: [],
      basis: [],
      policyRef: `${policy.policyId}@${policy.version}`,
    };
  }

  const ordered = orderThreatSignals(signals);
  let verdict: ThreatVerdict = "ALLOW";
  const driving: ThreatSignal[] = [];
  const basis: string[] = [];
  for (const signal of ordered) {
    const perSignal = verdictForSignal(signal, policy);
    if (VERDICT_RANK[perSignal.verdict] > VERDICT_RANK[verdict]) {
      verdict = perSignal.verdict;
    }
    if (VERDICT_RANK[perSignal.verdict] >= VERDICT_RANK["REQUIRE_CONFIRMATION"]) {
      driving.push(signal);
      basis.push(
        `${signal.signalId}:${signal.family}:${signal.severity}:verdict=${perSignal.verdict}` +
          (perSignal.capped
            ? `:confidence_capped(${signal.confidenceBps}bps<floor)`
            : `:confidence=${signal.confidenceBps}bps`),
      );
    }
  }
  if (!isThreatVerdict(verdict)) {
    throw new Error(`unreachable: composed verdict '${String(verdict)}'`);
  }
  return {
    verdict,
    drivingSignals: Object.freeze(driving),
    basis: Object.freeze(basis),
    policyRef: `${policy.policyId}@${policy.version}`,
  };
}
