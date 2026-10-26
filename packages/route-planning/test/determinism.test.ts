import { describe, expect, it } from "vitest";
import { deriveEligibleRailSnapshot, deriveRailSnapshotPair } from "../src/rail-snapshot.ts";
import { enumerateRouteCandidates } from "../src/candidates.ts";
import { evaluateHardGates } from "../src/hard-gates.ts";
import { rankRoutes } from "../src/ranking.ts";
import type { RouteCandidateEnumerationInput } from "../src/candidates.ts";
import type { EligibleRailSnapshot, RailSnapshotSideRequest } from "../src/rail-snapshot.ts";
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
 * THE DETERMINISM / REPLAY BATTERY (ADR-0009 D4/D6 + the
 * ROUTINE-CONTRACT acceptance law "identical inputs/time/seeds produce
 * byte-identical plan/scenario digests and deterministic ordering"):
 * every stage of the core pipeline re-derived from FRESH fixture builders
 * repeatedly must produce byte-identical digests at every seam — no
 * hidden state, no ambient clock, no randomness — and canonical ordering
 * must make the pipeline input-order independent where the law demands
 * it (the merged corridor view), while tampering with any grounded input
 * must change the digests (tamper-evidence).
 */

function snapshot(side: "SENDER" | "RECIPIENT", chains: readonly unknown[]): EligibleRailSnapshot {
  return deriveEligibleRailSnapshot({
    side,
    query: movementCorridorQuery(),
    freshnessPolicy: { maxAgeSeconds: 3600 },
    // the chain list is caller data at this seam; the pinned chain type is
    // satisfied structurally by the typed fixture builders below.
    chains: chains as RailSnapshotSideRequest["chains"],
    corridorPort: realCorridorProjectionPort(),
  });
}

function pipeline(input?: Partial<RouteCandidateEnumerationInput>) {
  const sender = snapshot("SENDER", [senderCorridorRouteInput()]);
  const recipient = snapshot("RECIPIENT", [recipientCorridorRouteInput()]);
  const enumeration = enumerateRouteCandidates({
    intent: movementIntentFixture(),
    at: NOW,
    senderSnapshot: sender,
    recipientSnapshot: recipient,
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
  return { sender, recipient, enumeration, gates, ranking };
}

describe("byte-identical replays — the whole pipeline, re-derived from fresh builders", () => {
  it("FIVE consecutive full replays produce identical digests at EVERY stage", () => {
    const digests = new Set<string>();
    for (let replay = 0; replay < 5; replay += 1) {
      const run = pipeline();
      const perReplay = [
        run.sender.snapshotDigest,
        run.recipient.snapshotDigest,
        run.enumeration.compilationDigest,
        run.enumeration.enumerationDigest,
        run.gates.hardGateDigest,
        run.ranking.rankingDigest,
      ];
      expect(perReplay.every((digest) => /^fnv1a64:[0-9a-f]{16}$/.test(digest))).toBe(true);
      digests.add(perReplay.join("|"));
    }
    expect(digests.size).toBe(1);
  });

  it("the plan ordering is deterministic across replays (the total order)", () => {
    const first = pipeline();
    const second = pipeline();
    expect(second.enumeration.candidates.map((plan) => plan.planId)).toEqual(
      first.enumeration.candidates.map((plan) => plan.planId),
    );
    expect(second.ranking.ranked.map((candidate) => candidate.metrics.planId)).toEqual(
      first.ranking.ranked.map((candidate) => candidate.metrics.planId),
    );
    expect(second.ranking.notScored.map((candidate) => candidate.planId)).toEqual(
      first.ranking.notScored.map((candidate) => candidate.planId),
    );
  });

  it("caller-supplied time is honored exactly (no ambient clock drift)", () => {
    const run = pipeline();
    expect(run.enumeration.compiledAt).toBe(NOW);
    expect(run.gates.evaluationInstant).toBe(NOW);
    expect(run.ranking.evaluationInstant).toBe(NOW);
    expect(run.sender.evaluatedAsOf).toBe(movementCorridorQuery().asOf);
  });

  it("a DIFFERENT caller instant changes every downstream digest (time is an input)", () => {
    const at = NOW;
    const later = pipeline({ at: at + 60_000 });
    const base = pipeline();
    expect(later.enumeration.compiledAt).toBe(at + 60_000);
    expect(later.enumeration.enumerationDigest).not.toBe(base.enumeration.enumerationDigest);
    expect(later.enumeration.compilationDigest).not.toBe(base.enumeration.compilationDigest);
    expect(later.gates.hardGateDigest).not.toBe(base.gates.hardGateDigest);
    expect(later.ranking.rankingDigest).not.toBe(base.ranking.rankingDigest);
  });
});

describe("tamper-evidence — every grounded input change moves the digests", () => {
  it("an observation-version bump changes the snapshot AND enumeration digests", () => {
    const base = pipeline();
    const bumped = deriveEligibleRailSnapshot({
      side: "SENDER",
      query: movementCorridorQuery(),
      freshnessPolicy: { maxAgeSeconds: 3600 },
      chains: [senderChain({ observation: planningObservation(SENDER_INSTANCE_ID, 42) })],
      corridorPort: realCorridorProjectionPort(),
    });
    expect(bumped.snapshotDigest).not.toBe(base.sender.snapshotDigest);
    const bumpedEnumeration = enumerateRouteCandidates({
      intent: movementIntentFixture(),
      at: NOW,
      senderSnapshot: bumped,
      recipientSnapshot: base.recipient,
      corridorQuery: movementCorridorQuery(),
      evidence: planningEvidenceBundle(),
      budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
      compilationPort: realRouteCompilationPort(),
    });
    expect(bumpedEnumeration.enumerationDigest).not.toBe(base.enumeration.enumerationDigest);
    expect(
      bumpedEnumeration.observationVersionPins.some((pin) => pin.observationVersion === 42),
    ).toBe(true);
  });

  it("a different budget changes the selection digest (and the enumeration digest)", () => {
    const base = pipeline();
    const tight = pipeline({ budget: { maxCandidates: 1, maxShapes: 9, maxCandidatesPerShape: 9 } });
    expect(tight.enumeration.budgetedSelection.selectionDigest).not.toBe(
      base.enumeration.budgetedSelection.selectionDigest,
    );
    expect(tight.enumeration.enumerationDigest).not.toBe(base.enumeration.enumerationDigest);
    expect(tight.enumeration.candidates.length).toBeLessThanOrEqual(1);
  });

  it("a different policy changes the ranking digest (the declared order is an input)", () => {
    const base = pipeline();
    const reordered = rankRoutes({
      evaluation: base.gates,
      policy: {
        ...planningBestExecutionPolicy(),
        tieBreakers: ["FASTER_SETTLEMENT", "LOWER_RISK_CLASS", "FEWER_HOPS", "FEWER_RAIL_CROSSINGS", "PLAN_ID"],
      },
    });
    expect(reordered.rankingDigest).not.toBe(base.ranking.rankingDigest);
    expect(reordered.tieBreakers[0]).toBe("FASTER_SETTLEMENT");
  });
});

describe("input-order independence where the law demands it (canonical ordering)", () => {
  it("the merged corridor view is IDENTICAL for permuted side chains (canonical routeId order)", () => {
    const forward = snapshot("SENDER", [senderCorridorRouteInput(), recipientCorridorRouteInput()]);
    const permuted = snapshot("SENDER", [recipientCorridorRouteInput(), senderCorridorRouteInput()]);
    // The corridor view preserves INPUT order (the authority's law: the
    // projection assigns no ranking) — so the SNAPSHOT digests differ,
    // but the MERGED enumeration view deduplicates + canonically orders,
    // making the downstream compilation byte-identical.
    expect(forward.rails.map((rail) => rail.routeId)).toEqual([
      SENDER_INSTANCE_ID,
      "inst:recipient-psp-payouts",
    ]);
    expect(permuted.rails.map((rail) => rail.routeId)).toEqual([
      "inst:recipient-psp-payouts",
      SENDER_INSTANCE_ID,
    ]);
    const forwardEnumeration = enumerateRouteCandidates({
      intent: movementIntentFixture(),
      at: NOW,
      senderSnapshot: forward,
      recipientSnapshot: snapshot("RECIPIENT", []),
      corridorQuery: movementCorridorQuery(),
      evidence: planningEvidenceBundle(),
      budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
      compilationPort: realRouteCompilationPort(),
    });
    const permutedEnumeration = enumerateRouteCandidates({
      intent: movementIntentFixture(),
      at: NOW,
      senderSnapshot: permuted,
      recipientSnapshot: snapshot("RECIPIENT", []),
      corridorQuery: movementCorridorQuery(),
      evidence: planningEvidenceBundle(),
      budget: { maxCandidates: 10, maxShapes: 9, maxCandidatesPerShape: 10 },
      compilationPort: realRouteCompilationPort(),
    });
    expect(permutedEnumeration.compilationDigest).toBe(forwardEnumeration.compilationDigest);
    // The enumeration digest additionally binds the per-side snapshot
    // digests (provenance): the authority's corridor view preserves INPUT
    // order (the projection assigns no ranking), so a permuted chain list
    // is a DIFFERENT snapshot record — the compilation over the canonically
    // merged view is identical, and the provenance honestly differs.
    expect(permutedEnumeration.senderSnapshotDigest).not.toBe(forwardEnumeration.senderSnapshotDigest);
    expect(permutedEnumeration.enumerationDigest).not.toBe(forwardEnumeration.enumerationDigest);
    expect(permutedEnumeration.candidates.map((plan) => plan.planId)).toEqual(
      forwardEnumeration.candidates.map((plan) => plan.planId),
    );
  });

  it("the evidence arrays are permutation-invariant (the compiler's consumption law)", () => {
    const base = pipeline();
    const evidence = planningEvidenceBundle();
    const shuffled: typeof evidence = {
      ...evidence,
      conversionRules: [...evidence.conversionRules].reverse(),
      settlementDestinations: [...evidence.settlementDestinations].reverse(),
    };
    const shuffledRun = pipeline({ evidence: shuffled });
    expect(shuffledRun.enumeration.compilationDigest).toBe(base.enumeration.compilationDigest);
    expect(shuffledRun.enumeration.enumerationDigest).toBe(base.enumeration.enumerationDigest);
  });
});

describe("the payment-intent projection replays identically (one routine, two entry shapes)", () => {
  it("a payment intent and its movement projection enumerate byte-identically", () => {
    const movementRun = pipeline();
    const paymentRun = pipeline({ intent: paymentIntentFixture() });
    expect(paymentRun.enumeration.enumerationDigest).toBe(movementRun.enumeration.enumerationDigest);
    expect(paymentRun.enumeration.compilationDigest).toBe(movementRun.enumeration.compilationDigest);
    expect(paymentRun.gates.hardGateDigest).toBe(movementRun.gates.hardGateDigest);
    expect(paymentRun.ranking.rankingDigest).toBe(movementRun.ranking.rankingDigest);
  });
});

describe("the pair derivation replays identically (independence is deterministic too)", () => {
  it("deriveRailSnapshotPair produces identical side digests on repeated derivation", () => {
    const derive = () =>
      deriveRailSnapshotPair({
        sender: {
          side: "SENDER",
          query: movementCorridorQuery(),
          freshnessPolicy: { maxAgeSeconds: 3600 },
          chains: [senderChain()],
          corridorPort: realCorridorProjectionPort(),
        },
        recipient: {
          side: "RECIPIENT",
          query: movementCorridorQuery(),
          freshnessPolicy: { maxAgeSeconds: 3600 },
          chains: [recipientChain()],
          corridorPort: realCorridorProjectionPort(),
        },
      });
    const first = derive();
    const second = derive();
    expect(second.sender.snapshotDigest).toBe(first.sender.snapshotDigest);
    expect(second.recipient.snapshotDigest).toBe(first.recipient.snapshotDigest);
  });
});
