/**
 * @payswap/adversarial — versioned expert resolutions + the evidence
 * artifacts (P6-W3, lane r4-w3; PORT+ADAPT of payswap.org@8a735bf
 * packages/security/src/experts.ts, split for the ≤400-line file law;
 * the digest becomes the local pin).
 *
 * THE LAW (old INV-L04): expert resolutions are VERSIONED and
 * historical versions remain for learning. `ExpertResolutionLedger`
 * keeps one resolution chain per task; superseding appends version N+1
 * and NEVER removes version N — later better resolutions COEXIST with
 * historical versions; a historical record is never rewritten to make a
 * later candidate look better.
 *
 * EVIDENCE, NEVER HIDDEN AUTHORITY: the ONLY consumable form of an
 * expert resolution is `resolutionToEvidenceArtifact`, which produces a
 * branded ResolutionEvidenceArtifact — an immutable, content-addressed
 * evidence/learning artifact. There is intentionally no conversion to
 * any authorization, trust or financial type.
 *
 * Deterministic only: no ambient clock, no randomness.
 */

import { contentDigest } from "./pins/index.ts";
import type { EvidenceRef } from "./quarantine-ledger.ts";
import type { ExpertTask } from "./experts.ts";

// ---------------------------------------------------------------------------
// Versioned resolutions
// ---------------------------------------------------------------------------

/**
 * One version of an expert resolution for one task. Versions are
 * immutable; superseding creates version N+1 and the historical
 * versions remain retrievable forever.
 *
 * The shape is EVIDENCE-ONLY: findings, a recommendation and evidence
 * refs. There is deliberately no authorization, mandate, grant,
 * approval, epoch or financial field anywhere in this contract.
 */
export interface ExpertResolution {
  /** Stable across versions of the same task. */
  readonly resolutionId: string;
  readonly taskId: string;
  readonly caseId: string;
  readonly expertId: string;
  /** 1-based version; increments on supersession. */
  readonly version: number;
  readonly findings: readonly string[];
  readonly recommendation: string;
  readonly evidence: readonly EvidenceRef[];
  readonly resolvedAt: number;
  readonly contentDigest: string;
  /** Set on historical versions when superseded (never on the current one). */
  readonly supersededBy?: number;
}

/** Raised for invalid resolution operations. */
export class ExpertResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpertResolutionError";
  }
}

function validateEvidence(evidence: readonly EvidenceRef[]): void {
  for (const ref of evidence) {
    if (
      ref.evidenceId.length === 0 ||
      ref.artifactRef.length === 0 ||
      ref.contentDigest.length === 0
    ) {
      throw new ExpertResolutionError("resolution evidence refs must be complete");
    }
  }
}

/** Everything the ledger records (first + superseding resolutions). */
export interface RecordResolutionInput {
  readonly task: ExpertTask;
  readonly expertId: string;
  readonly findings: readonly string[];
  readonly recommendation: string;
  readonly evidence: readonly EvidenceRef[];
  readonly resolvedAt: number;
}

/**
 * The expert resolution ledger: versioned, append-only, immutable
 * history. One resolution chain per task; `recordResolution` opens the
 * chain at version 1 and `recordSupersedingResolution` appends the next
 * version. Historical versions are never removed or edited.
 */
export class ExpertResolutionLedger {
  readonly #chains = new Map<string, ExpertResolution[]>();

  /**
   * Records the FIRST resolution version for a dispatched task. The
   * expert must be the one the task was dispatched to (provenance: the
   * resolution names who produced it).
   */
  recordResolution(input: RecordResolutionInput): ExpertResolution {
    if (this.#chains.has(input.task.taskId)) {
      throw new ExpertResolutionError(
        `task '${input.task.taskId}' already has a resolution; use recordSupersedingResolution to append a new version`,
      );
    }
    if (input.expertId !== input.task.matchedExpertId) {
      throw new ExpertResolutionError(
        `resolution for task '${input.task.taskId}' must come from the dispatched expert '${input.task.matchedExpertId}', not '${input.expertId}'`,
      );
    }
    return this.#append(input.task, input);
  }

  /**
   * Appends the NEXT version for a task that already has a resolution.
   * The previous version stays in the chain (marked superseded) and
   * remains fully retrievable for learning.
   */
  recordSupersedingResolution(input: RecordResolutionInput): ExpertResolution {
    const chain = this.#chains.get(input.task.taskId);
    if (chain === undefined) {
      throw new ExpertResolutionError(
        `task '${input.task.taskId}' has no resolution to supersede; use recordResolution first`,
      );
    }
    if (input.expertId !== input.task.matchedExpertId) {
      throw new ExpertResolutionError(
        `resolution for task '${input.task.taskId}' must come from the dispatched expert '${input.task.matchedExpertId}', not '${input.expertId}'`,
      );
    }
    const latest = chain[chain.length - 1];
    if (latest === undefined || input.resolvedAt < latest.resolvedAt) {
      throw new ExpertResolutionError(
        `superseding resolution at ${input.resolvedAt} cannot precede version ${latest?.version ?? 0} resolved at ${latest?.resolvedAt ?? 0}`,
      );
    }
    return this.#append(input.task, input);
  }

  #append(task: ExpertTask, input: Omit<RecordResolutionInput, "task">): ExpertResolution {
    if (input.recommendation.length === 0) {
      throw new ExpertResolutionError("recommendation must not be empty");
    }
    if (input.evidence.length === 0) {
      throw new ExpertResolutionError(
        "an expert resolution requires at least one evidence ref (expert output without evidence is not evidence)",
      );
    }
    validateEvidence(input.evidence);
    const chain = this.#chains.get(task.taskId) ?? [];
    const version = chain.length + 1;
    const resolutionId = `expert-resolution:${task.taskId}`;
    const resolution: ExpertResolution = Object.freeze({
      resolutionId,
      taskId: task.taskId,
      caseId: task.caseId,
      expertId: input.expertId,
      version,
      findings: Object.freeze([...input.findings]),
      recommendation: input.recommendation,
      evidence: Object.freeze([...input.evidence]),
      resolvedAt: input.resolvedAt,
      contentDigest: contentDigest({
        resolutionId,
        taskId: task.taskId,
        caseId: task.caseId,
        expertId: input.expertId,
        version,
        findings: input.findings,
        recommendation: input.recommendation,
        evidence: input.evidence,
        resolvedAt: input.resolvedAt,
      }),
    });
    if (chain.length > 0) {
      const previous = chain[chain.length - 1];
      if (previous !== undefined) {
        const superseded: ExpertResolution = Object.freeze({
          ...previous,
          supersededBy: version,
        });
        chain[chain.length - 1] = superseded;
      }
    }
    chain.push(resolution);
    this.#chains.set(task.taskId, chain);
    return resolution;
  }

  /** Current (latest) resolution version for a task, when one exists. */
  currentForTask(taskId: string): ExpertResolution | undefined {
    const chain = this.#chains.get(taskId);
    return chain === undefined || chain.length === 0
      ? undefined
      : chain[chain.length - 1];
  }

  /**
   * The FULL version history for a task, version order, historical
   * versions included and marked superseded.
   */
  versionHistoryForTask(taskId: string): readonly ExpertResolution[] {
    return [...(this.#chains.get(taskId) ?? [])];
  }

  /** All resolution chains, insertion order of tasks. */
  listTaskIds(): readonly string[] {
    return [...this.#chains.keys()];
  }
}

// ---------------------------------------------------------------------------
// Evidence artifacts — the ONLY consumable form of expert output
// ---------------------------------------------------------------------------

/**
 * Namespace brand of expert evidence artifacts. Exists at the type
 * level so a ResolutionEvidenceArtifact is structurally distinct from
 * every authorization / trust / financial artifact and can never be
 * assigned where authority is demanded.
 */
export const EXPERT_EVIDENCE_NAMESPACE = "PAYSWAP_EXPERT_EVIDENCE" as const;
export interface ExpertEvidenceNamespaceBrand {
  readonly __payswapExpertEvidence: typeof EXPERT_EVIDENCE_NAMESPACE;
}

/**
 * The immutable evidence/learning artifact produced from an expert
 * resolution. This is what the protocol side (and the learning
 * pipeline) consumes: evidence + findings + recommendation,
 * content-addressed and versioned. It is NOT authority: any protocol
 * decision that builds on it must travel the protocol authorization
 * path, which re-checks policy, compliance and security.
 */
export interface ResolutionEvidenceArtifact extends ExpertEvidenceNamespaceBrand {
  readonly artifactId: string;
  readonly resolutionId: string;
  readonly version: number;
  readonly taskId: string;
  readonly caseId: string;
  readonly expertId: string;
  readonly findings: readonly string[];
  readonly recommendation: string;
  readonly evidence: readonly EvidenceRef[];
  readonly producedAt: number;
  readonly contentDigest: string;
  readonly namespace: typeof EXPERT_EVIDENCE_NAMESPACE;
}

/**
 * Converts a resolution into its evidence artifact — the ONLY
 * conversion this package offers for expert output. There is
 * intentionally no conversion to any authorization, trust or financial
 * type.
 */
export function resolutionToEvidenceArtifact(
  resolution: ExpertResolution,
): ResolutionEvidenceArtifact {
  return Object.freeze({
    __payswapExpertEvidence: EXPERT_EVIDENCE_NAMESPACE,
    artifactId: `expert-evidence:${resolution.taskId}:v${resolution.version}`,
    resolutionId: resolution.resolutionId,
    version: resolution.version,
    taskId: resolution.taskId,
    caseId: resolution.caseId,
    expertId: resolution.expertId,
    findings: resolution.findings,
    recommendation: resolution.recommendation,
    evidence: resolution.evidence,
    producedAt: resolution.resolvedAt,
    contentDigest: resolution.contentDigest,
    namespace: EXPERT_EVIDENCE_NAMESPACE,
  });
}
