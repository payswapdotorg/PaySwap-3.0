import { describe, expect, it } from "vitest";
import {
  CANDIDATE_STAGES,
  CandidateRegistry,
  LAB_PROPOSAL_ONLY_CONSTRAINT,
  PAYMENT_ROUTING_DOMAIN_PACK,
  composeCandidateOrganization,
  isCandidateStage,
} from "@payswap/lab";
import type { CandidateBuildingBlockRef, SimulationProgram } from "@payswap/lab";
import { CANDIDATE_BODY_REF, CANDIDATE_PRINCIPAL } from "./fixtures.ts";

/**
 * Candidate registry: composition without authority (canonical INV-9) and
 * immutable published versions (P6-W1 rebuild of the old W2-004 suite —
 * the candidate-lifecycle half; the building-block half lives in
 * domain-packs.test.ts).
 
 * Site classification (this file): 6 old sites PORTED (the old
 * candidate-registry half of the old candidates suite: authority-free
 * organization composition, no protocol command on the record, registry
 * operations leave authority state untouched, the DRAFT -> BENCHMARKED ->
 * VALIDATED lifecycle, immutable published versions, duplicate/unknown
 * rejection) + 2 NET-NEW sites (the default composed organization obeys
 * the proposal-only law; the evidence-stage discipline receipt) = 8
 * tests. The building-block half of the old suite lives in
 * domain-packs.test.ts.
 */

const PROGRAM: SimulationProgram = {
  programId: "cand.program",
  programVersion: "1.0.0",
  routePreference: ["rail-a", "rail-b"],
  useNetting: true,
  useNetworkCredit: true,
  delayToleranceSteps: 2,
  fraudScreening: true,
  privacyBounded: true,
  authorizationMode: "PROTOCOL_AUTHORIZED",
};

const BLOCKS: readonly CandidateBuildingBlockRef[] = [
  { blockKind: "CONNECTOR_CAPABILITY", blockId: "psp.native-routing", version: "1.0.0" },
  { blockKind: "CERTIFIED_SMART_CONTRACT", blockId: "sc.netting-pool", version: "1.0.0" },
  { blockKind: "DECLARED_CAPABILITY", blockId: "svc.fraud-scoring", version: "1.0.0" },
  { blockKind: "PARTICIPATION_MECHANISM", blockId: "mech.rewards-v1", version: "1.0.0" },
];

function createDefaultCandidate(registry: CandidateRegistry) {
  return registry.register({
    candidateId: "cand-1",
    title: "netting + native incumbent composition",
    domainPackId: PAYMENT_ROUTING_DOMAIN_PACK.packId,
    origin: "deterministic-baseline",
    execution: "COMPOSED_PAYSWAP",
    program: PROGRAM,
    buildingBlocks: BLOCKS,
    organization: composeCandidateOrganization({
      candidateId: "cand-1",
      domainPackId: PAYMENT_ROUTING_DOMAIN_PACK.packId,
      body: CANDIDATE_BODY_REF,
      principal: CANDIDATE_PRINCIPAL,
      domainHardConstraints: PAYMENT_ROUTING_DOMAIN_PACK.hardConstraints,
      buildingBlocks: BLOCKS,
      evaluationSuiteRef: PAYMENT_ROUTING_DOMAIN_PACK.evaluationSuite.suiteId,
    }),
  });
}

describe("candidate composition grants NO Lab authority (canonical INV-9)", () => {
  it("composes certified smart contracts and capabilities into an authority-free Organization DRAFT", () => {
    const organization = composeCandidateOrganization({
      candidateId: "cand-org",
      domainPackId: PAYMENT_ROUTING_DOMAIN_PACK.packId,
      body: CANDIDATE_BODY_REF,
      principal: CANDIDATE_PRINCIPAL,
      domainHardConstraints: PAYMENT_ROUTING_DOMAIN_PACK.hardConstraints,
      buildingBlocks: BLOCKS,
      evaluationSuiteRef: PAYMENT_ROUTING_DOMAIN_PACK.evaluationSuite.suiteId,
    });
    expect(organization.id).toBe("org:cand-org");
    // No budgets, no delegation edges, no communication edges — the Lab
    // cannot grant spending authority or mandates.
    expect(organization.budgets).toEqual([]);
    expect(organization.delegationEdges).toEqual([]);
    expect(organization.communicationEdges).toEqual([]);
    expect(organization.memory).toEqual({ scope: "isolated", retention: "ephemeral" });
    // The FIRST hard constraint is the proposal-only rule.
    expect(organization.safetyPolicy.hardConstraints[0]).toBe(LAB_PROPOSAL_ONLY_CONSTRAINT);
    expect(organization.instances.length).toBe(1);
    expect(organization.instances[0]?.runtimeState.status).toBe("IDLE");
    expect(organization.termination.requiresHumanApproval).toBe(true);
  });

  it("the candidate record carries no protocol command or authorization artifact", () => {
    const registry = new CandidateRegistry();
    const candidate = createDefaultCandidate(registry);
    const record = candidate as unknown as Record<string, unknown>;
    for (const forbidden of ["command", "authorization", "ledgerWrite", "mandate"]) {
      expect(record[forbidden]).toBeUndefined();
    }
    expect(candidate.execution).toBe("COMPOSED_PAYSWAP");
    expect(candidate.buildingBlocks.length).toBe(4);
    expect(Object.isFrozen(candidate)).toBe(true);
  });

  it("registry operations leave an external authority state untouched (Lab selection cannot mutate financial authority)", () => {
    const registry = new CandidateRegistry();
    createDefaultCandidate(registry);
    // The authority state is OUTSIDE the Lab: the registry exposes no API
    // surface that could reach it (structural receipt — the exported
    // registry methods are data/lifecycle operations only).
    const exportedMethods = Object.getOwnPropertyNames(CandidateRegistry.prototype).sort();
    expect(exportedMethods).toEqual([
      "attachEvidence",
      "constructor",
      "get",
      "list",
      "publish",
      "publishedHistory",
      "register",
    ]);
  });
});

describe("candidate lifecycle and immutable published versions", () => {
  it("starts at DRAFT, benchmarks on baseline evaluation, validates on the INV-L02 triple", () => {
    const registry = new CandidateRegistry();
    const draft = createDefaultCandidate(registry);
    expect(draft.stage).toBe("DRAFT");

    const benchmarked = registry.attachEvidence({
      candidateId: "cand-1",
      evidence: [
        {
          evidenceId: "ev-baseline",
          kind: "BASELINE_SUITE_EVALUATION",
          artifactRef: "artifacts/baseline",
          contentDigest: "digest-baseline",
        },
      ],
    });
    expect(benchmarked.stage).toBe("BENCHMARKED");

    const validated = registry.attachEvidence({
      candidateId: "cand-1",
      evidence: (["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS"] as const).map((kind) => ({
        evidenceId: `ev-${kind}`,
        kind,
        artifactRef: `artifacts/${kind}`,
        contentDigest: `digest-${kind}`,
      })),
    });
    expect(validated.stage).toBe("VALIDATED");

    // The stage vocabulary is a total predicate.
    for (const stage of CANDIDATE_STAGES) expect(isCandidateStage(stage)).toBe(true);
    expect(isCandidateStage("SHADOW")).toBe(false); // promotion-ledger territory
  });

  it("published versions are immutable snapshots; history is preserved across new versions", () => {
    const registry = new CandidateRegistry();
    createDefaultCandidate(registry);
    const v1 = registry.publish({ candidateId: "cand-1", publishedAt: "2026-10-01T00:00:00Z" });
    expect(v1.version).toBe(1);
    expect(v1.contentDigest).toMatch(/^labfnv1a64:[0-9a-f]{16}$/);

    registry.attachEvidence({
      candidateId: "cand-1",
      evidence: [
        {
          evidenceId: "ev-b2",
          kind: "BASELINE_SUITE_EVALUATION",
          artifactRef: "artifacts/b2",
          contentDigest: "digest-b2",
        },
      ],
    });
    const v2 = registry.publish({ candidateId: "cand-1", publishedAt: "2026-10-02T00:00:00Z" });
    expect(v2.version).toBe(2);
    expect(v2.snapshot.stage).toBe("BENCHMARKED");
    expect(v1.snapshot.stage).toBe("DRAFT"); // v1 untouched

    const history = registry.publishedHistory("cand-1");
    expect(history.length).toBe(2);
    expect(history[0]?.version).toBe(1);
    expect(history[1]?.version).toBe(2);

    // Mutation of a published snapshot throws (immutable history).
    expect(() => {
      (v1 as { version: number }).version = 99;
    }).toThrow();
  });

  it("rejects duplicate candidate ids and unknown candidates", () => {
    const registry = new CandidateRegistry();
    createDefaultCandidate(registry);
    expect(() => createDefaultCandidate(registry)).toThrow(/already registered/);
    expect(() =>
      registry.attachEvidence({
        candidateId: "ghost",
        evidence: [
          {
            evidenceId: "ev-x",
            kind: "BASELINE_SUITE_EVALUATION",
            artifactRef: "artifacts/x",
            contentDigest: "digest-x",
          },
        ],
      }),
    ).toThrow(/unknown candidate/);
    expect(registry.get("ghost")).toBeUndefined();
    expect(() => registry.publish({ candidateId: "ghost", publishedAt: "t" })).toThrow(
      /unknown candidate/,
    );
  });

  it("registering without an explicit organization composes a default authority-free DRAFT", () => {
    const registry = new CandidateRegistry();
    const candidate = registry.register({
      candidateId: "cand-default-org",
      title: "default composition",
      domainPackId: PAYMENT_ROUTING_DOMAIN_PACK.packId,
      origin: "test",
      execution: "OPTIMIZED_MULTI_PROVIDER",
      program: PROGRAM,
    });
    // The default composed organization obeys the same proposal-only law.
    expect(candidate.organization.budgets).toEqual([]);
    expect(candidate.organization.delegationEdges).toEqual([]);
    expect(candidate.organization.safetyPolicy.hardConstraints[0]).toBe(
      LAB_PROPOSAL_ONLY_CONSTRAINT,
    );
    expect(candidate.organization.memory.scope).toBe("isolated");
    expect(candidate.buildingBlocks).toEqual([]);
  });

  it("evidence-stage discipline: a DRAFT cannot skip to VALIDATED; VALIDATED is ledger territory", () => {
    const registry = new CandidateRegistry();
    createDefaultCandidate(registry);
    expect(() =>
      registry.attachEvidence({
        candidateId: "cand-1",
        evidence: [
          {
            evidenceId: "ev-triple",
            kind: "REPLAY",
            artifactRef: "artifacts/r",
            contentDigest: "digest-r",
          },
        ],
      }),
    ).toThrow(/BENCHMARKED only on BASELINE_SUITE_EVALUATION/);

    const validatedRegistry = new CandidateRegistry();
    const candidate = validatedRegistry.register({
      candidateId: "cand-fast",
      title: "fast path",
      domainPackId: PAYMENT_ROUTING_DOMAIN_PACK.packId,
      origin: "test",
      execution: "PASS_THROUGH_NATIVE",
      program: PROGRAM,
    });
    validatedRegistry.attachEvidence({
      candidateId: "cand-fast",
      evidence: [
        {
          evidenceId: "ev-b",
          kind: "BASELINE_SUITE_EVALUATION",
          artifactRef: "artifacts/b",
          contentDigest: "digest-b",
        },
      ],
    });
    validatedRegistry.attachEvidence({
      candidateId: "cand-fast",
      evidence: (["REPLAY", "COUNTERFACTUAL", "ROBUSTNESS"] as const).map((kind) => ({
        evidenceId: `ev-${kind}`,
        kind,
        artifactRef: `artifacts/${kind}`,
        contentDigest: `digest-${kind}`,
      })),
    });
    expect(candidate.stage).toBe("DRAFT"); // snapshots are immutable
    expect(() =>
      validatedRegistry.attachEvidence({
        candidateId: "cand-fast",
        evidence: [
          {
            evidenceId: "ev-late",
            kind: "REPLAY",
            artifactRef: "artifacts/sr",
            contentDigest: "digest-sr",
          },
        ],
      }),
    ).toThrow(/promotion is owned by the versioned promotion ledger/);
  });
});
// ---------------------------------------------------------------------------
// Old-site ledger (payswap.org@8a735bf packages/lab/test/candidates.test.ts,
// candidate-registry half)
// ---------------------------------------------------------------------------
// PORTED (6): "composes certified smart contracts and capabilities into an
// authority-free Organization DRAFT"; "the candidate record carries no
// protocol command or authorization artifact"; "registry operations leave
// an external authority state untouched"; "starts at DRAFT, benchmarks on
// baseline evaluation, validates on the INV-L02 triple"; "published
// versions are immutable snapshots; history is preserved across new
// versions"; "rejects duplicate candidate ids and unknown candidates".
// NET-NEW (2): the default composed organization; evidence-stage
// discipline.
// ---------------------------------------------------------------------------
// Registry API receipts (the proposal-only law, mechanically checked)
// ---------------------------------------------------------------------------
// The registry exposes exactly seven prototype methods — register, get,
// list, attachEvidence, publish, publishedHistory, constructor — and NOT
// ONE of them accepts or produces a protocol command, an authorization
// artifact, a ledger write or a mandate. The composed organization is
// structurally authority-free: empty budgets, empty delegation edges,
// empty communication edges, isolated ephemeral memory, and a safety
// policy whose FIRST hard constraint is LAB_COMPOSITION_IS_A_PROPOSAL_
// NOT_A_GRANT. Published snapshots are content-addressed (the digest
// covers candidate + version + publishedAt) and frozen; a new publish
// appends to the history and never rewrites a prior version.
//
// The lifecycle is evidence-gated at every step: DRAFT -> BENCHMARKED on
// BASELINE_SUITE_EVALUATION; BENCHMARKED -> VALIDATED on the full INV-L02
// triple (REPLAY + COUNTERFACTUAL + ROBUSTNESS); VALIDATED is terminal on
// the registry side — the promotion ledger owns everything after.
// ---------------------------------------------------------------------------
// Lifecycle receipts (restated for the battery ledger)
// ---------------------------------------------------------------------------
// register validates the candidateId for non-emptiness and uniqueness and
// returns a deep-frozen DRAFT; attachEvidence is the ONLY stage-mutating
// method and it is evidence-gated; publish appends a content-addressed
// immutable snapshot with a per-candidate version sequence starting at 1;
// publishedHistory returns the full append-only lineage. The frozen
// snapshot makes any mutation attempt throw — the immutability receipt
// is mechanical, not aspirational.
