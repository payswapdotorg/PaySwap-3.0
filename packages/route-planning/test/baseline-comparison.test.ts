import { describe, expect, it } from "vitest";
import {
  BASELINE_COMPARISON_REASON_CODES,
  BASELINE_COMPARISON_VERDICTS,
  compareAgainstDirectBaseline,
} from "../src/baseline-comparison.ts";
import { routeCandidateMetricsOf, type HardGateSurvivor } from "../src/hard-gates.ts";
import type { PinnedRoutePlan } from "../src/pins/route-compiler.ts";
import { RoutePlanningValidationError } from "../src/errors.ts";

/**
 * THE MANDATORY DIRECT/NATIVE BASELINE (P27-D, ADR-0020 D6): every
 * multi-leg plan is compared against the best hard-eligible direct/native
 * baseline; a multi-leg plan that does not beat-or-justify against it is
 * NOT returned. Part of the P27-D no-bypass battery (the coverage map
 * lives in test/no-bypass.test.ts).
 */

function survivor(
  planId: string,
  net: string | undefined,
  isBaseline: boolean,
  hopCount = 2,
): HardGateSurvivor {
  const legsArray = Array.from({ length: hopCount }, (_, index) => ({
    legId: `${planId}-leg-${index}`,
    legKind: "PROVIDER_OPERATION",
    hopIndex: index,
    intentRef: "intent:baseline",
    custody: {
      from: { kind: "PROVIDER" },
      to: { kind: "PROVIDER" },
      assetRef: "asset:usd",
      amount: { currency: "USD", minorUnits: "100" },
      evidenceRefs: [],
    },
    plannedAmount: { basis: "QUOTE" },
    stateGrounding: { groundingFailures: [] },
    assumptions: [],
    evidenceRefs: [],
  }));
  const plan = {
    planId,
    shapeId: isBaseline ? "provider-native-offramp" : "mixed-dex-offramp",
    intentRef: "intent:baseline",
    compositionClass: "MIXED",
    executionMode: isBaseline ? "PASS_THROUGH_NATIVE" : "OPTIMIZED_MULTI_PROVIDER",
    isProviderNativeBaseline: isBaseline,
    candidateStatus: "EXECUTABLE_CANDIDATE",
    comparability: { comparable: true },
    ineligibilityReasons: [],
    legs: legsArray,
    evidenceRefs: [],
    planDigest: `fnv1a64:${planId.length.toString(16).padStart(16, "0")}`,
    railCrossings: { crossings: 1, legs: [] },
    environmentClasses: [],
    ...(net !== undefined
      ? {
          score: {
            candidateId: planId,
            numeraire: "USC",
            components: [{ kind: "OUTPUT", description: "arrival", numeraireMinorUnits: net }],
            netNumeraireMinorUnits: net,
          },
        }
      : {}),
  } as PinnedRoutePlan;
  return { plan, metrics: routeCandidateMetricsOf(plan) };
}

describe("the pinned baseline vocabularies", () => {
  it("the verdict and reason-code vocabularies are frozen and closed", () => {
    expect(Object.isFrozen(BASELINE_COMPARISON_VERDICTS)).toBe(true);
    expect([...BASELINE_COMPARISON_VERDICTS]).toEqual([
      "BEATS_BASELINE",
      "JUSTIFIED_ALTERNATIVE",
      "INFERIOR_TO_BASELINE",
    ]);
    expect(Object.isFrozen(BASELINE_COMPARISON_REASON_CODES)).toBe(true);
    expect([...BASELINE_COMPARISON_REASON_CODES]).toEqual([
      "NET_OUTCOME_BEATS_BASELINE",
      "NO_DIRECT_BASELINE",
      "BASELINE_NET_UNKNOWN",
      "MULTILEG_NET_UNKNOWN",
      "NET_OUTCOME_NOT_BETTER",
    ]);
  });
});

describe("compareAgainstDirectBaseline — the mandatory baseline (ADR-0020 D6)", () => {
  it("an inferior multi-leg plan (lower net than the baseline) is NOT returned", () => {
    const comparison = compareAgainstDirectBaseline({
      candidates: [
        survivor("plan:baseline", "1000", true),
        survivor("plan:multi-worse", "900", false),
        survivor("plan:multi-better", "1100", false),
      ],
    });
    expect(comparison.baseline.present).toBe(true);
    expect(comparison.baseline.planId).toBe("plan:baseline");
    expect(comparison.baseline.netNumeraireMinorUnits).toBe("1000");
    expect(comparison.comparisons.find((e) => e.planId === "plan:multi-worse")?.verdict).toBe(
      "INFERIOR_TO_BASELINE",
    );
    expect(comparison.comparisons.find((e) => e.planId === "plan:multi-better")?.verdict).toBe(
      "BEATS_BASELINE",
    );
    expect(comparison.returnedPlanIds).toEqual(["plan:baseline", "plan:multi-better"]);
    expect(comparison.baselineComparisonPermitsExecution).toBe(false);
  });

  it("PARITY favors the baseline — the simplest eligible route wins", () => {
    const comparison = compareAgainstDirectBaseline({
      candidates: [survivor("plan:baseline", "1000", true), survivor("plan:multi-equal", "1000", false)],
    });
    const equal = comparison.comparisons.find((entry) => entry.planId === "plan:multi-equal");
    expect(equal?.verdict).toBe("INFERIOR_TO_BASELINE");
    expect(equal?.reasons[0]?.code).toBe("NET_OUTCOME_NOT_BETTER");
    expect(equal?.reasons[0]?.message).toContain("parity");
    expect(comparison.returnedPlanIds).toEqual(["plan:baseline"]);
    expect(comparison.simplestEligibleRouteWins).toBe(true);
  });

  it("an UNSCORED multi-leg plan cannot justify against a SCORED baseline (UNKNOWN is never success)", () => {
    const comparison = compareAgainstDirectBaseline({
      candidates: [survivor("plan:baseline", "1000", true), survivor("plan:multi-unknown", undefined, false)],
    });
    const unknown = comparison.comparisons.find((entry) => entry.planId === "plan:multi-unknown");
    expect(unknown?.verdict).toBe("INFERIOR_TO_BASELINE");
    expect(unknown?.reasons[0]?.code).toBe("MULTILEG_NET_UNKNOWN");
    expect(comparison.returnedPlanIds).toEqual(["plan:baseline"]);
  });

  it("when NO eligible baseline exists, the multi-leg candidate is a JUSTIFIED_ALTERNATIVE (disclosed)", () => {
    const comparison = compareAgainstDirectBaseline({
      candidates: [survivor("plan:multi-only", "900", false)],
    });
    expect(comparison.baseline.present).toBe(false);
    const only = comparison.comparisons.find((entry) => entry.planId === "plan:multi-only");
    expect(only?.verdict).toBe("JUSTIFIED_ALTERNATIVE");
    expect(only?.reasons[0]?.code).toBe("NO_DIRECT_BASELINE");
    expect(comparison.returnedPlanIds).toEqual(["plan:multi-only"]);
  });

  it("an UNSCORED baseline justifies every multi-leg candidate (retained + disclosed, never guessed)", () => {
    const comparison = compareAgainstDirectBaseline({
      candidates: [
        survivor("plan:baseline-unknown", undefined, true),
        survivor("plan:multi-a", "500", false),
        survivor("plan:multi-b", "9000", false),
      ],
    });
    expect(comparison.baseline.present).toBe(true);
    expect(comparison.baseline.scored).toBe(false);
    for (const entry of comparison.comparisons) {
      expect(entry.verdict).toBe("JUSTIFIED_ALTERNATIVE");
      expect(entry.reasons[0]?.code).toBe("BASELINE_NET_UNKNOWN");
    }
    expect(comparison.returnedPlanIds).toEqual([
      "plan:baseline-unknown",
      "plan:multi-a",
      "plan:multi-b",
    ]);
  });

  it("with MULTIPLE baselines, the BEST (highest exact net) is the comparison baseline and every baseline is returned", () => {
    const comparison = compareAgainstDirectBaseline({
      candidates: [
        survivor("plan:baseline-weak", "800", true),
        survivor("plan:baseline-strong", "1200", true),
        survivor("plan:multi-1100", "1100", false),
      ],
    });
    expect(comparison.baseline.planId).toBe("plan:baseline-strong");
    expect(comparison.baseline.netNumeraireMinorUnits).toBe("1200");
    // 1100 beats the weak baseline but NOT the strong one — the comparison
    // is against the BEST direct/native option (D6: the incumbent baseline
    // is never structurally disadvantaged).
    expect(comparison.comparisons[0]?.verdict).toBe("INFERIOR_TO_BASELINE");
    expect(comparison.returnedPlanIds).toEqual(["plan:baseline-strong", "plan:baseline-weak"]);
  });

  it("negative exact nets compare exactly (BigInt, never float)", () => {
    const comparison = compareAgainstDirectBaseline({
      candidates: [
        survivor("plan:baseline", "-100", true),
        survivor("plan:multi-minus-5", "-5", false),
      ],
    });
    expect(comparison.comparisons[0]?.verdict).toBe("BEATS_BASELINE");
    expect(comparison.returnedPlanIds).toEqual(["plan:baseline", "plan:multi-minus-5"]);
  });

  it("the output is frozen and the digest deterministic", () => {
    const candidates = [survivor("plan:baseline", "1000", true), survivor("plan:multi", "900", false)];
    const left = compareAgainstDirectBaseline({ candidates });
    const right = compareAgainstDirectBaseline({ candidates });
    expect(left.comparisonDigest).toBe(right.comparisonDigest);
    expect(left.comparisonDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(Object.isFrozen(left)).toBe(true);
    expect(Object.isFrozen(left.comparisons)).toBe(true);
    expect(Object.isFrozen(left.returnedPlanIds)).toBe(true);
  });

  it("input validation is fail-closed (malformed candidates never construct a comparison)", () => {
    expect(() => compareAgainstDirectBaseline({ candidates: "nope" as never })).toThrow(
      RoutePlanningValidationError,
    );
    expect(() =>
      compareAgainstDirectBaseline({
        candidates: [{ plan: { planId: "" }, metrics: {} } as never],
      }),
    ).toThrow(RoutePlanningValidationError);
    expect(() =>
      compareAgainstDirectBaseline({
        candidates: [
          survivor("plan:bad-net", "12.5", true),
        ],
      }),
    ).toThrow(RoutePlanningValidationError);
  });
});
