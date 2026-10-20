/**
 * @payswap/financial-certification — LAW 5: ambiguous timeout ->
 * UNKNOWN -> reconciliation (P8-W1).
 *
 * A TIMEOUT NEVER RESOLVES TO FAILURE OR SUCCESS DIRECTLY. After a
 * potentially effective external command (dispatched, then timed out /
 * connection lost / unparseably answered), the outcome is UNKNOWN — the
 * pinned provider-runtime classification (INV-04): UNKNOWN is distinct
 * from FAILED and is reconciled rather than blindly retried.
 *
 * - TYPE-LEVEL: `classifyAmbiguousOutcome` returns
 *   `UnknownOutcomeRecord` ONLY — there is no success/failure branch to
 *   express;
 * - MANDATORY RECONCILIATION: every UNKNOWN carries
 *   requiresReconciliation: true, and can ONLY be closed by EXTERNAL
 *   evidence (a provider statement or provider retrieval) — an internal
 *   assumption (a heuristic, a timeout-as-failure guess) never closes
 *   ambiguity;
 * - HONEST OPENNESS: an UNKNOWN that is not yet reconciled stays
 *   honestly open (pendingReconciliation) — it is NEVER auto-resolved;
 * - THE CERTIFIER: `certifyAmbiguityDiscipline` proves the subject
 *   classified every ambiguous transport observation as OUTCOME_UNKNOWN
 *   and closed every resolution with external evidence.
 */

import { ConformanceError } from "./errors.ts";
import { conformanceVerdict, type ConformanceVerdict } from "./laws.ts";
import type { PinnedAmbiguityReason } from "./pins/provider-runtime.ts";

/** The ambiguous transport observations (the pinned ambiguity reasons). */
export type AmbiguousTransportObservation =
  | { readonly kind: "TIMEOUT_AFTER_DISPATCH" }
  | { readonly kind: "CONNECTION_LOST_AFTER_DISPATCH" }
  | { readonly kind: "MALFORMED_RESPONSE_AFTER_DISPATCH" };

/** The UNKNOWN record — the ONLY outcome an ambiguity can classify to. */
export interface UnknownOutcomeRecord {
  readonly outcome: "OUTCOME_UNKNOWN";
  readonly requiresReconciliation: true;
  readonly ambiguityReason: PinnedAmbiguityReason;
}

/**
 * THE structural law: an ambiguous transport observation classifies to
 * UNKNOWN with mandatory reconciliation — the return type admits
 * nothing else (a timeout can never resolve to failure or success).
 */
export function classifyAmbiguousOutcome(
  observation: AmbiguousTransportObservation,
): UnknownOutcomeRecord {
  switch (observation.kind) {
    case "TIMEOUT_AFTER_DISPATCH":
      return {
        outcome: "OUTCOME_UNKNOWN",
        requiresReconciliation: true,
        ambiguityReason: "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
      };
    case "CONNECTION_LOST_AFTER_DISPATCH":
      return {
        outcome: "OUTCOME_UNKNOWN",
        requiresReconciliation: true,
        ambiguityReason: "TRANSPORT_CONNECTION_LOST_AFTER_DISPATCH",
      };
    case "MALFORMED_RESPONSE_AFTER_DISPATCH":
      return {
        outcome: "OUTCOME_UNKNOWN",
        requiresReconciliation: true,
        ambiguityReason: "MALFORMED_RESPONSE_AFTER_DISPATCH",
      };
    default:
      throw new ConformanceError(
        `unknown ambiguous transport observation '${String(observation)}'`,
      );
  }
}

/** The sources that can close an UNKNOWN — EXTERNAL ONLY. */
export const RECONCILIATION_EVIDENCE_SOURCES = [
  "EXTERNAL_PROVIDER_STATEMENT",
  "EXTERNAL_PROVIDER_RETRIEVAL",
] as const;

export type ReconciliationEvidenceSource =
  (typeof RECONCILIATION_EVIDENCE_SOURCES)[number];

/** The external evidence that closes an ambiguity. */
export interface ReconciliationEvidence {
  readonly source: ReconciliationEvidenceSource;
  readonly evidenceRefs: readonly string[];
}

/** The result of closing an UNKNOWN with external evidence. */
export interface ResolvedUnknown {
  readonly commandRef: string;
  readonly resolvedTo: "CONFIRMED" | "FAILED";
  readonly closedBy: ReconciliationEvidence;
}

/**
 * Resolves an UNKNOWN with EXTERNAL evidence ONLY: an internal source
 * (a heuristic, a guess, a timeout-as-failure assumption) throws —
 * ambiguity is never closed from inside.
 */
export function resolveUnknownOutcome(input: {
  readonly commandRef: string;
  readonly resolvedTo: "CONFIRMED" | "FAILED";
  readonly evidence: { readonly source: string; readonly evidenceRefs: readonly string[] };
}): ResolvedUnknown {
  if (input.commandRef.length === 0) {
    throw new ConformanceError("a resolution requires a commandRef");
  }
  if (
    !(RECONCILIATION_EVIDENCE_SOURCES as readonly string[]).includes(
      input.evidence.source,
    )
  ) {
    throw new ConformanceError(
      `command '${input.commandRef}': ambiguity cannot be closed by '${input.evidence.source}' — only external evidence (provider statement/retrieval) can close an UNKNOWN`,
    );
  }
  if (input.evidence.evidenceRefs.length === 0) {
    throw new ConformanceError(
      `command '${input.commandRef}': closing an UNKNOWN requires non-empty external evidence references`,
    );
  }
  return Object.freeze({
    commandRef: input.commandRef,
    resolvedTo: input.resolvedTo,
    closedBy: Object.freeze({
      source: input.evidence.source as ReconciliationEvidenceSource,
      evidenceRefs: Object.freeze([...input.evidence.evidenceRefs]),
    }),
  });
}

/** One ambiguous attempt the subject recorded (its artifact). */
export interface RecordedAmbiguousAttempt {
  readonly commandRef: string;
  readonly transport: AmbiguousTransportObservation;
  /** What the subject classified the attempt as. */
  readonly classifiedOutcome: string;
}

/** One resolution the subject recorded (its artifact). */
export interface RecordedUnknownResolution {
  readonly commandRef: string;
  readonly resolvedTo: "CONFIRMED" | "FAILED";
  readonly closedBy: { readonly source: string; readonly evidenceRefs: readonly string[] };
}

/** The discipline-certification summary (beyond pass/fail). */
export interface AmbiguityDisciplineSummary {
  readonly attempts: number;
  readonly resolutions: number;
  readonly pendingReconciliation: number;
}

/**
 * CERTIFIES the ambiguity discipline (FIN-LAW-05) over the subject's
 * recorded attempts and resolutions: every ambiguous transport
 * observation classified OUTCOME_UNKNOWN (never FAILED/SUCCEEDED
 * directly); every resolution closed by external evidence; resolutions
 * only for commands that actually entered UNKNOWN. Unresolved UNKNOWNs
 * are honestly open (counted, not violated).
 */
export function certifyAmbiguityDiscipline(input: {
  readonly subjectRef: string;
  readonly attempts: readonly RecordedAmbiguousAttempt[];
  readonly resolutions: readonly RecordedUnknownResolution[];
  readonly evidenceRefs: readonly string[];
}): { readonly verdict: ConformanceVerdict; readonly summary: AmbiguityDisciplineSummary } {
  const violations: string[] = [];
  const ambiguousCommands = new Set<string>();
  for (const attempt of input.attempts) {
    if (attempt.commandRef.length === 0) {
      throw new ConformanceError("an ambiguous attempt requires a commandRef");
    }
    ambiguousCommands.add(attempt.commandRef);
    if (attempt.classifiedOutcome !== "OUTCOME_UNKNOWN") {
      violations.push(
        `FIN-LAW-05 (direct resolution): command '${attempt.commandRef}' under ${attempt.transport.kind} was classified '${attempt.classifiedOutcome}' — a timeout NEVER resolves to failure or success directly; it enters UNKNOWN`,
      );
    }
  }
  const resolvedCommands = new Set<string>();
  for (const resolution of input.resolutions) {
    if (!ambiguousCommands.has(resolution.commandRef)) {
      violations.push(
        `FIN-LAW-05 (phantom resolution): command '${resolution.commandRef}' was resolved but never entered UNKNOWN`,
      );
      continue;
    }
    resolvedCommands.add(resolution.commandRef);
    if (
      !(RECONCILIATION_EVIDENCE_SOURCES as readonly string[]).includes(
        resolution.closedBy.source,
      )
    ) {
      violations.push(
        `FIN-LAW-05 (internal closure): command '${resolution.commandRef}' was closed by '${resolution.closedBy.source}' — only EXTERNAL evidence can close an UNKNOWN`,
      );
    }
    if (resolution.closedBy.evidenceRefs.length === 0) {
      violations.push(
        `FIN-LAW-05 (evidence-free closure): command '${resolution.commandRef}' was resolved with NO external evidence references`,
      );
    }
  }
  const verdict = conformanceVerdict({
    lawId: "FIN-LAW-05",
    scenarioId: "AMBIGUOUS_TIMEOUT_RECONCILIATION",
    subjectRef: input.subjectRef,
    violations,
    evidenceRefs: input.evidenceRefs,
  });
  return {
    verdict,
    summary: {
      attempts: input.attempts.length,
      resolutions: input.resolutions.length,
      pendingReconciliation: input.attempts.length - resolvedCommands.size,
    },
  };
}
