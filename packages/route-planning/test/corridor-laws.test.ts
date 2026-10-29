import { describe, expect, it } from "vitest";
import { CorridorPlanLawError, corridorHopCount, corridorPlanLegLaws } from "../src/index.ts";
import type { PinnedRoutePlan } from "../src/index.ts";
import {
  PINNED_CORRIDOR_DIRECTION_CLASSES,
  PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD,
  PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD,
  PINNED_CORRIDOR_LEG_OUTCOMES,
  PINNED_CORRIDOR_LEG_SKELETON,
  PINNED_CORRIDOR_RELAY_RAIL,
  PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
  PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS,
  PINNED_MISSION_DIRECTION_CLASSES,
  PINNED_STELLAR_CHAIN_KEY,
} from "../src/pins/corridor.ts";

/**
 * P22-C (ADR-0016 D5/D6): the CROSS-PROVIDER CORRIDOR plan-level laws,
 * part 1 — the pinned ADR-0016 appendix literals (the pin contract) + the
 * leg-separation model (each leg its OWN lane/hop/prerequisites). The
 * custody-continuity + hop-bound laws live in
 * corridor-laws-continuity.test.ts (the 400-line file-law split). These
 * are the pure plan-level LAWS the H lane's composite dispatch runtime
 * implements against — nothing here dispatches, authorizes or executes
 * (the advisory-plan law).
 */

// ---------------------------------------------------------------------------
// The corridor-plan fixture (a minimal honest cross-provider-corridor plan —
// the FLW GHS collect, the PSP issuance, the stellar:testnet onchain hop,
// the Paystack KES payout; the laws read only the fields they govern).
// ---------------------------------------------------------------------------

const CORRIDOR_LEG_METADATA = [
  {
    legKind: "FIAT_PSP_COLLECT",
    from: { kind: "EXTERNAL_PROVIDER", providerName: "flutterwave" },
    to: { kind: "EXTERNAL_PROVIDER", providerName: "flutterwave" },
    observationId: "obs:flw-collect-001",
  },
  {
    legKind: "PSP_STABLECOIN_ISSUANCE",
    from: { kind: "EXTERNAL_PROVIDER", providerName: "flutterwave" },
    to: { kind: "ONCHAIN_WALLET", chainKey: "stellar:testnet" },
    observationId: "obs:flw-issuance-001",
  },
  {
    legKind: "ONCHAIN_TRANSFER",
    from: { kind: "ONCHAIN_WALLET", chainKey: "stellar:testnet" },
    to: { kind: "EXTERNAL_PROVIDER", providerName: "paystack" },
    observationId: "obs:stellar-transfer-001",
  },
  {
    legKind: "OFF_RAMP_PAYOUT",
    from: { kind: "EXTERNAL_PROVIDER", providerName: "paystack" },
    to: { kind: "BANK_INSTRUMENT", externalRef: "bank:kes:beneficiary-001" },
    observationId: "obs:paystack-payout-001",
  },
] as const;

function corridorLeg(index: number, overrides?: Record<string, unknown>) {
  const meta = CORRIDOR_LEG_METADATA[index]!;
  return {
    legId: `corridor-leg-${String(index)}`,
    legKind: meta.legKind,
    hopIndex: index,
    intentRef: "intent:corridor:001",
    custody: {
      from: { ...meta.from },
      to: { ...meta.to },
      assetRef: "asset:corridor:usdc",
      amount: { currency: "USDC", minorUnits: "1250000000" },
      evidenceRefs: [],
    },
    plannedAmount: { basis: "CONVERSION" },
    stateGrounding: {
      groundingFailures: [],
      observations: [
        { observationId: meta.observationId, observationVersion: 1 },
      ],
    },
    assumptions: [],
    evidenceRefs: [],
    ...overrides,
  };
}

function corridorPlan(overrides?: {
  shapeId?: string;
  legs?: readonly unknown[];
}): PinnedRoutePlan {
  return {
    planId: "plan:corridor:001",
    shapeId: overrides?.shapeId ?? PINNED_CROSS_PROVIDER_CORRIDOR_SHAPE_ID,
    intentRef: "intent:corridor:001",
    compositionClass: "COMPOSED",
    executionMode: "COMPOSED_PAYSWAP",
    isProviderNativeBaseline: false,
    candidateStatus: "EXECUTABLE_CANDIDATE",
    comparability: { comparable: true },
    ineligibilityReasons: [],
    legs: overrides?.legs ?? [0, 1, 2, 3].map((index) => corridorLeg(index)),
    evidenceRefs: [],
    planDigest: "fnv1a64:00000000c0ffee01",
    railCrossings: {
      crossings: 2,
      legs: [
        { hopIndex: 1, fromFamily: "PROVIDER", toFamily: "ONCHAIN", crosses: true },
        { hopIndex: 2, fromFamily: "ONCHAIN", toFamily: "PROVIDER", crosses: true },
      ],
    },
    environmentClasses: ["SANDBOX", "TESTNET"],
  } as PinnedRoutePlan;
}

// ---------------------------------------------------------------------------
// The pinned literals (the ADR-0016 appendix pin contract)
// ---------------------------------------------------------------------------

describe("the pinned corridor literals (ADR-0016 appendix — the pin contract)", () => {
  it("the leg skeleton is frozen and byte-exact (the four-leg law)", () => {
    expect(Object.isFrozen(PINNED_CORRIDOR_LEG_SKELETON)).toBe(true);
    expect([...PINNED_CORRIDOR_LEG_SKELETON]).toEqual([
      "FIAT_PSP_COLLECT",
      "PSP_STABLECOIN_ISSUANCE",
      "ONCHAIN_TRANSFER",
      "OFF_RAMP_PAYOUT",
    ]);
    expect(corridorHopCount()).toBe(4);
  });

  it("the relay rail: ONCHAIN kind, the chain key IS the rail key (ADR-0008 D5 preserved)", () => {
    expect(PINNED_CORRIDOR_RELAY_RAIL).toEqual({ railKind: "ONCHAIN", railKey: "stellar:testnet" });
    expect(PINNED_STELLAR_CHAIN_KEY).toBe("stellar:testnet");
  });

  it("the funding/payout method pins (named once, never invented twice)", () => {
    expect(PINNED_CORRIDOR_GHS_ONRAMP_FUNDING_METHOD).toBe("flutterwave_ghs_mobile_money");
    expect(PINNED_CORRIDOR_KES_OFFRAMP_PAYOUT_METHOD).toBe("paystack_kes_bank_transfer");
  });

  it("the direction classes: MOVE/CONVERT ride the corridor; the vocabulary mirrors the host ask loop", () => {
    expect([...PINNED_MISSION_DIRECTION_CLASSES]).toEqual(["PAY", "RECEIVE", "MOVE", "CONVERT"]);
    expect([...PINNED_CORRIDOR_DIRECTION_CLASSES]).toEqual(["MOVE", "CONVERT"]);
    expect(PINNED_DIRECT_PAYMENT_MAX_ROUTE_HOPS).toBe(1);
  });

  it("the leg-outcome vocabulary is frozen and closed (the custody-continuity terms)", () => {
    expect(Object.isFrozen(PINNED_CORRIDOR_LEG_OUTCOMES)).toBe(true);
    expect([...PINNED_CORRIDOR_LEG_OUTCOMES]).toEqual(["CONFIRMED", "UNKNOWN", "FAILED"]);
  });
});

// ---------------------------------------------------------------------------
// The leg-separation derivation (D6)
// ---------------------------------------------------------------------------

describe("the leg-separation derivation (ADR-0016 D6 — each leg its OWN lane/hop/prerequisites)", () => {
  it("derives four leg laws: the on-ramp lanes, the ONCHAIN_CHAIN middle, the off-ramp lane", () => {
    const laws = corridorPlanLegLaws(corridorPlan());
    expect(laws).toHaveLength(4);
    // Leg 0 + 1: the FLW fiat lanes.
    expect(laws[0]!.lane).toEqual({ kind: "PROVIDER", id: "flutterwave" });
    expect(laws[1]!.lane).toEqual({ kind: "PROVIDER", id: "flutterwave" });
    // Leg 2: the corridor CHAIN lane (the from-wallet's chain key).
    expect(laws[2]!.lane).toEqual({ kind: "ONCHAIN_CHAIN", id: "stellar:testnet" });
    // Leg 3: the Paystack payout lane.
    expect(laws[3]!.lane).toEqual({ kind: "PROVIDER", id: "paystack" });
    // Every leg carries its OWN custody hop + its OWN prerequisites.
    for (const [index, law] of laws.entries()) {
      expect(law.legIndex).toBe(index);
      expect(law.legKind).toBe(PINNED_CORRIDOR_LEG_SKELETON[index]);
      expect(law.custodyHop.from.kind).toBeTruthy();
      expect(law.custodyHop.to.kind).toBeTruthy();
      expect(law.prerequisites).toHaveLength(1);
      expect(law.prerequisites[0]).toEqual({
        kind: "GROUNDING_OBSERVATION",
        observationRef: CORRIDOR_LEG_METADATA[index]!.observationId,
        observationVersion: 1,
      });
    }
  });

  it("a foreign shape never projects (typed CorridorPlanLawError — never a lenient projection)", () => {
    const foreign = corridorPlan({ shapeId: "mixed-dex-offramp" });
    expect(() => corridorPlanLegLaws(foreign)).toThrow(CorridorPlanLawError);
    expect(() => corridorPlanLegLaws(foreign)).toThrow(
      /only from the 'cross-provider-corridor' shape/,
    );
  });

  it("a plan without exactly four legs is refused (the skeleton is the whole law)", () => {
    const threeLegs = [0, 1, 2].map((index) => corridorLeg(index));
    expect(() => corridorPlanLegLaws(corridorPlan({ legs: threeLegs }))).toThrow(
      /carries exactly 4 legs/,
    );
  });

  it("a leg kind off the pinned skeleton is refused (the exact skeleton law)", () => {
    const swapped = [0, 1, 2, 3].map((index) => corridorLeg(index));
    swapped[1] = corridorLeg(1, { legKind: "ONCHAIN_TRANSFER" });
    expect(() => corridorPlanLegLaws(corridorPlan({ legs: swapped }))).toThrow(
      /leg 1 must be 'PSP_STABLECOIN_ISSUANCE'/,
    );
  });

  it("a reordered hopIndex is refused (legs never silently skip or reorder)", () => {
    const reordered = [0, 1, 2, 3].map((index) => corridorLeg(index));
    reordered[2] = corridorLeg(2, { hopIndex: 3 });
    expect(() => corridorPlanLegLaws(corridorPlan({ legs: reordered }))).toThrow(
      /must carry hopIndex 2/,
    );
  });

  it("a leg with NO grounding observations is a fabricated leg (the prerequisites law)", () => {
    const fabricated = [0, 1, 2, 3].map((index) => corridorLeg(index));
    fabricated[3] = corridorLeg(3, { stateGrounding: { groundingFailures: [], observations: [] } });
    expect(() => corridorPlanLegLaws(corridorPlan({ legs: fabricated }))).toThrow(
      /NO grounding observations/,
    );
  });

  it("a malformed grounding observation is refused (prerequisites are exact evidence)", () => {
    const malformed = [0, 1, 2, 3].map((index) => corridorLeg(index));
    malformed[0] = corridorLeg(0, {
      stateGrounding: {
        groundingFailures: [],
        observations: [{ observationId: "obs:flw-collect-001" }],
      },
    });
    expect(() => corridorPlanLegLaws(corridorPlan({ legs: malformed }))).toThrow(
      /malformed grounding observation/,
    );
  });

  it("the ONCHAIN_TRANSFER leg must leave an ONCHAIN_WALLET (the chain hop is onchain-plane-grounded)", () => {
    const wrongFrom = [0, 1, 2, 3].map((index) => corridorLeg(index));
    wrongFrom[2] = corridorLeg(2, {
      custody: {
        from: { kind: "EXTERNAL_PROVIDER", providerName: "flutterwave" },
        to: { kind: "EXTERNAL_PROVIDER", providerName: "paystack" },
        assetRef: "asset:corridor:usdc",
        amount: { currency: "USDC", minorUnits: "1250000000" },
        evidenceRefs: [],
      },
    });
    expect(() => corridorPlanLegLaws(corridorPlan({ legs: wrongFrom }))).toThrow(
      /ONCHAIN_TRANSFER leg must leave an ONCHAIN_WALLET/,
    );
  });

  it("a fiat leg must leave an EXTERNAL_PROVIDER party (the fiat legs ride their provider's lane)", () => {
    const wrongFrom = [0, 1, 2, 3].map((index) => corridorLeg(index));
    wrongFrom[0] = corridorLeg(0, {
      custody: {
        from: { kind: "ONCHAIN_WALLET", chainKey: "stellar:testnet" },
        to: { kind: "EXTERNAL_PROVIDER", providerName: "flutterwave" },
        assetRef: "asset:corridor:ghs",
        amount: { currency: "GHS", minorUnits: "100000" },
        evidenceRefs: [],
      },
    });
    expect(() => corridorPlanLegLaws(corridorPlan({ legs: wrongFrom }))).toThrow(
      /FIAT_PSP_COLLECT leg must leave an EXTERNAL_PROVIDER/,
    );
  });
});

// ---------------------------------------------------------------------------
// The custody-continuity law (D6 — the chain stops honestly)
// ---------------------------------------------------------------------------
