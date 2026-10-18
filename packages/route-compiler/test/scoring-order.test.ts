import { describe, expect, it } from "vitest";
import { rankCandidates, rankScoredPlans } from "../src/scoring-order.ts";
import { evaluateNetOutcome } from "../src/scoring.ts";
import { validateBestExecutionPolicy } from "../src/policy.ts";
import { ValidationError } from "../src/errors.ts";
import { baseBestExecutionPolicy } from "./venue-fixtures.ts";
import { scoringQuote, secondVenueQuote } from "./walk-fixtures.ts";
import { tieMateQuote, lowerRiskQuote, fasterQuote } from "./scoring-fixtures.ts";
import { railCrossingCount } from "../src/rail-family.ts";
import type { CustodyTransfer } from "../src/custody.ts";

/**
 * NET-NEW scoring-order laws (8): the tie-break order, the INV-C08
 * indifference, the discriminating pair whose planId order OPPOSES the
 * crossing order, and the railCrossingCount WITHIN-leg unit law.
 */
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
const bankToWallet: CustodyTransfer = {
  from: { kind: "EXTERNAL_BANK_INSTRUMENT", externalRef: "b" },
  to: { kind: "ONCHAIN_WALLET", accountRef: "a" },
  assetRef: "X",
  amount: { currency: "X", minorUnits: "1" },
  evidenceRefs: ["e"],
};
const walletToProvider: CustodyTransfer = {
  from: { kind: "ONCHAIN_WALLET", accountRef: "a" },
  to: { kind: "EXTERNAL_PROVIDER", providerName: "p" },
  assetRef: "X",
  amount: { currency: "X", minorUnits: "1" },
  evidenceRefs: ["e"],
};
const providerToProvider: CustodyTransfer = {
  from: { kind: "EXTERNAL_PROVIDER", providerName: "p" },
  to: { kind: "EXTERNAL_PROVIDER", providerName: "p" },
  assetRef: "X",
  amount: { currency: "X", minorUnits: "1" },
  evidenceRefs: ["e"],
};

describe("railCrossingCount (the WITHIN-leg law, F-2)", () => {
  it("the unit law: wallet->provider(1), bank->wallet(1), wallet->wallet(0), provider->provider(0), wallet->bank(1)", () => {
    expect(railCrossingCount([walletToProvider])).toBe(1);
    expect(railCrossingCount([bankToWallet])).toBe(1);
    expect(railCrossingCount([walletToWallet])).toBe(0);
    expect(railCrossingCount([providerToProvider])).toBe(0);
    expect(railCrossingCount([walletToBank])).toBe(1);
  });

  it("BETWEEN-leg family changes are structurally dead (continuity makes consecutive legs family-identical)", () => {
    // A continuous chain: wallet -> wallet -> provider -> provider. The
    // BETWEEN-leg pairs (wallet|wallet, provider|provider) never differ
    // in family — the WITHIN-leg count is the live signal.
    const continuous = [walletToWallet, walletToProvider, providerToProvider];
    expect(railCrossingCount(continuous)).toBe(1);
    expect(railCrossingCount(continuous.reverse())).toBe(1);
  });
});

describe("the scoring order (net descending, then the declared tie-breakers)", () => {
  it("venue level: the net decides; exact ties break by the declared order ending in VENUE_ID", () => {
    const better = evaluateNetOutcome({ candidate: { candidateId: "better", quote: scoringQuote({ worstCaseOutputMinor: "3300000" }) }, policy });
    const worse = evaluateNetOutcome({ candidate: { candidateId: "worse", quote: scoringQuote() }, policy });
    const ranked = rankCandidates(
      [
        { candidate: { candidateId: "worse", quote: scoringQuote() }, evaluation: worse },
        { candidate: { candidateId: "better", quote: scoringQuote({ worstCaseOutputMinor: "3300000" }) }, evaluation: better },
      ],
      policy,
    );
    expect(ranked[0]?.candidate.candidateId).toBe("better");
    const tied = rankCandidates(
      [
        { candidate: { candidateId: "a", quote: tieMateQuote("q-a") }, evaluation: worse },
        { candidate: { candidateId: "b", quote: tieMateQuote("q-b") }, evaluation: worse },
      ],
      policy,
    );
    expect(tied.map((item) => item.candidate.candidateId)).toEqual(["a", "b"]);
  });

  it("plan level: the DISCRIMINATING PAIR — planId order OPPOSES the crossing order (crossings consulted BEFORE the total order)", () => {
    const evaluation = evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote() }, policy });
    const crossing = {
      planId: "route-plan:i:aaa",
      evaluation,
      custodies: [walletToBank],
      riskClass: "LOW" as const,
      estimatedSettlementMs: 120_000,
      hopCount: 1,
    };
    const direct = {
      planId: "route-plan:i:zzz",
      evaluation,
      custodies: [walletToWallet],
      riskClass: "LOW" as const,
      estimatedSettlementMs: 120_000,
      hopCount: 1,
    };
    const ranked = rankScoredPlans([crossing, direct], { ...policy, tieBreakers: ["FEWER_RAIL_CROSSINGS", "PLAN_ID"] });
    expect(ranked[0]?.planId).toBe("route-plan:i:zzz");
    expect(ranked[1]?.planId).toBe("route-plan:i:aaa");
  });

  it("plan level: LOWER_RISK_CLASS and FASTER_SETTLEMENT follow the declared order (before the total order)", () => {
    const evaluation = evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote() }, policy });
    const risky = {
      planId: "route-plan:i:a",
      evaluation,
      custodies: [walletToWallet],
      riskClass: "MODERATE" as const,
      estimatedSettlementMs: 120_000,
      hopCount: 1,
    };
    const safer = {
      planId: "route-plan:i:z",
      evaluation,
      custodies: [walletToWallet],
      riskClass: "LOW" as const,
      estimatedSettlementMs: 130_000,
      hopCount: 1,
    };
    const byRisk = rankScoredPlans([risky, safer], { ...policy, tieBreakers: ["LOWER_RISK_CLASS", "FASTER_SETTLEMENT", "PLAN_ID"] });
    expect(byRisk[0]?.planId).toBe("route-plan:i:z");
    const faster = {
      planId: "route-plan:i:z",
      evaluation,
      custodies: [walletToWallet],
      riskClass: "MODERATE" as const,
      estimatedSettlementMs: 100_000,
      hopCount: 1,
    };
    const byTime = rankScoredPlans([risky, faster], { ...policy, tieBreakers: ["FASTER_SETTLEMENT", "PLAN_ID"] });
    expect(byTime[0]?.planId).toBe("route-plan:i:z");
    void fasterQuote;
    void secondVenueQuote;
  });

  it("an unknown tie-breaker kind throws (the closed vocabulary)", () => {
    const evaluation = evaluateNetOutcome({ candidate: { candidateId: "q", quote: scoringQuote() }, policy });
    const plan = {
      planId: "route-plan:i:a",
      evaluation,
      custodies: [walletToWallet],
      riskClass: "LOW" as const,
      estimatedSettlementMs: 120_000,
      hopCount: 1,
    };
    expect(() =>
      rankScoredPlans([plan], { ...policy, tieBreakers: ["LOWER_RISK_CLASS", "PLAN_ID"] }),
    ).not.toThrow();
    expect(() =>
      rankScoredPlans([plan, plan], { ...policy, tieBreakers: ["LOWER_RISK_CLASS", "PLAN_ID"] }),
    ).not.toThrow();
    const malformed = { ...policy, tieBreakers: ["FASTER_SETTLEMENT", "VENUE_ID"] } as never;
    expect(() => rankScoredPlans([plan], malformed)).not.toThrow();
    const invalid = { ...policy, tieBreakers: ["MAGIC", "PLAN_ID"] } as never;
    expect(() => rankScoredPlans([plan, { ...plan, planId: "b" }], invalid)).toThrowError(ValidationError);
    void lowerRiskQuote;
  });
});
