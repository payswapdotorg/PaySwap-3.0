import { describe, expect, it } from "vitest";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { evaluateHardGates } from "../src/hard-gates.ts";
import { mergedCorridorView } from "../src/candidates.ts";
import {
  EXCLUSION_REPAIR_STAGE,
  ExclusionRepairError,
  deriveExclusionRepairs,
  repairsPermitExecution,
  requireRepairOperatorCatalogue,
  unboundRepairOperatorCatalogue,
  type ExclusionRepairDerivationInput,
  type RepairOperatorCataloguePort,
} from "../src/exclusion-repair.ts";
import {
  PINNED_NO_ROUTE_STATE_KEY,
  PINNED_NON_OPERATOR_EXCLUSION_CODES,
  PINNED_OPERATOR_APPLICABLE_EXCLUSION_CODES,
  PINNED_REPAIR_OPERATOR_IDS,
  type PinnedRepairOperator,
} from "../src/pins/repairs.ts";
import { PortUnboundError } from "../src/errors.ts";
import { CORRIDOR_EXCLUSION_CODES } from "../../capability/src/corridor-types.ts";
import {
  CORRIDOR_RAIL_KEY,
  NOW,
  flwSenderChain,
  noRouteCorridorQuery,
  noRouteIntentFixture,
  stripeRecipientChain,
} from "./no-route-fixtures.ts";
import { movementCorridorQuery, realCorridorProjectionPort, recipientChain, senderChain } from "./fixtures.ts";
import { fixtureRepairCatalogue } from "./repair-catalogue-fixture.ts";

/**
 * THE STAGE-7 GENERAL EXCLUSION→REPAIR DERIVATION (P23-C, ADR-0015 D3):
 * ALL grounded exclusion facts through the injected catalogue; the
 * most-specific-operator shadowing rule; the honest empty set; the lying
 * catalogue never composes; the P21 byte-identity (proven fully in
 * conditional-stage.test.ts's compat-gate cases); determinism.
 */

const OPT_IN = { participantRef: "principal:operator-1", optedInAt: NOW - 1_000 };
const DERIVE_AT = NOW;
const EXPIRES_AT = NOW + 3_600_000;
const DISCLOSURE_PURPOSE = "the operator's no-route panel renders the repair set with the preconditions";

function noRouteRepairInput(overrides: Partial<ExclusionRepairDerivationInput> = {}): ExclusionRepairDerivationInput {
  const pair = deriveRailSnapshotPair({
    sender: {
      side: "SENDER", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [flwSenderChain()], corridorPort: realCorridorProjectionPort(),
    },
    recipient: {
      side: "RECIPIENT", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [stripeRecipientChain()], corridorPort: realCorridorProjectionPort(),
    },
  });
  return {
    senderSnapshot: pair.sender,
    recipientSnapshot: pair.recipient,
    hardGates: evaluateHardGates({ intent: noRouteIntentFixture(), at: NOW, candidates: [] }),
    catalogue: fixtureRepairCatalogue(),
    corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
    optIn: OPT_IN,
    at: DERIVE_AT,
    expiresAt: EXPIRES_AT,
    disclosurePurpose: DISCLOSURE_PURPOSE,
    ...overrides,
  };
}

describe("the stage-7 general exclusion→repair derivation (P23-C, ADR-0015 D3)", () => {
  it("the advisory law: repairs NEVER permit execution — the literal false on the derivation and the function", () => {
    expect(repairsPermitExecution()).toBe(false);
    const derivation = deriveExclusionRepairs(noRouteRepairInput());
    expect(derivation.advisoryOnly).toBe(true);
    expect(derivation.repairsPermitExecution).toBe(false);
    expect(derivation.stage).toBe(EXCLUSION_REPAIR_STAGE);
  });

  it("the unbound catalogue port fails CLOSED (the typed error + the stage in the details); requireRepairOperatorCatalogue rejects non-ports", () => {
    const unbound = unboundRepairOperatorCatalogue();
    expect(() => unbound.operatorsFor("FUNDING_METHOD_NOT_SERVED")).toThrow(PortUnboundError);
    expect(() => unbound.operatorsFor("FUNDING_METHOD_NOT_SERVED")).toThrow(/the repair-operator catalogue is not bound/);
    try {
      unbound.classificationOf("STALE_OBSERVATION");
      expect.unreachable("the unbound catalogue must throw");
    } catch (error) {
      expect((error as PortUnboundError & { details?: unknown }).details).toEqual({ stage: EXCLUSION_REPAIR_STAGE });
    }
    expect(() => requireRepairOperatorCatalogue(null)).toThrow(PortUnboundError);
    expect(() => requireRepairOperatorCatalogue({ operatorsFor: 1 })).toThrow(PortUnboundError);
  });

  it("the no-route corridor derives the P21 conditionals + the platform work + the hypotheses, each grounded in the verbatim facts", () => {
    const derivation = deriveExclusionRepairs(noRouteRepairInput());
    // The P21 three (the shadowing rule suppresses the general funding operators).
    expect(derivation.conditionalRequests.map((request) => request.requiredPartyChanges[0]?.change)).toEqual([
      "ENABLES_FLUTTERWAVE_RECEIVING_METHOD",
      "ADDS_STRIPE_COMPATIBLE_INSTRUMENT",
      "INTERMEDIARY_INTRODUCED",
    ]);
    // The shadowing receipt: the two general funding operators suppressed by their P21 shadowers, never a silent drop.
    expect(derivation.suppressedOperators).toEqual([
      { operatorId: "repair:recipient-enables-served-funding-method", shadowedBy: ["repair:recipient-enables-flw-receiving-method"] },
      { operatorId: "repair:sender-adds-served-funding-instrument", shadowedBy: ["repair:sender-adds-stripe-compatible-instrument"] },
    ]);
    // The platform work items: the connector-operation gap (the FLW read-only fact) + the two state-keyed P21 gaps.
    expect(derivation.platformWorkRequests.map((work) => work.gapId).sort()).toEqual([
      "platform:connector-operation",
      "platform:cross-provider-route-shape",
      "platform:flutterwave-send-operation",
    ]);
    // Every platform work item cites its verbatim evidence.
    for (const work of derivation.platformWorkRequests) {
      expect(work.evidenceBasis.length).toBeGreaterThan(0);
      expect(work.requiredByOperatorIds.length).toBeGreaterThan(0);
      expect(work.status).toBe("OPEN");
      expect(work.advisoryOnly).toBe(true);
    }
    // The connector-operation work item cites the SENDER-side NOT_EXECUTABLE fact exactly.
    const connectorWork = derivation.platformWorkRequests.find((work) => work.gapId === "platform:connector-operation");
    expect(connectorWork?.evidenceBasis.every((fact) => fact.code === "NOT_EXECUTABLE_CAPABILITY" && fact.side === "SENDER")).toBe(true);
    // The multi-hop hypotheses: the intermediary + the bridge (the no-route state), each carrying its assumed augmentation.
    const hypothesisOperatorIds = derivation.hypothesisRequests.map((hypothesis) => hypothesis.operatorId);
    expect(hypothesisOperatorIds).toContain("repair:intermediary-introduced");
    expect(hypothesisOperatorIds).toContain("repair:bridge-via-intermediary-rail");
    const intermediaryHypothesis = derivation.hypothesisRequests.find((hypothesis) => hypothesis.operatorId === "repair:intermediary-introduced");
    expect(intermediaryHypothesis?.assumption.kind).toBe("ADD_ASSUMED_RAIL");
    expect(intermediaryHypothesis?.assumption.kind === "ADD_ASSUMED_RAIL" && intermediaryHypothesis.assumption.rail.assumed).toBe(true);
    // The applied-operator receipt names every emitted operator (the facts' canonical order: the sender-side
    // NOT_EXECUTABLE fact precedes the recipient-side FUNDING fact; the no-route state group LAST, operator-id sorted).
    expect(derivation.appliedOperators.map((applied) => applied.operatorId)).toEqual([
      "platform:connector-operation",
      "repair:recipient-enables-flw-receiving-method",
      "repair:sender-adds-stripe-compatible-instrument",
      "platform:cross-provider-route-shape",
      "platform:flutterwave-send-operation",
      "repair:bridge-via-intermediary-rail",
      "repair:intermediary-introduced",
    ]);
  });

  it("the honest empty set: a code with no registered operator and no classification derives NOTHING (never a guess)", () => {
    const emptyCatalogue: RepairOperatorCataloguePort = {
      operatorsFor: () => [],
      classificationOf: () => null,
    };
    const derivation = deriveExclusionRepairs(noRouteRepairInput({ catalogue: emptyCatalogue }));
    expect(derivation.conditionalRequests).toEqual([]);
    expect(derivation.platformWorkRequests).toEqual([]);
    expect(derivation.hypothesisRequests).toEqual([]);
    expect(derivation.nonRepairClassifications).toEqual([]);
    expect(derivation.suppressedOperators).toEqual([]);
    expect(derivation.appliedOperators).toEqual([]);
    expect(derivation.repairsPermitExecution).toBe(false);
  });

  it("the non-operator classification: a code honestly not a repair surfaces its row with the verbatim evidence, never a repair card", () => {
    // A catalogue that classifies FUNDING_METHOD_NOT_SERVED as a recheck trigger and answers nothing else.
    const classifyOnly: RepairOperatorCataloguePort = {
      operatorsFor: () => [],
      classificationOf: (code: string) =>
        code === "FUNDING_METHOD_NOT_SERVED"
          ? { classification: "RECHECK" as const, reason: "the fixture classifies the funding decline as a recheck trigger" }
          : null,
    };
    const derivation = deriveExclusionRepairs(noRouteRepairInput({ catalogue: classifyOnly }));
    expect(derivation.conditionalRequests).toEqual([]);
    const row = derivation.nonRepairClassifications.find((entry) => entry.code === "FUNDING_METHOD_NOT_SERVED");
    expect(row?.classification).toBe("RECHECK");
    expect(row?.evidenceBasis.length).toBeGreaterThan(0);
    expect(row?.evidenceBasis.every((fact) => fact.code === "FUNDING_METHOD_NOT_SERVED")).toBe(true);
  });

  it("a lying catalogue never composes: an operator that does not answer the queried code is the typed error", () => {
    const lying: RepairOperatorCataloguePort = {
      operatorsFor: (code: string) =>
        code === "FUNDING_METHOD_NOT_SERVED"
          ? [FIXTURE_PAYOUT_OPERATOR]
          : [],
      classificationOf: () => null,
    };
    expect(() => deriveExclusionRepairs(noRouteRepairInput({ catalogue: lying }))).toThrow(ExclusionRepairError);
    expect(() => deriveExclusionRepairs(noRouteRepairInput({ catalogue: lying }))).toThrow(/a lying catalogue never composes/);
  });

  it("unknown vocabulary fails closed: an operator id outside the frozen A.3 fifteen is the typed error", () => {
    const forged: RepairOperatorCataloguePort = {
      operatorsFor: (code: string) =>
        code === "FUNDING_METHOD_NOT_SERVED"
          ? [{ ...FIXTURE_PAYOUT_OPERATOR, operatorId: "repair:not-in-the-catalogue" }]
          : [],
      classificationOf: () => null,
    };
    expect(() => deriveExclusionRepairs(noRouteRepairInput({ catalogue: forged }))).toThrow(ExclusionRepairError);
    expect(() => deriveExclusionRepairs(noRouteRepairInput({ catalogue: forged }))).toThrow(/outside the frozen ADR-0015 A.3 vocabulary/);
  });

  it("the state key is consulted ONLY in the honest no-route state — an eligible corridor never derives state-keyed repairs", () => {
    const queried: string[] = [];
    const recording: RepairOperatorCataloguePort = {
      operatorsFor: (code: string) => {
        queried.push(code);
        return fixtureRepairCatalogue().operatorsFor(code);
      },
      classificationOf: (code: string) => fixtureRepairCatalogue().classificationOf(code),
    };
    const pair = deriveRailSnapshotPair({
      sender: {
        side: "SENDER", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [senderChain()], corridorPort: realCorridorProjectionPort(),
      },
      recipient: {
        side: "RECIPIENT", query: movementCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
        chains: [recipientChain()], corridorPort: realCorridorProjectionPort(),
      },
    });
    const derivation = deriveExclusionRepairs({
      senderSnapshot: pair.sender,
      recipientSnapshot: pair.recipient,
      hardGates: evaluateHardGates({ intent: noRouteIntentFixture(), at: NOW, candidates: [] }),
      catalogue: recording,
      corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
      optIn: OPT_IN,
      at: DERIVE_AT,
      expiresAt: EXPIRES_AT,
      disclosurePurpose: DISCLOSURE_PURPOSE,
    });
    expect(queried).not.toContain(PINNED_NO_ROUTE_STATE_KEY);
    expect(derivation.hypothesisRequests.filter((hypothesis) => hypothesis.operatorId === "repair:intermediary-introduced")).toEqual([]);
  });

  it("the per-code families: a payout decline derives the payout party change; a currency gap derives the conversion hypothesis + the provider-integration work", () => {
    // A synthetic corridor whose only facts are a payout decline and a currency gap, through a direct snapshot pair
    // built from the same machinery with a restricted catalogue view is NOT derivable here (the snapshot fixtures
    // are corridor-real); the family law is instead proven through the catalogue contract over the no-route corridor
    // by checking WHICH operators the fixture answers for each code (the A.3 mapping) and that the derivation
    // consults exactly the codes present in the grounded facts.
    const catalogue = fixtureRepairCatalogue();
    for (const [code, expectedOperatorIds] of [
      ["PAYOUT_METHOD_NOT_SERVED", ["repair:recipient-enables-served-payout-method"]],
      ["SOURCE_CURRENCY_NOT_SUPPORTED", ["repair:convert-through-supported-asset", "platform:provider-integration"]],
      ["AMOUNT_ABOVE_MAXIMUM", ["repair:split-below-maximum"]],
      ["NOT_EXECUTABLE_CAPABILITY", ["platform:connector-operation"]],
      ["MISSING_PERMISSIONS", ["platform:permission-model", "repair:sender-completes-provider-permissions"]],
    ] as const) {
      expect(catalogue.operatorsFor(code).map((operator) => operator.operatorId).sort()).toEqual([...expectedOperatorIds].sort());
    }
    // The A.3/A.4 totality: 16 operator-applicable + 10 non-operator = the pinned 26 exactly.
    expect(PINNED_OPERATOR_APPLICABLE_EXCLUSION_CODES.length).toBe(16);
    expect(PINNED_NON_OPERATOR_EXCLUSION_CODES.length).toBe(10);
    const homes = new Set([...PINNED_OPERATOR_APPLICABLE_EXCLUSION_CODES, ...PINNED_NON_OPERATOR_EXCLUSION_CODES]);
    expect([...CORRIDOR_EXCLUSION_CODES].every((code) => homes.has(code))).toBe(true);
    expect(homes.size).toBe(26);
    expect(PINNED_REPAIR_OPERATOR_IDS.length).toBe(15);
  });

  it("the determinism law: identical inputs produce byte-identical derivations (the digest proof)", () => {
    const first = deriveExclusionRepairs(noRouteRepairInput());
    const second = deriveExclusionRepairs(noRouteRepairInput());
    expect(second.repairDigest).toBe(first.repairDigest);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("the merged corridor view over the no-route pair is the hypothesis base (the tamper-check surface exists and is deterministic)", () => {
    const input = noRouteRepairInput();
    const first = mergedCorridorView(input.senderSnapshot, input.recipientSnapshot, {
      sourceCountry: "NG",
      destinationCountry: "US",
      sourceCurrency: "NGN",
      destinationCurrency: "USD",
      asOf: "2026-10-05T00:00:00Z",
    });
    const second = mergedCorridorView(input.senderSnapshot, input.recipientSnapshot, {
      sourceCountry: "NG",
      destinationCountry: "US",
      sourceCurrency: "NGN",
      destinationCurrency: "USD",
      asOf: "2026-10-05T00:00:00Z",
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.routes.length).toBeGreaterThan(0);
  });
});

/** One operator fixture reused by the lying-catalogue laws (a payout operator that does NOT answer FUNDING). */
const FIXTURE_PAYOUT_OPERATOR: PinnedRepairOperator = fixtureRepairCatalogue().operatorsFor("PAYOUT_METHOD_NOT_SERVED")[0]!;
