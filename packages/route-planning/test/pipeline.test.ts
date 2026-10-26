import { describe, expect, it } from "vitest";
import { deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { enumerateRouteCandidates } from "../src/candidates.ts";
import { evaluateHardGates } from "../src/hard-gates.ts";
import { rankRoutes } from "../src/ranking.ts";
import { routePlanningPermitsExecution } from "../src/candidates.ts";
import type { RouteCandidateEnumerationInput } from "../src/candidates.ts";
import type { EligibleRailSnapshot, RailSnapshotSideRequest } from "../src/rail-snapshot.ts";
import { PortUnboundError } from "../src/errors.ts";
import {
  movementCorridorQuery,
  movementIntentFixture,
  NOW,
  paymentIntentFixture,
  planningObservation,
  realCorridorProjectionPort,
  recipientChain,
  recipientCorridorRouteInput,
  senderChain,
  senderCorridorRouteInput,
  SENDER_INSTANCE_ID,
} from "./fixtures.ts";
import {
  planningEvidenceBundle,
  planningBestExecutionPolicy,
  realRouteCompilationPort,
} from "./compiler-evidence.ts";

/**
 * THE INTEGRATION BATTERY (the stage 2→5 offline/contract-tier
 * composition): the FULL snapshot→candidates→gates→ranking pipeline with
 * the REAL engines bound through the composition ports — the REAL
 * capability corridor projection (projectCorridor +
 * evaluateCorridorRoute), the REAL route compiler
 * (compileMoneyMovementRoute) — plus the honest-degradation laws (UNKNOWN
 * is not FAILED; stale observations surface the typed exclusion; unbound
 * ports fail CLOSED at every stage; no stage ever permits execution).
 */

function sideRequest(
  side: "SENDER" | "RECIPIENT",
  chains: RailSnapshotSideRequest["chains"],
): RailSnapshotSideRequest {
  return {
    side,
    query: movementCorridorQuery(),
    freshnessPolicy: { maxAgeSeconds: 3600 },
    chains,
    corridorPort: realCorridorProjectionPort(),
  };
}

function fullPipeline(input?: Partial<RouteCandidateEnumerationInput>) {
  const pair = deriveRailSnapshotPair({
    sender: sideRequest("SENDER", [senderChain()]),
    recipient: sideRequest("RECIPIENT", [recipientChain()]),
  });
  const enumeration = enumerateRouteCandidates({
    intent: movementIntentFixture(),
    at: NOW,
    senderSnapshot: pair.sender,
    recipientSnapshot: pair.recipient,
    corridorQuery: movementCorridorQuery(),
    evidence: planningEvidenceBundle(),
    budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
    compilationPort: realRouteCompilationPort(),
    ...input,
  });
  const gates = evaluateHardGates({
    intent: movementIntentFixture(),
    at: NOW,
    candidates: enumeration.candidates,
  });
  const ranking = rankRoutes({ evaluation: gates, policy: planningBestExecutionPolicy() });
  return { pair, enumeration, gates, ranking };
}

describe("the full stage 2→5 pipeline with the REAL engines bound", () => {
  it("stage 2/3: both rail snapshots derive through the REAL corridor projection", () => {
    const { pair } = fullPipeline();
    for (const snapshot of [pair.sender, pair.recipient] as const) {
      expect(snapshot.rails).toHaveLength(1);
      expect(snapshot.rails[0]?.eligible).toBe(true);
      expect(snapshot.snapshotDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
      expect(snapshot.railsPermitExecution).toBe(false);
    }
    expect(pair.sender.eligibleRouteIds).toEqual([SENDER_INSTANCE_ID]);
    expect(pair.recipient.eligibleRouteIds).toEqual(["inst:recipient-psp-payouts"]);
  });

  it("stage 4: the REAL compiler compiles over the merged view through the port", () => {
    const { enumeration } = fullPipeline();
    expect(enumeration.compilerStatus).toBe("ROUTES_COMPILED");
    expect(enumeration.candidates.length).toBe(2);
    expect(enumeration.candidates.map((plan) => plan.shapeId).sort()).toEqual([
      "mixed-dex-offramp",
      "provider-native-offramp",
    ]);
    expect(enumeration.discoveryPermitsExecution).toBe(false);
  });

  it("stage 5 (gates): both compiled candidates are hard-eligible", () => {
    const { gates } = fullPipeline();
    expect(gates.rankEligible).toHaveLength(2);
    expect(gates.gated).toEqual([]);
    expect(gates.hardGatesPermitExecution).toBe(false);
  });

  it("stage 5 (ranking): the scored plan ranks; the unscored baseline is retained and disclosed", () => {
    const { ranking } = fullPipeline();
    expect(ranking.ranked).toHaveLength(1);
    expect(ranking.ranked[0]?.metrics.shapeId).toBe("mixed-dex-offramp");
    expect(ranking.ranked[0]?.rank).toBe(1);
    expect(ranking.notScored).toHaveLength(1);
    expect(ranking.notScored[0]?.shapeId).toBe("provider-native-offramp");
    expect(ranking.notScored[0]?.unknownDimensions).toContain("SCORE");
    expect(ranking.rankingPermitsExecution).toBe(false);
  });

  it("the composed plan's score components are carried through verbatim (exact money)", () => {
    const { ranking } = fullPipeline();
    const score = ranking.ranked[0]?.metrics.score;
    expect(score).toBeDefined();
    expect(score?.numeraire).toBe("USC");
    expect(BigInt(score?.netNumeraireMinorUnits ?? "0")).toBeGreaterThan(0n);
    const kinds = score?.components.map((component) => component.kind) ?? [];
    expect(kinds).toContain("OUTPUT");
    expect(kinds).toContain("RISK_DEDUCTION");
    expect(kinds).toContain("TIME_COST");
  });

  it("NO STAGE of the pipeline ever permits execution (the discovery law)", () => {
    const { pair, enumeration, gates, ranking } = fullPipeline();
    expect(pair.sender.railsPermitExecution).toBe(false);
    expect(pair.recipient.railsPermitExecution).toBe(false);
    expect(enumeration.discoveryPermitsExecution).toBe(false);
    expect(gates.hardGatesPermitExecution).toBe(false);
    expect(ranking.rankingPermitsExecution).toBe(false);
    expect(routePlanningPermitsExecution()).toBe(false);
  });

  it("every stage digest is the ONE namespaced flavor (fnv1a64:<16hex>)", () => {
    const { pair, enumeration, gates, ranking } = fullPipeline();
    for (const digest of [
      pair.sender.snapshotDigest,
      pair.recipient.snapshotDigest,
      enumeration.compilationDigest,
      enumeration.enumerationDigest,
      enumeration.budgetedSelection.selectionDigest,
      gates.hardGateDigest,
      ranking.rankingDigest,
    ]) {
      expect(digest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    }
  });

  it("the full pipeline replays byte-identically (the acceptance law)", () => {
    const first = fullPipeline();
    const second = fullPipeline();
    expect(second.enumeration.enumerationDigest).toBe(first.enumeration.enumerationDigest);
    expect(second.gates.hardGateDigest).toBe(first.gates.hardGateDigest);
    expect(second.ranking.rankingDigest).toBe(first.ranking.rankingDigest);
  });

  it("a payment intent (the 11-key commerce shape) runs the SAME pipeline identically", () => {
    const movementRun = fullPipeline();
    const paymentRun = fullPipeline({ intent: paymentIntentFixture() });
    expect(paymentRun.enumeration.enumerationDigest).toBe(movementRun.enumeration.enumerationDigest);
    expect(paymentRun.ranking.rankingDigest).toBe(movementRun.ranking.rankingDigest);
  });
});

describe("honest degradation through the REAL engines (UNKNOWN is not FAILED)", () => {
  it("an UNREACHABLE source yields UNKNOWN effective availability and a typed exclusion (never a silent failure)", () => {
    const snapshot: EligibleRailSnapshot = deriveRailSnapshotPair({
      sender: sideRequest("SENDER", [
        senderChain({
          observation: planningObservation(SENDER_INSTANCE_ID, 5, { sourceAvailability: "UNREACHABLE" }),
        }),
      ]),
      recipient: sideRequest("RECIPIENT", [recipientChain()]),
    }).sender;
    const rail = snapshot.rails[0];
    expect(rail?.effectiveAvailability).toBe("UNKNOWN");
    expect(rail?.eligible).toBe(false);
    expect(rail?.exclusions.some((exclusion) => exclusion.code === "AVAILABILITY_UNKNOWN")).toBe(true);
    expect(snapshot.eligibleRouteIds).toEqual([]);
  });

  it("a STALE observation is disclosed with the typed STALE_OBSERVATION exclusion and stale: true", () => {
    const snapshot: EligibleRailSnapshot = deriveRailSnapshotPair({
      sender: sideRequest("SENDER", [
        senderChain({
          observation: planningObservation(SENDER_INSTANCE_ID, 6, {
            observedAt: "2020-01-01T00:00:00Z",
          }),
        }),
      ]),
      recipient: sideRequest("RECIPIENT", [recipientChain()]),
    }).sender;
    const rail = snapshot.rails[0];
    expect(rail?.stale).toBe(true);
    expect(
      rail?.exclusions.some((exclusion) => exclusion.code === "STALE_OBSERVATION"),
    ).toBe(true);
    expect(rail?.exclusions.every((exclusion) => exclusion.cause.length > 0 && exclusion.layer.length > 0)).toBe(true);
  });

  it("a snapshot pair with NO eligible rails composes an honest NO_COMPILABLE_ROUTE enumeration", () => {
    const degraded = deriveRailSnapshotPair({
      sender: sideRequest("SENDER", [
        senderChain({
          observation: planningObservation(SENDER_INSTANCE_ID, 5, { sourceAvailability: "UNREACHABLE" }),
        }),
      ]),
      recipient: sideRequest("RECIPIENT", [
        recipientChain({
          observation: planningObservation("inst:recipient-psp-payouts", 8, { sourceAvailability: "UNKNOWN" }),
        }),
      ]),
    });
    expect(degraded.sender.eligibleRouteIds).toEqual([]);
    expect(degraded.recipient.eligibleRouteIds).toEqual([]);
    const enumeration = enumerateRouteCandidates({
      intent: movementIntentFixture(),
      at: NOW,
      senderSnapshot: degraded.sender,
      recipientSnapshot: degraded.recipient,
      corridorQuery: movementCorridorQuery(),
      evidence: planningEvidenceBundle(),
      budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
      compilationPort: realRouteCompilationPort(),
    });
    expect(enumeration.compilerStatus).toBe("NO_COMPILABLE_ROUTE");
    expect(enumeration.candidates).toEqual([]);
    expect(enumeration.exclusions.length).toBeGreaterThan(0);
    expect(enumeration.exclusions.every((exclusion) => exclusion.reasons.length > 0)).toBe(true);
    const gates = evaluateHardGates({
      intent: movementIntentFixture(),
      at: NOW,
      candidates: enumeration.candidates,
    });
    const ranking = rankRoutes({ evaluation: gates, policy: planningBestExecutionPolicy() });
    expect(ranking.ranked).toEqual([]);
    expect(ranking.notScored).toEqual([]);
    expect(ranking.rankingDigest).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it("an expired intent window gates every compiled candidate at stage 5", () => {
    const expiredIntent = { ...movementIntentFixture(), expiresAt: NOW + 1 };
    const run = fullPipeline();
    const gates = evaluateHardGates({
      intent: expiredIntent,
      at: NOW + 1,
      candidates: run.enumeration.candidates,
    });
    expect(gates.rankEligible).toEqual([]);
    expect(gates.gated).toHaveLength(run.enumeration.candidates.length);
    expect(gates.gated.every((candidate) => candidate.codes.includes("INTENT_WINDOW_EXPIRED"))).toBe(true);
  });

  it("a tight budget truncates the REAL compilation with TRUE pre-cut receipts", () => {
    const enumeration = fullPipeline({
      budget: { maxCandidates: 1, maxShapes: 9, maxCandidatesPerShape: 9 },
    }).enumeration;
    expect(enumeration.candidates).toHaveLength(1);
    expect(enumeration.budgetedSelection.coverage).toBe("TRUNCATED");
    expect(enumeration.budgetedSelection.receipts[0]?.dimension).toBe("maxCandidates");
    expect(enumeration.budgetedSelection.receipts[0]?.actualCount).toBe(2);
    expect(enumeration.budgetedSelection.receipts[0]?.limit).toBe(1);
  });
});

describe("fail-closed composition at every stage (unbound engines)", () => {
  it("an unbound CORRIDOR port fails CLOSED (stage 2/3) — the snapshot never fabricates a view", () => {
    expect(() =>
      deriveRailSnapshotPair({
        sender: { ...sideRequest("SENDER", [senderCorridorRouteInput()]), corridorPort: undefined as never },
        recipient: sideRequest("RECIPIENT", [recipientCorridorRouteInput()]),
      }),
    ).toThrow(PortUnboundError);
  });

  it("an unbound COMPILATION port fails CLOSED (stage 4) — the enumeration never fabricates plans", () => {
    const pair = deriveRailSnapshotPair({
      sender: sideRequest("SENDER", [senderChain()]),
      recipient: sideRequest("RECIPIENT", [recipientChain()]),
    });
    let stage = "";
    try {
      enumerateRouteCandidates({
        intent: movementIntentFixture(),
        at: NOW,
        senderSnapshot: pair.sender,
        recipientSnapshot: pair.recipient,
        corridorQuery: movementCorridorQuery(),
        evidence: planningEvidenceBundle(),
        budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
        compilationPort: undefined as never,
      });
      expect.unreachable("the unbound port must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PortUnboundError);
      stage = (error as PortUnboundError & { details?: { stage: string } }).details?.stage ?? "";
    }
    expect(stage).toBe("stage-4:compile-available-routes");
  });

  it("the REAL engines compose the same snapshot regardless of the fixture builder used (pin fidelity end-to-end)", () => {
    const viaPinned = deriveRailSnapshotPair({
      sender: sideRequest("SENDER", [senderChain()]),
      recipient: sideRequest("RECIPIENT", [recipientChain()]),
    });
    const viaTyped = deriveRailSnapshotPair({
      sender: sideRequest("SENDER", [senderCorridorRouteInput()]),
      recipient: sideRequest("RECIPIENT", [recipientCorridorRouteInput()]),
    });
    expect(viaTyped.sender.snapshotDigest).toBe(viaPinned.sender.snapshotDigest);
    expect(viaTyped.recipient.snapshotDigest).toBe(viaPinned.recipient.snapshotDigest);
  });
});
