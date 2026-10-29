import { describe, expect, it } from "vitest";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { evaluateHardGates } from "../src/hard-gates.ts";
import { deriveExclusionRepairs, type ExclusionRepairDerivation } from "../src/exclusion-repair.ts";
import {
  LabFactsError,
  recordedFactsFromSnapshots,
  repairInterventionsFromRepairs,
  type AssumedEconomics,
} from "../src/lab-facts.ts";
import {
  CORRIDOR_RAIL_KEY,
  NOW,
  flwSenderChain,
  noRouteCorridorQuery,
  noRouteIntentFixture,
  stripeRecipientChain,
} from "./no-route-fixtures.ts";
import { realCorridorProjectionPort } from "./fixtures.ts";
import { fixtureRepairCatalogue } from "./repair-catalogue-fixture.ts";

/**
 * THE STAGE-6 REAL-FACTS PATH (P23-C, ADR-0015 D9c): the Lab recorded
 * production facts derived from the rail snapshots' REAL rail records
 * (one simulated rail per real record, the honest EMPTY pools/demands/
 * incidents, the caller-supplied economics law), and the derived repair
 * set mapped onto the EXISTING Lab intervention kinds (NO new kinds —
 * the D13 law).
 */

const OPT_IN = { participantRef: "principal:operator-1", optedInAt: NOW - 1_000 };
const ECONOMICS = Object.freeze([
  Object.freeze({ routeId: "inst:sender-flw-readonly", latencyMs: 4_000, fixedFeeMinor: 100n, variableFeeBps: 150n }),
  Object.freeze({ routeId: "inst:recipient-stripe-test", latencyMs: 2_000, fixedFeeMinor: 299n, variableFeeBps: 259n }),
]);

function noRoutePair() {
  return deriveRailSnapshotPair({
    sender: {
      side: "SENDER", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [flwSenderChain()], corridorPort: realCorridorProjectionPort(),
    },
    recipient: {
      side: "RECIPIENT", query: noRouteCorridorQuery(), freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [stripeRecipientChain()], corridorPort: realCorridorProjectionPort(),
    },
  });
}

function noRouteRepairs(): ExclusionRepairDerivation {
  const pair = noRoutePair();
  return deriveExclusionRepairs({
    senderSnapshot: pair.sender,
    recipientSnapshot: pair.recipient,
    hardGates: evaluateHardGates({ intent: noRouteIntentFixture(), at: NOW, candidates: [] }),
    catalogue: fixtureRepairCatalogue(),
    corridorRail: { railKind: "FIAT", railKey: CORRIDOR_RAIL_KEY },
    optIn: OPT_IN,
    at: NOW,
    expiresAt: NOW + 3_600_000,
    disclosurePurpose: "the stage-6 real-facts battery",
  });
}

const ASSUMED_ECONOMICS: AssumedEconomics = Object.freeze({ latencyMs: 3_000, fixedFeeMinor: 50n, variableFeeBps: 75n });

describe("the stage-6 real-facts path (P23-C, ADR-0015 D9c + D13)", () => {
  it("one simulated rail per REAL rail record, named by the routeId; the honest EMPTY pools/demands/incidents", () => {
    const pair = noRoutePair();
    const facts = recordedFactsFromSnapshots({
      senderSnapshot: pair.sender,
      recipientSnapshot: pair.recipient,
      factsId: "facts:fixture:no-route",
      stepLatencyMs: 1_000,
      railEconomics: ECONOMICS,
    });
    expect(facts.factsId).toBe("facts:fixture:no-route");
    expect(facts.rails.length).toBe(2);
    expect(facts.rails.map((rail) => rail.railId)).toEqual(["inst:sender-flw-readonly", "inst:recipient-stripe-test"]);
    // The side-settlement currency projection: the sender side settles the source currency, the recipient side the destination.
    const senderRail = facts.rails.find((rail) => rail.railId === "inst:sender-flw-readonly");
    const recipientRail = facts.rails.find((rail) => rail.railId === "inst:recipient-stripe-test");
    expect(senderRail?.currency).toBe("NGN");
    expect(recipientRail?.currency).toBe("USD");
    // The honest empty sets — never fabricated.
    expect(facts.pools).toEqual([]);
    expect(facts.demands).toEqual([]);
    expect(facts.incidents).toEqual([]);
    expect(facts.stepLatencyMs).toBe(1_000);
    expect(facts.projectionDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("the caller-supplied economics law: a rail without declared economics fails CLOSED naming the routeId (never silently dropped, never invented)", () => {
    const pair = noRoutePair();
    expect(() =>
      recordedFactsFromSnapshots({
        senderSnapshot: pair.sender,
        recipientSnapshot: pair.recipient,
        factsId: "facts:fixture:no-route",
        stepLatencyMs: 1_000,
        railEconomics: [ECONOMICS[0]!],
      }),
    ).toThrow(LabFactsError);
    expect(() =>
      recordedFactsFromSnapshots({
        senderSnapshot: pair.sender,
        recipientSnapshot: pair.recipient,
        factsId: "facts:fixture:no-route",
        stepLatencyMs: 1_000,
        railEconomics: [ECONOMICS[0]!],
      }),
    ).toThrow(/inst:recipient-stripe-test/);
  });

  it("the corridor-agreement law: snapshots grounded on different corridor queries never compose", () => {
    const pair = noRoutePair();
    const foreign = { ...pair.recipient, query: { ...pair.recipient.query, sourceCurrency: "KES" } };
    expect(() =>
      recordedFactsFromSnapshots({
        senderSnapshot: pair.sender,
        recipientSnapshot: foreign,
        factsId: "facts:fixture:no-route",
        stepLatencyMs: 1_000,
        railEconomics: ECONOMICS,
      }),
    ).toThrow(LabFactsError);
  });

  it("the determinism law: identical snapshots + economics produce byte-identical facts (the digest + a bigint-safe structural proof)", () => {
    const pair = noRoutePair();
    const first = recordedFactsFromSnapshots({
      senderSnapshot: pair.sender, recipientSnapshot: pair.recipient,
      factsId: "facts:fixture:no-route", stepLatencyMs: 1_000, railEconomics: ECONOMICS,
    });
    const second = recordedFactsFromSnapshots({
      senderSnapshot: pair.sender, recipientSnapshot: pair.recipient,
      factsId: "facts:fixture:no-route", stepLatencyMs: 1_000, railEconomics: ECONOMICS,
    });
    expect(second.projectionDigest).toBe(first.projectionDigest);
    const bigintSafe = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);
    expect(JSON.stringify(second, bigintSafe)).toBe(JSON.stringify(first, bigintSafe));
  });

  it("the repair→intervention mapping uses ONLY the EXISTING Lab kinds: both intermediary operators join as THIRD_PARTY_NODE_JOINS (role intermediary, distinct nodes)", () => {
    const interventions = repairInterventionsFromRepairs({ repairs: noRouteRepairs(), assumedEconomics: ASSUMED_ECONOMICS });
    expect(interventions.length).toBe(2);
    // Both no-route-state operators (intermediary-introduced + bridge-via-intermediary-rail) are pinned
    // intermediary operators: each joins the variant world as its OWN third-party node (role "intermediary").
    expect(interventions.map((intervention) => intervention.kind)).toEqual(["THIRD_PARTY_NODE_JOINS", "THIRD_PARTY_NODE_JOINS"]);
    const nodeIds = interventions.map(
      (intervention) => (intervention.kind === "THIRD_PARTY_NODE_JOINS" ? intervention.nodeId : "not-a-node"),
    );
    expect(nodeIds).toEqual([
      "assumed-node:repair:bridge-via-intermediary-rail",
      "assumed-node:repair:intermediary-introduced",
    ]);
    expect(new Set(nodeIds).size).toBe(2);
    // The assumed economics ride the rails as CALLER-SUPPLIED parameters (advisory simulation, never real claims).
    for (const intervention of interventions) {
      if (intervention.kind !== "THIRD_PARTY_NODE_JOINS") continue;
      for (const rail of intervention.rails) {
        expect(rail.latencyMs).toBe(ASSUMED_ECONOMICS.latencyMs);
        expect(rail.fixedFeeMinor).toBe(ASSUMED_ECONOMICS.fixedFeeMinor);
      }
    }
  });

  it("a repairs object without hypothesisRequests fails closed (the shape law)", () => {
    expect(() => repairInterventionsFromRepairs({ repairs: {} as never, assumedEconomics: ASSUMED_ECONOMICS })).toThrow(LabFactsError);
  });
});
