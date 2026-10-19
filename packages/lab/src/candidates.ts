/**
 * Lab candidate registry and authority-free organization composition
 * (P6-W1; the P6 rebuild of the old payswap.org@8a735bf packages/lab
 * candidates.ts, W2-004 — LAB.md "Promotion" + the Director's candidate
 * registry).
 *
 * INV-9 (old INV-G03) — an agent/Lab proposal NEVER mutates financial
 * truth. A Lab candidate is a PROPOSAL artifact:
 * - it composes certified smart-contract capabilities,
 *   DECLARED_CAPABILITY blocks, connector capabilities and participation
 *   mechanisms into a candidate Organization DRAFT (pure data, pinned
 *   agents-lane shapes);
 * - the composed organization carries NO budgets and NO delegation edges:
 *   the Lab cannot grant spending authority, only the protocol authority
 *   path can;
 * - the registry exposes no API that accepts or produces a protocol
 *   command, authorization artifact or ledger write.
 *
 * The published-version discipline: a PUBLISHED candidate version is an
 * immutable, content-addressed snapshot. Changes require a new version;
 * history is never silently rewritten.
 */

import { canonicalize, deepFreeze, fnv1a64 } from "./canonical.ts";
import type { SimulationProgram } from "./simulation-plan.ts";
import type { LabBuildingBlockKind } from "./domain-packs.ts";
import type {
  PinnedAgentBody,
  PinnedAgentInstance,
  PinnedAgentPrincipalRef,
  PinnedOrganizationDraft,
  PinnedVersionedRef,
} from "./pins/agents.ts";
import type { PinnedExecutionMode } from "./pins/capability.ts";
import { CandidateRegistryError } from "./errors.ts";

// ---------------------------------------------------------------------------
// Candidate shapes
// ---------------------------------------------------------------------------

/** Lab-side lifecycle before promotion takes over (promotion.ts owns SHADOW+). */
export const CANDIDATE_STAGES = ["DRAFT", "BENCHMARKED", "VALIDATED"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

/** Total predicate over the candidate-stage vocabulary. */
export function isCandidateStage(value: unknown): value is CandidateStage {
  return (
    typeof value === "string" &&
    (CANDIDATE_STAGES as readonly unknown[]).includes(value)
  );
}

/** Reference to one building block composed into the candidate. */
export interface CandidateBuildingBlockRef {
  readonly blockKind: LabBuildingBlockKind;
  readonly blockId: string;
  readonly version: string;
}

/** Evidence attached to a candidate while it matures. */
export type CandidateEvidenceKind =
  | "BASELINE_SUITE_EVALUATION"
  | "REPLAY"
  | "COUNTERFACTUAL"
  | "ROBUSTNESS";

export interface CandidateEvidenceRef {
  readonly evidenceId: string;
  readonly kind: CandidateEvidenceKind;
  readonly artifactRef: string;
  readonly contentDigest: string;
}

export interface LabCandidate {
  readonly candidateId: string;
  readonly title: string;
  readonly domainPackId: string;
  readonly origin: string;
  readonly execution: PinnedExecutionMode;
  readonly program: SimulationProgram;
  readonly buildingBlocks: readonly CandidateBuildingBlockRef[];
  /**
   * The composed candidate organization (a DRAFT — never released, never
   * budgeted, never delegated; INV-9).
   */
  readonly organization: PinnedOrganizationDraft;
  readonly evidence: readonly CandidateEvidenceRef[];
  readonly stage: CandidateStage;
}


/** An immutable, content-addressed published candidate version. */
export interface PublishedCandidateVersion {
  readonly candidateId: string;
  readonly version: number;
  readonly snapshot: LabCandidate;
  readonly publishedAt: string;
  readonly contentDigest: string;
}

// ---------------------------------------------------------------------------
// Composition into candidate Organizations (INV-9)
// ---------------------------------------------------------------------------

export const LAB_PROPOSAL_ONLY_CONSTRAINT =
  "LAB_COMPOSITION_IS_A_PROPOSAL_NOT_A_GRANT";

export interface ComposeCandidateOrganizationInput {
  readonly candidateId: string;
  readonly domainPackId: string;
  readonly body: PinnedVersionedRef;
  readonly principal: PinnedAgentPrincipalRef;
  readonly domainHardConstraints: readonly string[];
  readonly buildingBlocks: readonly CandidateBuildingBlockRef[];
  readonly evaluationSuiteRef: string;
}

/**
 * Composes building blocks into a candidate Organization DRAFT.
 *
 * The draft is deliberately authority-free: no budgets (a Lab proposal
 * carries no spending authority), no delegation edges (no mandate is
 * granted), no communication edges, ephemeral isolated memory, and a
 * safety policy whose FIRST hard constraint is the proposal-only rule
 * (INV-9). Releasing, budgeting or delegating happens exclusively on the
 * protocol authority path outside the Lab.
 */
export function composeCandidateOrganization(
  input: ComposeCandidateOrganizationInput,
): PinnedOrganizationDraft {
  const instance: PinnedAgentInstance = {
    id: `${input.candidateId}:instance-1`,
    bodyRef: input.body,
    principal: input.principal,
    runtimeState: { status: "IDLE" },
  };
  return {
    id: `org:${input.candidateId}`,
    version: 1,
    bodies: [input.body],
    instances: [instance],
    communicationEdges: [],
    delegationEdges: [],
    memory: { scope: "isolated", retention: "ephemeral" },
    budgets: [],
    evaluators: [{ evaluationSuiteRef: input.evaluationSuiteRef }],
    termination: {
      conditions: ["HARD_CONSTRAINT_VIOLATION", "EVALUATION_REGRESSION"],
      requiresHumanApproval: true,
    },
    safetyPolicy: {
      hardConstraints: [
        LAB_PROPOSAL_ONLY_CONSTRAINT,
        ...input.domainHardConstraints,
      ],
      escalationSurfaceRef: "protocol://financial-authority/escalation",
    },
  };
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

/**
 * The Lab candidate registry (LAB.md "Director — candidate registry").
 * Deterministic in-memory store: insertion order is preserved; published
 * versions are immutable snapshots.
 */
export class CandidateRegistry {
  private readonly candidates = new Map<string, LabCandidate>();
  private readonly published = new Map<string, PublishedCandidateVersion[]>();

  register(input: {
    candidateId: string;
    title: string;
    domainPackId: string;
    origin: string;
    execution: PinnedExecutionMode;
    program: SimulationProgram;
    buildingBlocks?: readonly CandidateBuildingBlockRef[];
    organization?: PinnedOrganizationDraft;
  }): LabCandidate {
    if (input.candidateId.length === 0) {
      throw new CandidateRegistryError("candidateId must not be empty");
    }
    if (this.candidates.has(input.candidateId)) {
      throw new CandidateRegistryError(
        `candidate '${input.candidateId}' is already registered`,
      );
    }
    const organization: PinnedOrganizationDraft =
      input.organization ??
      composeCandidateOrganization({
        candidateId: input.candidateId,
        domainPackId: input.domainPackId,
        body: { id: "body.lab-candidate", version: 1 },
        principal: {
          agentKeyFingerprint: "sha256:lab-candidate",
          ownerRef: `owner:${input.candidateId}`,
        },
        domainHardConstraints: [],
        buildingBlocks: input.buildingBlocks ?? [],
        evaluationSuiteRef: "lab.baseline-suite",
      });
    const candidate: LabCandidate = deepFreeze({
      candidateId: input.candidateId,
      title: input.title,
      domainPackId: input.domainPackId,
      origin: input.origin,
      execution: input.execution,
      program: input.program,
      buildingBlocks: [...(input.buildingBlocks ?? [])],
      organization,
      evidence: [],
      stage: "DRAFT",
    });
    this.candidates.set(input.candidateId, candidate);
    return candidate;
  }

  get(candidateId: string): LabCandidate | undefined {
    return this.candidates.get(candidateId);
  }

  /** Deterministic listing: registration order. */
  list(): readonly LabCandidate[] {
    return [...this.candidates.values()];
  }

  /**
   * Attaches evidence to a candidate. BASELINE_SUITE_EVALUATION evidence
   * moves DRAFT -> BENCHMARKED; the full INV-L02 triple (REPLAY +
   * COUNTERFACTUAL + ROBUSTNESS) moves BENCHMARKED -> VALIDATED. Anything
   * else is a registry error (no override path).
   */
  attachEvidence(input: {
    candidateId: string;
    evidence: readonly CandidateEvidenceRef[];
  }): LabCandidate {
    const current = this.candidates.get(input.candidateId);
    if (current === undefined) {
      throw new CandidateRegistryError(
        `unknown candidate '${input.candidateId}'`,
      );
    }
    if (current.stage === "VALIDATED") {
      // Validated is the registry's terminal stage; further evidence is
      // promotion-ledger territory (SHADOW/CANARY/PRODUCTION/RETIRED).
      throw new CandidateRegistryError(
        `candidate '${input.candidateId}' is VALIDATED: promotion is owned by the versioned promotion ledger (INV-L02/L03)`,
      );
    }
    const kinds = new Set(input.evidence.map((ref) => ref.kind));
    if (input.evidence.length === 0) {
      throw new CandidateRegistryError("evidence must not be empty");
    }
    if (current.stage === "DRAFT") {
      if (!kinds.has("BASELINE_SUITE_EVALUATION")) {
        throw new CandidateRegistryError(
          "a DRAFT candidate moves to BENCHMARKED only on BASELINE_SUITE_EVALUATION evidence",
        );
      }
    } else if (current.stage === "BENCHMARKED") {
      const required: CandidateEvidenceKind[] = [
        "REPLAY",
        "COUNTERFACTUAL",
        "ROBUSTNESS",
      ];
      const missing = required.filter((kind) => !kinds.has(kind));
      if (missing.length > 0) {
        throw new CandidateRegistryError(
          `a BENCHMARKED candidate reaches VALIDATED only on the INV-L02 triple; missing: ${missing.join(", ")}`,
        );
      }
    }
    const nextStage: CandidateStage =
      current.stage === "DRAFT" ? "BENCHMARKED" : "VALIDATED";
    const updated: LabCandidate = deepFreeze({
      ...current,
      evidence: [...current.evidence, ...input.evidence],
      stage: nextStage,
    });
    this.candidates.set(input.candidateId, updated);
    return updated;
  }

  /**
   * Publishes an immutable, content-addressed snapshot of the candidate.
   * The version sequence is per-candidate and starts at 1.
   */
  publish(input: {
    candidateId: string;
    publishedAt: string;
  }): PublishedCandidateVersion {
    const current = this.candidates.get(input.candidateId);
    if (current === undefined) {
      throw new CandidateRegistryError(
        `unknown candidate '${input.candidateId}'`,
      );
    }
    const version = (this.published.get(input.candidateId)?.length ?? 0) + 1;
    const contentDigest = fnv1a64(
      canonicalize({ candidate: current, version, publishedAt: input.publishedAt }),
    );
    const snapshot: PublishedCandidateVersion = deepFreeze({
      candidateId: input.candidateId,
      version,
      snapshot: current,
      publishedAt: input.publishedAt,
      contentDigest,
    });
    const existing = this.published.get(input.candidateId) ?? [];
    this.published.set(input.candidateId, [...existing, snapshot]);
    return snapshot;
  }

  /** The immutable published history of a candidate (oldest first). */
  publishedHistory(
    candidateId: string,
  ): readonly PublishedCandidateVersion[] {
    return [...(this.published.get(candidateId) ?? [])];
  }
}
