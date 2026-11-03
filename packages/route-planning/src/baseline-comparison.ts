/**
 * @payswap/route-planning — the MANDATORY direct/native baseline
 * comparison (P27-D, ADR-0020 D6: "only then does ranking compare
 * provider-native, one-node composed and multi-node candidates under the
 * same comparability rules, ALWAYS INCLUDING the direct/native baseline
 * when one exists"; "the simplest eligible route wins unless a longer
 * route's disclosed benefit outweighs its hop costs").
 *
 * Every multi-leg plan is compared against the best hard-eligible
 * DIRECT/NATIVE baseline: a multi-leg plan that does not BEAT or JUSTIFY
 * itself against the baseline is NOT RETURNED. The comparison is exact
 * money (BigInt over the scored net outcome) and fail-closed on UNKNOWN:
 * an unscored multi-leg plan cannot justify against a scored baseline
 * (UNKNOWN is never success — the INV-04 discipline); an unscored
 * baseline cannot disqualify anyone (it is retained and disclosed, and
 * the deterministic ranking's UNKNOWN law governs the rest).
 *
 * This module is a DISCOVERY projection: `baselineComparisonPermitsExecution`
 * is the literal false.
 */

import { RoutePlanningValidationError } from "./errors.ts";
import { contentDigest, deepFreeze } from "./canonical.ts";
import type { HardGateSurvivor } from "./hard-gates.ts";

/** The typed baseline-comparison verdicts. */
export const BASELINE_COMPARISON_VERDICTS = Object.freeze([
  "BEATS_BASELINE",
  "JUSTIFIED_ALTERNATIVE",
  "INFERIOR_TO_BASELINE",
] as const);

export type BaselineComparisonVerdict = (typeof BASELINE_COMPARISON_VERDICTS)[number];

/** The typed comparison reason codes (stable identities). */
export const BASELINE_COMPARISON_REASON_CODES = Object.freeze([
  "NET_OUTCOME_BEATS_BASELINE",
  "NO_DIRECT_BASELINE",
  "BASELINE_NET_UNKNOWN",
  "MULTILEG_NET_UNKNOWN",
  "NET_OUTCOME_NOT_BETTER",
] as const);

export type BaselineComparisonReasonCode = (typeof BASELINE_COMPARISON_REASON_CODES)[number];

/** One multi-leg candidate's comparison against the direct/native baseline. */
export interface RouteBaselineCandidateComparison {
  readonly planId: string;
  readonly verdict: BaselineComparisonVerdict;
  readonly reasons: readonly { readonly code: BaselineComparisonReasonCode; readonly message: string }[];
  readonly hopCount: number;
  /** Present iff the plan carries a scored evaluation. */
  readonly netNumeraireMinorUnits?: string;
}

/** The baseline comparison output contract. */
export interface RouteBaselineComparison {
  /** The best hard-eligible direct/native baseline (present:false when none exists). */
  readonly baseline: {
    readonly present: boolean;
    readonly planId?: string;
    readonly scored: boolean;
    readonly netNumeraireMinorUnits?: string;
  };
  /** Every non-baseline survivor's comparison (retained with reasons, never dropped silently). */
  readonly comparisons: readonly RouteBaselineCandidateComparison[];
  /**
   * The planIds the comparison RETURNS: every baseline plus every
   * multi-leg plan that beats-or-justifies against the baseline. A
   * multi-leg plan that does not is NOT here (ADR-0020 D6).
   */
  readonly returnedPlanIds: readonly string[];
  /** The disclosed D6 preference (the simplest eligible route wins on parity). */
  readonly simplestEligibleRouteWins: true;
  readonly comparisonDigest: string;
  /** LITERAL: the baseline comparison never permits execution. */
  readonly baselineComparisonPermitsExecution: false;
}

function survivorNet(survivor: HardGateSurvivor): bigint | undefined {
  const net = survivor.metrics.score?.netNumeraireMinorUnits;
  if (net === undefined) {
    return undefined;
  }
  if (!/^-?[0-9]+$/.test(net)) {
    throw new RoutePlanningValidationError(
      `plan '${survivor.plan.planId}' carries a malformed netNumeraireMinorUnits '${net}' (a signed integer string, never anything else)`,
    );
  }
  return BigInt(net);
}

/**
 * Compare every hard-eligible multi-leg candidate against the best
 * hard-eligible direct/native baseline (the MANDATORY baseline, ADR-0020
 * D6). Fail-closed: an unscored multi-leg candidate against a scored
 * baseline is INFERIOR (not returned); parity favors the baseline; a
 * missing or unscored baseline justifies every multi-leg candidate with
 * the typed disclosure.
 */
export function compareAgainstDirectBaseline(input: {
  readonly candidates: readonly HardGateSurvivor[];
}): RouteBaselineComparison {
  if (!Array.isArray(input.candidates)) {
    throw new RoutePlanningValidationError(
      "candidates must be an array of hard-gate survivors (the baseline comparison runs AFTER the hard gates)",
    );
  }
  for (const survivor of input.candidates) {
    if (typeof survivor?.plan?.planId !== "string" || survivor.plan.planId.length === 0) {
      throw new RoutePlanningValidationError(
        "every candidate must be a hard-gate survivor carrying a non-empty planId",
      );
    }
  }
  const baselines = input.candidates.filter((survivor) => survivor.metrics.isProviderNativeBaseline);
  const multiLeg = input.candidates.filter((survivor) => !survivor.metrics.isProviderNativeBaseline);
  // The BEST baseline: highest exact net; UNKNOWN nets rank below any known
  // net; ties break by planId (the deterministic total order).
  const orderedBaselines = [...baselines].sort((left, right) => {
    const leftNet = survivorNet(left);
    const rightNet = survivorNet(right);
    if (leftNet !== undefined && rightNet !== undefined && leftNet !== rightNet) {
      return rightNet > leftNet ? 1 : -1;
    }
    if (leftNet !== undefined && rightNet === undefined) {
      return -1;
    }
    if (leftNet === undefined && rightNet !== undefined) {
      return 1;
    }
    return left.plan.planId < right.plan.planId ? -1 : 1;
  });
  const bestBaseline = orderedBaselines[0];
  const baselineNet = bestBaseline === undefined ? undefined : survivorNet(bestBaseline);

  const comparisons: RouteBaselineCandidateComparison[] = [];
  const returned: string[] = [];
  for (const baseline of orderedBaselines) {
    returned.push(baseline.plan.planId);
  }
  const orderedMultiLeg = [...multiLeg].sort((left, right) =>
    left.plan.planId < right.plan.planId ? -1 : 1,
  );
  for (const survivor of orderedMultiLeg) {
    const net = survivorNet(survivor);
    let verdict: BaselineComparisonVerdict;
    let reasons: { code: BaselineComparisonReasonCode; message: string }[];
    if (bestBaseline === undefined) {
      verdict = "JUSTIFIED_ALTERNATIVE";
      reasons = [
        {
          code: "NO_DIRECT_BASELINE",
          message:
            "no hard-eligible direct/native baseline exists for this corridor — the multi-leg candidate is the only eligible shape class (disclosed, never silent)",
        },
      ];
    } else if (baselineNet === undefined) {
      verdict = "JUSTIFIED_ALTERNATIVE";
      reasons = [
        {
          code: "BASELINE_NET_UNKNOWN",
          message: `the direct/native baseline '${bestBaseline.plan.planId}' carries no scored net outcome (UNKNOWN is retained and disclosed, never guessed) — the multi-leg candidate cannot be disqualified by an UNKNOWN`,
        },
      ];
    } else if (net === undefined) {
      verdict = "INFERIOR_TO_BASELINE";
      reasons = [
        {
          code: "MULTILEG_NET_UNKNOWN",
          message: `the multi-leg plan '${survivor.plan.planId}' carries no scored net outcome while the baseline '${bestBaseline.plan.planId}' is scored — an unscored multi-leg plan cannot justify against the scored direct baseline (UNKNOWN is never success)`,
        },
      ];
    } else if (net > baselineNet) {
      verdict = "BEATS_BASELINE";
      reasons = [
        {
          code: "NET_OUTCOME_BEATS_BASELINE",
          message: `the multi-leg plan's disclosed net outcome ${net} beats the direct/native baseline's ${baselineNet} — the longer route's disclosed benefit outweighs its hop costs (ADR-0020 D6)`,
        },
      ];
    } else {
      verdict = "INFERIOR_TO_BASELINE";
      reasons = [
        {
          code: "NET_OUTCOME_NOT_BETTER",
          message: `the multi-leg plan's disclosed net outcome ${net} does not beat the direct/native baseline's ${baselineNet}${net === baselineNet ? " (parity — the simplest eligible route wins, ADR-0020 D6)" : ""} — extra hops are a cost center, never a default`,
        },
      ];
    }
    comparisons.push(
      deepFreeze({
        planId: survivor.plan.planId,
        verdict,
        reasons: Object.freeze(reasons),
        hopCount: survivor.metrics.hopCount,
        ...(net !== undefined ? { netNumeraireMinorUnits: net.toString() } : {}),
      }),
    );
    if (verdict !== "INFERIOR_TO_BASELINE") {
      returned.push(survivor.plan.planId);
    }
  }
  const comparisonDigest = contentDigest({
    baseline:
      bestBaseline === undefined
        ? { present: false }
        : {
            present: true,
            planId: bestBaseline.plan.planId,
            ...(baselineNet !== undefined ? { net: baselineNet.toString() } : { netUnknown: true }),
          },
    comparisons,
    returned,
  });
  return deepFreeze({
    baseline: deepFreeze(
      bestBaseline === undefined
        ? { present: false as const, scored: false as const }
        : {
            present: true as const,
            planId: bestBaseline.plan.planId,
            scored: baselineNet !== undefined,
            ...(baselineNet !== undefined
              ? { netNumeraireMinorUnits: baselineNet.toString() }
              : {}),
          },
    ),
    comparisons: Object.freeze(comparisons),
    returnedPlanIds: Object.freeze([...returned].sort((left, right) => (left < right ? -1 : 1))),
    simplestEligibleRouteWins: true as const,
    comparisonDigest,
    baselineComparisonPermitsExecution: false as const,
  });
}
