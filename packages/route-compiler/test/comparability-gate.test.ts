import { describe, expect, it } from "vitest";
import {
  evaluateComparabilityGate,
  verdictGapCodes,
  COMPARABILITY_REQUIREMENTS,
  COMPARABILITY_GAP_CODES,
} from "../src/comparability-gate.ts";
import { compileBase, planOf, baseCompilerInput } from "./compiler-fixtures.ts";
import { route1Intent, route2Intent, route3Intent, route4Intent, NOW, USC_ASSET, MERCHANT_ACCOUNT_REF, PSP_PROVIDER, MERCHANT_PROVIDER } from "./fixtures.ts";
import { merchantEligibilityEvidence, failingPayoutGateReport, payoutConstraintFixture } from "./merchant-fixtures.ts";
import { blockAllGate, baseSecurity } from "./venue-fixtures.ts";

/**
 * THE COMPARABILITY GATE (NET-NEW, the P5-W1 five-requirement law):
 * composed/multi-provider routes are comparable ONLY when each leg has
 * current eligibility, credible pricing, actual connection/permission,
 * funding/payout constraints and auditable assumptions; the
 * provider-native baseline is exempt (INV-C08 — it IS the baseline).
 */
function gateInputOf(result: ReturnType<typeof compileBase>, shapeId: string) {
  const plan = planOf(result, shapeId);
  return { legs: plan.legs, isProviderNativeBaseline: plan.isProviderNativeBaseline, at: NOW };
}

describe("the five-requirement law (the P5-W1 work order, encoded)", () => {
  it("the requirement vocabulary is exactly the work order's five, frozen", () => {
    expect([...COMPARABILITY_REQUIREMENTS]).toEqual([
      "CURRENT_ELIGIBILITY",
      "CREDIBLE_PRICING",
      "CONNECTION_PERMISSION",
      "FUNDING_PAYOUT_CONSTRAINTS",
      "AUDITABLE_ASSUMPTIONS",
    ]);
    expect(Object.isFrozen(COMPARABILITY_REQUIREMENTS)).toBe(true);
  });

  it("the gap-code vocabulary is closed and frozen (F-1: gapCodes wrapped in verdicts)", () => {
    expect(COMPARABILITY_GAP_CODES.length).toBe(13);
    expect(Object.isFrozen(COMPARABILITY_GAP_CODES)).toBe(true);
    for (const code of COMPARABILITY_GAP_CODES) {
      expect(code).toMatch(/^[A-Z_]+$/);
    }
  });

  it("a fully-grounded composed plan is comparable (all five requirements met)", () => {
    const result = compileBase(route1Intent());
    const verdict = evaluateComparabilityGate(gateInputOf(result, "mixed-dex-offramp"));
    expect(verdict.comparable).toBe(true);
    expect(verdictGapCodes(verdict)).toEqual([]);
  });

  it("the provider-native baseline is exempt (INV-C08: the gate compares composed routes AGAINST it)", () => {
    const result = compileBase(route1Intent());
    const baseline = planOf(result, "provider-native-offramp");
    expect(baseline.isProviderNativeBaseline).toBe(true);
    const verdict = evaluateComparabilityGate({
      legs: baseline.legs,
      isProviderNativeBaseline: true,
      at: NOW,
    });
    expect(verdict.comparable).toBe(true);
  });

  it("ELIGIBILITY gaps: a leg without grounding observations is a gap (catalogue claims never ground)", () => {
    const result = compileBase(route1Intent());
    const plan = planOf(result, "mixed-dex-offramp");
    const stripped = plan.legs.map((leg) => ({
      ...leg,
      stateGrounding: { observations: [], groundingFailures: [] },
    }));
    const verdict = evaluateComparabilityGate({ legs: stripped as unknown as Parameters<typeof evaluateComparabilityGate>[0]["legs"], isProviderNativeBaseline: false, at: NOW });
    expect(verdict.comparable).toBe(false);
    if (!verdict.comparable) {
      expect(verdict.gaps.filter((gap) => gap.requirement === "CURRENT_ELIGIBILITY").length).toBe(4);
      expect(verdict.gaps.every((gap) => gap.code === "ELIGIBILITY_MISSING")).toBe(true);
    }
  });

  it("ELIGIBILITY stale: every grounding observation stale is a gap", () => {
    const result = compileBase(route1Intent());
    const plan = planOf(result, "mixed-dex-offramp");
    const staled = plan.legs.map((leg) => ({
      ...leg,
      stateGrounding: {
        observations: leg.stateGrounding.observations.map((observation) => ({ ...observation, fresh: false })),
        groundingFailures: [],
      },
    }));
    const verdict = evaluateComparabilityGate({ legs: staled as unknown as Parameters<typeof evaluateComparabilityGate>[0]["legs"], isProviderNativeBaseline: false, at: NOW });
    expect(verdictGapCodes(verdict)).toContain("ELIGIBILITY_STALE");
  });

  it("PRICING gaps: an UNKNOWN planned amount (non-bridge) is ungrounded pricing", () => {
    const result = compileBase(route2Intent());
    const plan = planOf(result, "mixed-psp-onramp");
    const unpriced = plan.legs.map((leg) => ({
      ...leg,
      plannedAmount: { basis: "UNKNOWN", reason: "a fixture ungrounded amount" },
    }));
    const verdict = evaluateComparabilityGate({ legs: unpriced as unknown as Parameters<typeof evaluateComparabilityGate>[0]["legs"], isProviderNativeBaseline: false, at: NOW });
    expect(verdictGapCodes(verdict)).toContain("PRICING_UNGROUNDED");
  });

  it("PRICING (the honest-arrival law): a bridge leg's UNKNOWN arrival is NOT a pricing gap (the deposit is grounded upstream)", () => {
    const result = compileBase(route3Intent());
    const plan = planOf(result, "mixed-dex-bridge");
    const bridge = plan.legs.find((leg) => leg.legKind === "ONCHAIN_BRIDGE");
    expect(bridge?.plannedAmount.basis).toBe("UNKNOWN");
    const verdict = evaluateComparabilityGate({ legs: plan.legs, isProviderNativeBaseline: false, at: NOW });
    expect(verdictGapCodes(verdict)).not.toContain("PRICING_UNGROUNDED");
  });

  it("PRICING (swap law): a swap leg must be QUOTE_GROUNDED (indicative or intent-declared pricing is not credible)", () => {
    const result = compileBase(route1Intent());
    const plan = planOf(result, "mixed-dex-offramp");
    const swaps = plan.legs.map((leg) =>
      leg.legKind === "ONCHAIN_DEX_SWAP"
        ? { ...leg, plannedAmount: { basis: "INTENT_DECLARED", amount: leg.custody.amount } }
        : leg,
    );
    const verdict = evaluateComparabilityGate({ legs: swaps as unknown as Parameters<typeof evaluateComparabilityGate>[0]["legs"], isProviderNativeBaseline: false, at: NOW });
    expect(verdictGapCodes(verdict)).toContain("PRICING_INDICATIVE");
  });

  it("CONNECTION gaps: a BLOCKed gate decision is a permission gap (rule 27)", () => {
    const input = baseCompilerInput(route1Intent(), {
      venues: [],
    });
    void input;
    const result = compileBase(route1Intent());
    const plan = planOf(result, "mixed-dex-offramp");
    const blocked = plan.legs.map((leg) => ({
      ...leg,
      authorizationLineage: {
        ...leg.authorizationLineage,
        legAuthorization:
          leg.authorizationLineage.legAuthorization.kind === "ONCHAIN_GATE_DECISION"
            ? {
                ...leg.authorizationLineage.legAuthorization,
                gateDecision: {
                  decision: "BLOCK",
                  reasons: [{ code: "fixture_block", message: "the fixture gate blocks" }],
                  evidenceRefs: ["fixture:block"],
                },
              }
            : leg.authorizationLineage.legAuthorization,
      },
    }));
    const verdict = evaluateComparabilityGate({ legs: blocked as unknown as Parameters<typeof evaluateComparabilityGate>[0]["legs"], isProviderNativeBaseline: false, at: NOW });
    expect(verdictGapCodes(verdict)).toContain("PERMISSION_MISSING");
  });

  it("FUNDING/PAYOUT gaps: a closed payout gate is a constraint gap AND a permission gap (connection scope never passes)", () => {
    const result = compileBase(route1Intent());
    const plan = planOf(result, "mixed-dex-offramp");
    const closedGate = plan.legs.map((leg) => ({
      ...leg,
      authorizationLineage: {
        ...leg.authorizationLineage,
        legAuthorization:
          leg.authorizationLineage.legAuthorization.kind === "PAYOUT_TRANSFER_OUT_GRANT"
            ? { ...leg.authorizationLineage.legAuthorization, gate: failingPayoutGateReport() }
            : leg.authorizationLineage.legAuthorization,
      },
    }));
    const verdict = evaluateComparabilityGate({ legs: closedGate as unknown as Parameters<typeof evaluateComparabilityGate>[0]["legs"], isProviderNativeBaseline: false, at: NOW });
    const codes = verdictGapCodes(verdict);
    expect(codes).toContain("PAYOUT_GATE_CLOSED");
    expect(codes).toContain("PERMISSION_MISSING");
  });

  it("ASSUMPTION gaps: a leg without assumptions is unauditable; expired assumptions are honest gaps", () => {
    const result = compileBase(route1Intent());
    const plan = planOf(result, "mixed-dex-offramp");
    const bare = plan.legs.map((leg) => ({ ...leg, assumptions: [] }));
    expect(
      verdictGapCodes(evaluateComparabilityGate({ legs: bare as unknown as Parameters<typeof evaluateComparabilityGate>[0]["legs"], isProviderNativeBaseline: false, at: NOW })),
    ).toContain("ASSUMPTIONS_MISSING");
    const expired = plan.legs.map((leg) => ({
      ...leg,
      assumptions: leg.assumptions.map((assumption) => ({
        ...assumption,
        assumedValidUntil: "2026-10-03T00:00:00Z",
      })),
    }));
    expect(
      verdictGapCodes(
        evaluateComparabilityGate({ legs: expired as unknown as Parameters<typeof evaluateComparabilityGate>[0]["legs"], isProviderNativeBaseline: false, at: NOW + 1000 }),
      ),
    ).toContain("ASSUMPTIONS_EXPIRED");
  });
});

describe("the gate verdict-wrap (F-1: gapCodes are wrapped in the verdict, never bare lists)", () => {
  it("the gate never throws on composed plans (verdicts, not exceptions — the every-reason law)", () => {
    const result = compileBase(route4Intent());
    const plan = planOf(result, "merchant-external-payswap-route");
    expect(() => evaluateComparabilityGate({ legs: plan.legs, isProviderNativeBaseline: false, at: NOW })).not.toThrow();
    const bareResult = compileBase(route2Intent());
    const barePlan = planOf(bareResult, "mixed-psp-onramp");
    const bare = barePlan.legs.map((leg) => ({ ...leg, assumptions: [] }));
    const verdict = evaluateComparabilityGate({ legs: bare as unknown as Parameters<typeof evaluateComparabilityGate>[0]["legs"], isProviderNativeBaseline: false, at: NOW });
    if (verdict.comparable) {
      throw new Error("the bare-assumption plan must not be comparable");
    }
    for (const gap of verdict.gaps) {
      expect(gap.legId).toMatch(/^route-plan:/);
      expect(COMPARABILITY_REQUIREMENTS).toContain(gap.requirement);
      expect(COMPARABILITY_GAP_CODES).toContain(gap.code);
      expect(gap.detail.length).toBeGreaterThan(10);
    }
  });
});
