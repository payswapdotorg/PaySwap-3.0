import { describe, expect, it } from "vitest";
import { evaluateNetOutcome, compareNetOutcomes } from "../src/scoring.ts";
import { rankScoredPlans } from "../src/scoring-order.ts";
import { validateBestExecutionPolicy } from "../src/policy.ts";
import { ValidationError } from "../src/errors.ts";
import { baseBestExecutionPolicy } from "./venue-fixtures.ts";
import { scoringQuote, secondVenueQuote } from "./walk-fixtures.ts";
import { railCrossingCount } from "../src/rail-family.ts";
import type { CustodyTransfer } from "../src/custody.ts";

/**
 * Net-outcome scoring (PORT of the old comparator suite + the NET-NEW
 * INV-C08 baseline-indifference laws): the guaranteed worst case is the
 * scored number; every dimension is an explicit typed input; no hidden
 * constants; provider-native and composed score identically.
 */
describe("evaluateNetOutcome (exact arithmetic, one floor per component)", () => {
  const policy = validateBestExecutionPolicy(baseBestExecutionPolicy());

  it("the net derives from the GUARANTEED worst case (the optimistic estimate never enters)", () => {
    const evaluation = evaluateNetOutcome({ candidate: { candidateId: "q1", quote: scoringQuote() }, policy });
    const output = evaluation.components.find((component) => component.kind === "OUTPUT");
    expect(output?.sourceAmount?.minorUnits).toBe("3200000");
    expect(evaluation.components.some((component) => component.numeraireMinorUnits === "3300000")).toBe(false);
    expect(evaluation.netNumeraireMinorUnits).toBe("2299880");
  });

  it("fees, gas, risk deduction and time cost are each deducted exactly once", () => {
    const evaluation = evaluateNetOutcome({ candidate: { candidateId: "q1", quote: scoringQuote() }, policy });
    expect(evaluation.components.filter((component) => component.kind === "FEE").length).toBe(1);
    expect(evaluation.components.filter((component) => component.kind === "GAS").length).toBe(1);
    expect(evaluation.components.filter((component) => component.kind === "RISK_DEDUCTION").length).toBe(1);
    expect(evaluation.components.filter((component) => component.kind === "TIME_COST").length).toBe(1);
    expect(evaluation.components.find((c) => c.kind === "RISK_DEDUCTION")?.numeraireMinorUnits).toBe("0");
    expect(evaluation.components.find((c) => c.kind === "TIME_COST")?.numeraireMinorUnits).toBe("-120");
  });

  it("a better worst case wins exactly by its net (the scored number)", () => {
    const better = evaluateNetOutcome({
      candidate: { candidateId: "q2", quote: scoringQuote({ worstCaseOutputMinor: "3300000" }) },
      policy,
    });
    const base = evaluateNetOutcome({ candidate: { candidateId: "q1", quote: scoringQuote() }, policy });
    expect(compareNetOutcomes(better, base)).toBe(1);
    expect(BigInt(better.netNumeraireMinorUnits) - BigInt(base.netNumeraireMinorUnits)).toBe(100000n);
  });

  it("NO HIDDEN CONSTANTS: time cost changes by exactly the policy delta", () => {
    const base = evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote() }, policy });
    const slower = evaluateNetOutcome({
      candidate: { candidateId: "q", quote: scoringQuote({ estimatedSettlementMs: 130_000 }) },
      policy,
    });
    expect(BigInt(base.netNumeraireMinorUnits) - BigInt(slower.netNumeraireMinorUnits)).toBe(10n);
  });

  it("NO HIDDEN CONSTANTS: the risk deduction changes by exactly the declared delta", () => {
    const moderate = evaluateNetOutcome({
      candidate: { candidateId: "q", quote: scoringQuote({ riskClass: "MODERATE" }) },
      policy,
    });
    const low = evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote({ riskClass: "LOW" }) }, policy });
    expect(BigInt(low.netNumeraireMinorUnits) - BigInt(moderate.netNumeraireMinorUnits)).toBe(100000n);
  });

  it("a missing conversion rule fails closed (the valuation never guesses a rate)", () => {
    const stripped = validateBestExecutionPolicy({
      ...baseBestExecutionPolicy(),
      conversions: [baseBestExecutionPolicy().conversions[1] as never],
    });
    expect(() =>
      evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote() }, policy: stripped }),
    ).toThrowError(/no explicit conversion rule/);
  });

  it("INV-C08 BASELINE INDIFFERENCE: the scoring input carries no execution mode, origin or baseline flag", () => {
    const native = evaluateNetOutcome({
      candidate: { candidateId: "q", quote: scoringQuote({ optimizationOrigin: "PROVIDER_NATIVE" }) },
      policy,
    });
    const composed = evaluateNetOutcome({
      candidate: { candidateId: "q", quote: scoringQuote({ optimizationOrigin: "COMPOSED" }) },
      policy,
    });
    expect(native.netNumeraireMinorUnits).toBe(composed.netNumeraireMinorUnits);
    expect(JSON.stringify(Object.keys(native))).toBe(JSON.stringify(Object.keys(composed)));
  });

  it("identical dimensions score identically regardless of venue id (no privileged venue)", () => {
    const alpha = evaluateNetOutcome({ candidate: { candidateId: "quote:fixture-dex:001", quote: scoringQuote() }, policy });
    const beta = evaluateNetOutcome({ candidate: { candidateId: "quote:fixture-dex:beta-001", quote: secondVenueQuote() }, policy });
    expect(alpha.netNumeraireMinorUnits).toBe(beta.netNumeraireMinorUnits);
    expect(() => compareNetOutcomes(alpha, beta)).not.toThrow();
  });

  it("the component trace is total over the valued-component vocabulary (signed, evidenced)", () => {
    const evaluation = evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote() }, policy });
    const kinds = evaluation.components.map((component) => component.kind);
    for (const kind of ["OUTPUT", "FEE", "GAS", "RISK_DEDUCTION", "TIME_COST"]) {
      expect(kinds).toContain(kind);
    }
    for (const component of evaluation.components) {
      if (component.kind === "OUTPUT") {
        expect(BigInt(component.numeraireMinorUnits)).toBeGreaterThan(0n);
      } else {
        expect(BigInt(component.numeraireMinorUnits)).toBeLessThanOrEqual(0n);
      }
    }
    expect(Object.isFrozen(evaluation)).toBe(true);
  });

  it("deterministic: the same candidate at the same policy replays byte-identically (folded with the venue-fee law)", () => {
    const first = evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote() }, policy });
    const second = evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote() }, policy });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const fee = first.components.find((component) => component.kind === "FEE");
    expect(fee?.numeraireMinorUnits).toBe("-900000");
    expect(fee?.sourceAmount?.minorUnits).toBe("300000000000000");
  });

  it("a missing risk class in the deduction table is a hard error (no default deduction)", () => {
    const stripped = validateBestExecutionPolicy({
      ...baseBestExecutionPolicy(),
      failureRiskDeductions: { LOW: "0", MODERATE: "0", ELEVATED: "0", HIGH: "0" },
    });
    void stripped;
    expect(() =>
      evaluateNetOutcome({
        candidate: { candidateId: "q", quote: scoringQuote({ riskClass: "ELEVATED" }) },
        policy,
      }),
    ).not.toThrow();
    expect(
      evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote({ riskClass: "ELEVATED" }) }, policy })
        .components.find((c) => c.kind === "RISK_DEDUCTION")?.numeraireMinorUnits,
    ).toBe("-1000000");
  });

  it("gas converts through (nativePrice x feeAssetRate) floored once", () => {
    const evaluation = evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote() }, policy });
    const gas = evaluation.components.find((component) => component.kind === "GAS");
    expect(gas?.gasUnits).toBe("160000");
    expect(gas?.numeraireMinorUnits).toBe("0");
  });

  it("venue-level ranking needs no quote identity beyond the dimensions (comparator parity)", () => {
    const left = evaluateNetOutcome({ candidate: { candidateId: "a", quote: scoringQuote() }, policy });
    const right = evaluateNetOutcome({
      candidate: { candidateId: "b", quote: scoringQuote({ worstCaseOutputMinor: "3100000" }) },
      policy,
    });
    expect(compareNetOutcomes(left, right)).toBe(1);
  });

});

describe("NET-NEW scoring-order laws (plan level)", () => {
  const policy = validateBestExecutionPolicy(baseBestExecutionPolicy());
  const walletToWallet: CustodyTransfer = {
    from: { kind: "ONCHAIN_WALLET", accountRef: "a" },
    to: { kind: "ONCHAIN_WALLET", accountRef: "a" },
    assetRef: "X",
    amount: { currency: "X", minorUnits: "1" },
    evidenceRefs: ["e"],
  };
  const walletToBank: CustodyTransfer = {
    from: { kind: "ONCHAIN_WALLET", accountRef: "a" },
    to: { kind: "EXTERNAL_BANK_INSTRUMENT", externalRef: "b" },
    assetRef: "X",
    amount: { currency: "X", minorUnits: "1" },
    evidenceRefs: ["e"],
  };

  it("the tie is broken by the declared order, NOT by insertion order (determinism)", () => {
    const alpha = {
      planId: "route-plan:i:aaa",
      evaluation: evaluateNetOutcome({ candidate: { candidateId: "a", quote: scoringQuote() }, policy }),
      custodies: [walletToWallet],
      riskClass: "LOW" as const,
      estimatedSettlementMs: 120_000,
      hopCount: 1,
    };
    const beta = {
      planId: "route-plan:i:zzz",
      evaluation: evaluateNetOutcome({ candidate: { candidateId: "b", quote: secondVenueQuote() }, policy }),
      custodies: [walletToWallet],
      riskClass: "LOW" as const,
      estimatedSettlementMs: 120_000,
      hopCount: 1,
    };
    const ranked = rankScoredPlans([beta, alpha], policy);
    expect(ranked[0]?.planId).toBe("route-plan:i:aaa");
    expect(ranked[1]?.planId).toBe("route-plan:i:zzz");
  });

  it("the DISCRIMINATING PAIR: planId order OPPOSES the crossing order (crossings are consulted BEFORE the total order)", () => {
    // plan 'aaa' crosses ONE rail (wallet -> bank); plan 'zzz' crosses
    // NONE — the planId order (aaa < zzz) OPPOSES the crossing order.
    const crossing = {
      planId: "route-plan:i:aaa",
      evaluation: evaluateNetOutcome({ candidate: { candidateId: "a", quote: scoringQuote() }, policy }),
      custodies: [walletToBank],
      riskClass: "LOW" as const,
      estimatedSettlementMs: 120_000,
      hopCount: 1,
    };
    const direct = {
      planId: "route-plan:i:zzz",
      evaluation: evaluateNetOutcome({ candidate: { candidateId: "b", quote: secondVenueQuote() }, policy }),
      custodies: [walletToWallet],
      riskClass: "LOW" as const,
      estimatedSettlementMs: 120_000,
      hopCount: 1,
    };
    expect(railCrossingCount(crossing.custodies)).toBe(1);
    expect(railCrossingCount(direct.custodies)).toBe(0);
    const ranked = rankScoredPlans([crossing, direct], {
      ...policy,
      tieBreakers: ["FEWER_RAIL_CROSSINGS", "PLAN_ID"],
    });
    expect(ranked[0]?.planId).toBe("route-plan:i:zzz");
  });
});
