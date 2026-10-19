import { describe, expect, it } from "vitest";
import {
  REPLAY_NAMESPACE,
  countOutcomes,
  isReplayResult,
  recordProductionFacts,
  recordedFactsDigest,
  runCounterfactual,
  runReplay,
} from "@payswap/lab";
import type {
  RecordedProductionFacts,
  SimulationProgram,
} from "@payswap/lab";

/**
 * Replay reproducibility over recorded production facts (P6-W1 rebuild of
 * the old W2-004 suite; LAB.md "Simulation and replay"; recorded
 * production facts are never rewritten; tampering is detected).
 
 * Site classification (this file): 8 old sites PORTED (recording digests
 * and freezes, mutation attempts throw, digest recomputation stability,
 * same-facts-identical-results, namespaced Lab artifacts, tampered fact
 * set rejected, adversarial demand screened, variant non-zero delta) +
 * 1 old site ADAPTED (replay-uses-facts-without-rewriting: the mutation
 * probe now runs against the pinned fact shapes via a bigint-safe
 * snapshot helper) + 2 NET-NEW sites (countOutcomes fold determinism and
 * stepMs quantization) = 11 tests.
 */

const BASE_PROGRAM: SimulationProgram = {
  programId: "replay.base",
  programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b"],
  useNetting: false,
  useNetworkCredit: false,
  delayToleranceSteps: 0,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

const VARIANT_PROGRAM: SimulationProgram = {
  programId: "replay.variant",
  programVersion: "1.0.0",
  routePreference: ["rail-b", "rail-a"],
  useNetting: true,
  useNetworkCredit: true,
  delayToleranceSteps: 2,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

function makeFacts(): RecordedProductionFacts {
  return recordProductionFacts({
    factsId: "facts-2026-09-30",
    description: "observed production demand on a busy afternoon",
    rails: [
      { railId: "rail-a", currency: "EUR", latencyMs: 400, fixedFeeMinor: 25n, variableFeeBps: 10n },
      { railId: "rail-b", currency: "EUR", latencyMs: 350, fixedFeeMinor: 40n, variableFeeBps: 8n },
    ],
    pools: [
      { poolId: "pool-a", railId: "rail-a", availableMinor: 1_000_000n },
      { poolId: "pool-b", railId: "rail-b", availableMinor: 1_000_000n },
    ],
    stepLatencyMs: 250,
    demands: [
      {
        demandId: "prod-demand-1",
        observedAtMs: 0,
        amountMinor: 120_000n,
        currency: "EUR",
        direction: "OUTBOUND",
        deadlineMs: 30_000,
      },
      {
        demandId: "prod-demand-2",
        observedAtMs: 600,
        amountMinor: 80_000n,
        currency: "EUR",
        direction: "INBOUND",
        deadlineMs: 30_000,
      },
      {
        demandId: "prod-demand-3",
        observedAtMs: 1_200,
        amountMinor: 50_000n,
        currency: "EUR",
        direction: "OUTBOUND",
        deadlineMs: 30_000,
        adversarial: "FRAUD",
      },
    ],
    incidents: [],
  });
}

function snapshot(value: unknown): string {
  return JSON.stringify(value, (_, inner) =>
    typeof inner === "bigint" ? `bigint:${inner.toString()}` : inner,
  );
}

describe("recorded production facts (replay never rewrites them)", () => {
  it("recording digests and freezes the fact set", () => {
    const facts = makeFacts();
    expect(facts.factsDigest).toMatch(/^labfnv1a64:[0-9a-f]{16}$/);
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts.demands)).toBe(true);
  });

  it("mutation attempts on a recorded fact set throw (immutable history)", () => {
    const facts = makeFacts();
    expect(() => {
      (facts as { factsId: string }).factsId = "tampered";
    }).toThrow();
    expect(() => {
      (facts.demands as unknown[]).push({ demandId: "fake" });
    }).toThrow();
  });

  it("recomputing the digest over identical content is stable", () => {
    const facts = makeFacts();
    expect(recordedFactsDigest(facts)).toBe(facts.factsDigest);
    const again = makeFacts();
    expect(recordedFactsDigest(again)).toBe(facts.factsDigest);
  });
});

describe("deterministic replay", () => {
  it("same facts + program + seed -> identical replay results", () => {
    const a = runReplay({ facts: makeFacts(), program: BASE_PROGRAM, seed: "seed-1", stepMs: 250 });
    const b = runReplay({ facts: makeFacts(), program: BASE_PROGRAM, seed: "seed-1", stepMs: 250 });
    expect(a).toEqual(b);
    expect(a.digest).toBe(b.digest);
  });

  it("replay results are namespaced Lab artifacts (INV-L01)", () => {
    const result = runReplay({ facts: makeFacts(), program: BASE_PROGRAM, seed: "seed-1", stepMs: 250 });
    expect(result.namespace).toBe(REPLAY_NAMESPACE);
    expect(result.__payswapLabReplayNamespace).toBe(REPLAY_NAMESPACE);
    expect(isReplayResult(result)).toBe(true);
    expect(isReplayResult({})).toBe(false);
    expect(isReplayResult({ namespace: "PAYSWAP_LAB_SIMULATION" })).toBe(false);
  });

  it("replay uses the recorded facts WITHOUT rewriting them", () => {
    const facts = makeFacts();
    const factsSnapshot = snapshot(facts);
    runReplay({ facts, program: BASE_PROGRAM, seed: "seed-1", stepMs: 250 });
    runCounterfactual({
      facts,
      baseProgram: BASE_PROGRAM,
      variantProgram: VARIANT_PROGRAM,
      seed: "seed-1",
      stepMs: 250,
    });
    expect(snapshot(facts)).toBe(factsSnapshot);
  });

  it("a tampered fact set (digest mismatch) is rejected", () => {
    const facts = makeFacts();
    const tampered: RecordedProductionFacts = {
      ...facts,
      demands: [
        ...facts.demands.slice(0, 2),
        { ...facts.demands[2]!, amountMinor: 999_999n },
      ],
      factsDigest: facts.factsDigest,
    };
    expect(() =>
      runReplay({ facts: tampered, program: BASE_PROGRAM, seed: "seed-1", stepMs: 250 }),
    ).toThrow(/digest mismatch|tampered/);
  });

  it("the recorded adversarial demand is screened by the base program", () => {
    const result = runReplay({ facts: makeFacts(), program: BASE_PROGRAM, seed: "seed-1", stepMs: 250 });
    expect(result.run.metrics.blockedAdversarial).toBe(1);
    expect(result.run.metrics.adversarialSettled).toBe(0);
  });

  it("a variant that changes behavior produces a non-zero delta", () => {
    const counterfactual = runCounterfactual({
      facts: makeFacts(),
      baseProgram: BASE_PROGRAM,
      variantProgram: VARIANT_PROGRAM,
      seed: "seed-1",
      stepMs: 250,
    });
    // The variant re-orders rails and turns on netting/credit: the fee
    // profile changes exactly (rail-b's pricing differs from rail-a's).
    expect(counterfactual.delta.feesMinor).not.toBe(0n);
    expect(counterfactual.base.program.programId).not.toBe(
      counterfactual.variant.program.programId,
    );
  });

  it("countOutcomes folds the run deterministically", () => {
    const result = runReplay({ facts: makeFacts(), program: BASE_PROGRAM, seed: "seed-1", stepMs: 250 });
    const counters = countOutcomes(result.run);
    expect(counters.SETTLED).toBe(2);
    expect(counters.BLOCKED_FRAUD).toBe(1);
    const again = runReplay({ facts: makeFacts(), program: BASE_PROGRAM, seed: "seed-1", stepMs: 250 });
    expect(countOutcomes(again.run)).toEqual(counters);
  });

  it("stepMs quantization is deterministic (observed time maps to steps by floor)", () => {
    const fine = runReplay({ facts: makeFacts(), program: BASE_PROGRAM, seed: "seed-1", stepMs: 100 });
    const coarse = runReplay({ facts: makeFacts(), program: BASE_PROGRAM, seed: "seed-1", stepMs: 1_000 });
    // Different quantization derives different scenario steps -> different digests.
    expect(fine.digest).not.toBe(coarse.digest);
    expect(() => runReplay({ facts: makeFacts(), program: BASE_PROGRAM, seed: "s", stepMs: 0 })).toThrow(
      /stepMs/,
    );
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/replay.test.ts)
// ---------------------------------------------------------------------------
// PORTED (8): "recording digests and freezes the fact set"; "mutation
// attempts on a recorded fact set throw (immutable history)";
// "recomputing the digest over identical content is stable"; "same facts +
// program + seed -> identical replay results"; "replay results are
// namespaced Lab artifacts"; "a tampered fact set (digest mismatch) is
// rejected"; "the recorded adversarial demand is screened by the base
// program"; "a variant that changes behavior produces a non-zero delta".
// ADAPTED (1): "replay uses the recorded facts WITHOUT rewriting them".
// NET-NEW (2): countOutcomes fold; stepMs quantization.
// ---------------------------------------------------------------------------
// Fact-set integrity receipts
// ---------------------------------------------------------------------------
// recordProductionFacts digests (factsId, rails, pools, stepLatencyMs,
// demands, incidents) — note the digest deliberately EXCLUDES the
// optional description: two recordings differing only in prose are the
// same facts. deepFreeze makes every mutation attempt throw. The tampered
// probe rebuilds the demands array with a different amount but keeps the
// ORIGINAL digest: runReplay recomputes, compares, and rejects — the
// mismatch message names the factsId and says "tampered".
// ---------------------------------------------------------------------------
// Replay-determinism receipts (restated for the battery ledger)
// ---------------------------------------------------------------------------
// The replay result embeds (factsId, factsDigest, program id+version,
// seed, stepMs, runDigest) in its digest, so any change to ANY of those
// inputs is visible; the run digest itself covers the whole simulation
// content. Two replays of the same recorded facts are byte-identical
// objects (toEqual on the deep-frozen result). The facts snapshot helper
// serializes bigints explicitly, so a mutation that only touched a bigint
// field could not hide behind JSON.stringify's silent bigint-to-string
// coercion — the receipts are exact.
// ---------------------------------------------------------------------------
// Tamper-detection receipts (restated)
// ---------------------------------------------------------------------------
// The digest covers every truth-relevant field of the fact set; the
// replay gate recomputes and compares before ANY derivation happens; and
// the rejection message names the factsId — the failure is attributable,
// not a silent wrong answer.
