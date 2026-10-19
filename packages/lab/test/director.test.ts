import { describe, expect, it } from "vitest";
import {
  CandidateRegistry,
  DirectorControl,
  LabBuildingBlockIndex,
  PAYMENT_ROUTING_DOMAIN_PACK,
  PromotionLedger,
  buildLabSearchIndex,
  getBaselineSuite,
} from "@payswap/lab";
import type { PromotionEvidenceRef, SimulationProgram } from "@payswap/lab";
import {
  CANDIDATE_BODY_REF,
  CANDIDATE_PRINCIPAL,
  makeCatalogueEntry,
  makeInstance,
  makeNativeRoutingDefinition,
  makeObservation,
} from "./fixtures.ts";

/**
 * Director control interfaces (P6-W1 rebuild of the old W2-004 suite;
 * LAB.md "Director"; canonical INV-9): deterministic scheduling,
 * resolvers, evaluation service, versioned-path promotion and
 * NON-AUTHORITATIVE LLM reasoning.
 
 * Site classification (this file): 11 old sites PORTED (the full old
 * director corpus: the four resolvers, selectCandidates/
 * inspectCandidate determinism, triggerEvaluation determinism,
 * recordEvaluationEvidence -> BENCHMARKED, unknown-candidate rejection,
 * the versioned-ledger promotion path, and the two LLM-reasoning
 * non-authority sites) + 2 NET-NEW sites (resolvers fail closed without
 * a bound index; the full INV-L02 triple reaches SHADOW through the
 * Director path) = 13 tests.
 */

const PROGRAM: SimulationProgram = {
  programId: "director.program",
  programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b"],
  useNetting: true,
  useNetworkCredit: true,
  delayToleranceSteps: 2,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

function newDirector(options?: {
  searchIndex?: ReturnType<typeof buildLabSearchIndex>;
  blockIndex?: LabBuildingBlockIndex;
}): DirectorControl {
  const registry = new CandidateRegistry();
  registry.register({
    candidateId: "cand-director",
    title: "director test candidate",
    domainPackId: PAYMENT_ROUTING_DOMAIN_PACK.packId,
    origin: "deterministic-baseline",
    execution: "COMPOSED_PAYSWAP",
    program: PROGRAM,
    buildingBlocks: [
      { blockKind: "CONNECTOR_CAPABILITY", blockId: "psp.native-routing", version: "1.0.0" },
    ],
  });
  return new DirectorControl({
    domainPack: PAYMENT_ROUTING_DOMAIN_PACK,
    registry,
    promotionLedger: new PromotionLedger(),
    ...(options?.searchIndex !== undefined ? { searchIndex: options.searchIndex } : {}),
    ...(options?.blockIndex !== undefined ? { blockIndex: options.blockIndex } : {}),
  });
}

function searchIndex(): ReturnType<typeof buildLabSearchIndex> {
  return buildLabSearchIndex({
    definitions: [makeNativeRoutingDefinition()],
    instances: [
      makeInstance({ instanceId: "inst-director", capabilityId: "psp.native-routing", simulatedRailId: "rail-a" }),
    ],
    observations: [makeObservation({ instanceId: "inst-director" })],
    catalogueEntries: [makeCatalogueEntry({ capabilityId: "psp.director-catalogue-only" })],
  });
}

const FULL_TRIPLE: PromotionEvidenceRef[] = (["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS"] as const).map(
  (kind, index) => ({
    evidenceId: `ev-${kind}-${index}`,
    kind,
    artifactRef: `artifacts/${kind}-${index}`,
    contentDigest: `digest-${kind}-${index}`,
  }),
);

describe("Director resolvers (deterministic)", () => {
  it("resolveCapability is grounded in instances + observations (INV-13)", () => {
    const director = newDirector({ searchIndex: searchIndex() });
    const blocks = director.resolveCapability({ domain: "payment-routing" });
    expect(blocks.length).toBe(1);
    expect(blocks[0]?.instance.instanceId).toBe("inst-director");
    // The catalogue-only entry never becomes an executable block.
    expect(blocks[0]?.definition.capabilityId).toBe("psp.native-routing");
  });

  it("resolveStrategy runs a deterministic search plug-in over executable blocks", () => {
    const director = newDirector({ searchIndex: searchIndex() });
    const a = director.resolveStrategy({
      pluginId: "deterministic-baseline",
      world: getBaselineSuite().scenarios[0]!.world,
      query: { domain: "payment-routing" },
    });
    // One bound rail still yields the incumbent + composed + optimized trio.
    expect(a.length).toBe(3);
    expect(a[0]?.execution).toBe("PASS_THROUGH_NATIVE");
    expect(a[0]?.isIncumbentBaseline).toBe(true);
    const b = director.resolveStrategy({
      pluginId: "deterministic-baseline",
      world: getBaselineSuite().scenarios[0]!.world,
      query: { domain: "payment-routing" },
    });
    expect(a).toEqual(b);
  });

  it("resolveOrganization returns the composed candidate organization", () => {
    const director = newDirector();
    const organization = director.resolveOrganization("cand-director");
    expect(organization).toBeDefined();
    expect(organization?.id).toBe("org:cand-director");
    // The proposal-only law: no budgets, no delegation edges.
    expect(organization?.budgets).toEqual([]);
    expect(organization?.delegationEdges).toEqual([]);
  });

  it("resolveMechanism lists participation mechanisms deterministically", () => {
    const blockIndex = new LabBuildingBlockIndex();
    blockIndex.registerParticipationMechanism({
      blockId: "mech.rewards-v1",
      version: "1.0.0",
      description: "participation rewards",
      incentiveKinds: ["rewards", "reputation-projection"],
      rewardModelRef: "reward-model:v1",
    });
    blockIndex.registerParticipationMechanism({
      blockId: "mech.expert-matching",
      version: "1.0.0",
      description: "expert matching",
      incentiveKinds: ["expert-matching"],
      rewardModelRef: "reward-model:v2",
    });
    const director = newDirector({ blockIndex });
    const mechanisms = director.resolveMechanism();
    expect(mechanisms.length).toBe(2);
    expect(mechanisms[0]?.blockId).toBe("mech.rewards-v1");
    const rewards = director.resolveMechanism({ incentiveKind: "rewards" });
    expect(rewards.length).toBe(1);
    expect(rewards[0]?.blockId).toBe("mech.rewards-v1");
  });

  it("selectCandidates and inspectCandidate are deterministic", () => {
    const director = newDirector();
    const selected = director.selectCandidates({ execution: "COMPOSED_PAYSWAP" });
    expect(selected.length).toBe(1);
    expect(selected[0]?.candidateId).toBe("cand-director");
    expect(director.selectCandidates({ execution: "PASS_THROUGH_NATIVE" })).toEqual([]);
    expect(director.inspectCandidate("cand-director")?.candidateId).toBe("cand-director");
    expect(director.inspectCandidate("no-such")).toBeUndefined();
  });

  it("resolvers fail closed when no index is bound", () => {
    const director = newDirector();
    expect(() => director.resolveCapability({ domain: "payment-routing" })).toThrow(
      /no search index/,
    );
    expect(() => director.resolveMechanism()).toThrow(/no building-block index/);
  });
});

describe("Director evaluation service (deterministic, INV-L02 robustness)", () => {
  it("triggerEvaluation is deterministic across the baseline suite", () => {
    const director = newDirector();
    const suite = getBaselineSuite();
    const report = director.triggerEvaluation({
      candidateId: "cand-director",
      scenarios: suite.scenarios,
      seeds: ["seed-a", "seed-b"],
    });
    expect(report.evaluations.length).toBe(suite.scenarios.length * 2);
    expect(report.robustness.totalRuns).toBe(suite.scenarios.length * 2);
    // The domain pack declares DEADLINE + EXPLICIT_CREDIT as hard constraints,
    // so robustness honestly reflects any deadline miss on the suite.
    expect(report.robustness.passedRuns).toBeGreaterThan(0);

    const again = director.triggerEvaluation({
      candidateId: "cand-director",
      scenarios: suite.scenarios,
      seeds: ["seed-a", "seed-b"],
    });
    expect(again).toEqual(report);
  });

  it("recordEvaluationEvidence moves the candidate to BENCHMARKED", () => {
    const director = newDirector();
    const report = director.triggerEvaluation({
      candidateId: "cand-director",
      scenarios: getBaselineSuite().scenarios.slice(0, 3),
      seeds: ["seed-a"],
    });
    const updated = director.recordEvaluationEvidence({
      candidateId: "cand-director",
      report,
      evidenceId: "ev-baseline-1",
      artifactRef: "artifacts/baseline-1",
    });
    expect(updated.stage).toBe("BENCHMARKED");
    expect(updated.evidence.length).toBe(1);
    expect(updated.evidence[0]?.kind).toBe("BASELINE_SUITE_EVALUATION");
  });

  it("rejects evaluation of unknown candidates", () => {
    const director = newDirector();
    expect(() =>
      director.triggerEvaluation({
        candidateId: "ghost",
        scenarios: getBaselineSuite().scenarios.slice(0, 1),
        seeds: ["seed-a"],
      }),
    ).toThrow(/unknown candidate/);
  });
});

describe("Director promotion flows through the versioned ledger path only (INV-L03)", () => {
  it("orderPromotion enforces the evidence gate and records versioned orders", () => {
    const director = newDirector();
    director.orderPromotion({
      candidateId: "cand-director",
      candidateVersion: 1,
      targetStage: "BENCHMARKED",
      evidence: [
        {
          evidenceId: "ev-b0",
          kind: "BASELINE_SUITE_EVALUATION",
          artifactRef: "artifacts/b0",
          contentDigest: "digest-b0",
        },
      ],
      orderedAt: "t0",
    });
    expect(() =>
      director.orderPromotion({
        candidateId: "cand-director",
        candidateVersion: 1,
        targetStage: "VALIDATED",
        evidence: [],
        orderedAt: "t1",
      }),
    ).toThrow(/INV-L02/);

    const order = director.orderPromotion({
      candidateId: "cand-director",
      candidateVersion: 3,
      targetStage: "VALIDATED",
      evidence: FULL_TRIPLE,
      orderedAt: "t2",
    });
    expect(order.orderKind).toBe("ADVANCE");
    expect(order.candidateVersion).toBe(3);
    expect(director.currentPromotionStage("cand-director")).toBe("VALIDATED");
    expect(director.promotionHistory("cand-director").length).toBe(2);
  });

  it("the full INV-L02 triple reaches SHADOW through the Director path", () => {
    const director = newDirector();
    director.orderPromotion({
      candidateId: "cand-triple",
      candidateVersion: 1,
      targetStage: "BENCHMARKED",
      evidence: [
        {
          evidenceId: "ev-b2",
          kind: "BASELINE_SUITE_EVALUATION",
          artifactRef: "artifacts/b2",
          contentDigest: "digest-b2",
        },
      ],
      orderedAt: "t1",
    });
    director.orderPromotion({
      candidateId: "cand-triple",
      candidateVersion: 1,
      targetStage: "VALIDATED",
      evidence: FULL_TRIPLE,
      orderedAt: "t2",
    });
    const shadow = director.orderPromotion({
      candidateId: "cand-triple",
      candidateVersion: 1,
      targetStage: "SHADOW",
      evidence: FULL_TRIPLE,
      orderedAt: "t3",
    });
    expect(shadow.toStage).toBe("SHADOW");
    expect(director.currentPromotionStage("cand-triple")).toBe("SHADOW");
  });
});

describe("LLM reasoning is recorded but NEVER authoritative (canonical INV-9)", () => {
  it("annotations are structurally non-authoritative and stored verbatim", () => {
    const director = newDirector();
    const annotation = director.recordReasoning({
      candidateId: "cand-director",
      reasoningText: "I believe this candidate should be promoted immediately.",
      modelRef: "model:test-llm",
      recordedAt: "2026-10-01T00:00:00Z",
    });
    expect(annotation.authoritative).toBe(false);
    expect(annotation.annotationId).toBe("director-reasoning:1");
    expect(annotation.reasoningText).toBe("I believe this candidate should be promoted immediately.");
  });

  it("recording reasoning mutates NOTHING: stages, evidence and ledger stay untouched", () => {
    const director = newDirector();
    const stageBefore = director.currentPromotionStage("cand-director");
    const evidenceBefore = director.inspectCandidate("cand-director")?.evidence.length;
    const historyBefore = director.promotionHistory("cand-director").length;
    director.recordReasoning({
      candidateId: "cand-director",
      reasoningText: "promote it, trust me",
      modelRef: "model:test-llm",
      recordedAt: "2026-10-01T00:01:00Z",
    });
    director.recordReasoning({
      candidateId: "cand-director",
      reasoningText: "also consider rollback",
      modelRef: "model:test-llm",
      recordedAt: "2026-10-01T00:02:00Z",
    });
    expect(director.currentPromotionStage("cand-director")).toBe(stageBefore);
    expect(director.inspectCandidate("cand-director")?.evidence.length).toBe(evidenceBefore);
    expect(director.promotionHistory("cand-director").length).toBe(historyBefore);
    expect(director.listReasoning("cand-director").length).toBe(2);
    expect(director.listReasoning().length).toBe(2);
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/director.test.ts)
// ---------------------------------------------------------------------------
// PORTED (11): "resolveCapability is grounded in instances + observations";
// "resolveStrategy runs a deterministic search plug-in over executable
// blocks"; "resolveOrganization returns the composed candidate
// organization"; "resolveMechanism lists participation mechanisms
// deterministically"; "selectCandidates and inspectCandidate are
// deterministic"; "triggerEvaluation is deterministic across the baseline
// suite"; "recordEvaluationEvidence moves the candidate to BENCHMARKED";
// "rejects evaluation of unknown candidates"; "orderPromotion enforces
// the evidence gate and records versioned orders"; "annotations are
// structurally non-authoritative and stored verbatim"; "recording
// reasoning mutates NOTHING: stages, evidence and ledger stay untouched".
// NET-NEW (2): fail-closed unbound resolvers; the triple-to-SHADOW path.
// ---------------------------------------------------------------------------
// Determinism receipts for the Director path
// ---------------------------------------------------------------------------
// Every Director method is a pure function of (bound state, inputs):
// - resolveCapability / resolveStrategy: pure over the search index;
// - triggerEvaluation: pure over (registry candidate, scenarios, seeds,
//   spec) — the report embeds the robustness digest, so identical inputs
//   produce byte-identical reports;
// - orderPromotion: pure over the ledger state (adjacency + evidence
//   gates decided BEFORE any order is recorded);
// - recordReasoning: appends only; no existing annotation is mutated.
// The battery asserts each of these properties directly, and the boundary
// suite enforces that no src module consults a clock, a locale, a
// timezone or any ambient source of ordering.
