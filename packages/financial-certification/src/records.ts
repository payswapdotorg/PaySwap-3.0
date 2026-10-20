/**
 * @payswap/financial-certification — LAW 8: versioned, digest-chained
 * certification records (P8-W1).
 *
 * Every certification record carries VERSIONED, DIGEST-CHAINED
 * evidence and is a BYTE-DETERMINISTIC function of its inputs:
 *
 * - each record is frozen with recordVersion: 1 and a recordDigest
 *   recomputed over every field INCLUDING the previous record's digest
 *   (the chain: tampering with any historical record breaks every
 *   later digest);
 * - the ledger is APPEND-ONLY (record ids are never reused; history is
 *   never rewritten);
 * - `certificationRecordBytes` renders any record to the canonical
 *   byte form — two records built from identical inputs are
 *   byte-identical;
 * - every record's evidence passes the LIVE-CLAIM scan (LAW 9): no
 *   evidence kind may claim live-corridor authority.
 *
 * Deterministic only: digests are content addresses; `recordedAt` is a
 * caller-declared string.
 */

import { canonicalString, contentDigest } from "./digest.ts";
import { CertificationRecordError } from "./errors.ts";
import { assertNoLiveClaims, isForbiddenLiveEvidenceKind } from "./live-corridor.ts";
import type { FinancialCertificationSubjectRef, SuiteEvaluationResult } from "./suites.ts";

/** One evidence artifact backing a certification record. */
export interface CertificationEvidence {
  readonly evidenceId: string;
  /** The honest kind (the hermetic marker; live-claiming kinds are rejected). */
  readonly kind: string;
  readonly artifactRef: string;
  readonly contentDigest: string;
}

/** The wall summary a record carries (from the gate-wall result). */
export interface CertificationWallSummary {
  readonly passed: boolean;
  readonly wallDigest: string;
  readonly failedGates: readonly string[];
}

/** A versioned, digest-chained certification record. */
export interface ChainedCertificationRecord {
  readonly recordId: string;
  readonly recordVersion: 1;
  readonly subject: FinancialCertificationSubjectRef;
  readonly suiteId: string;
  readonly suiteVersion: number;
  readonly evaluation: SuiteEvaluationResult;
  readonly wall: CertificationWallSummary;
  readonly evidence: readonly CertificationEvidence[];
  /** The digest of the previous record in the chain (null at genesis). */
  readonly previousRecordDigest: string | null;
  readonly recordedAt: string;
  readonly recordDigest: string;
}

const DIGEST_SHAPE = /^fnv1a64:[0-9a-f]{16}$/;

function validateEvidence(
  evidence: readonly CertificationEvidence[],
  subject: string,
): void {
  for (const entry of evidence) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      entry.evidenceId.length === 0 ||
      entry.kind.length === 0 ||
      entry.artifactRef.length === 0 ||
      entry.contentDigest.length === 0
    ) {
      throw new CertificationRecordError(
        `${subject}: every evidence entry requires an id, kind, artifact ref and content digest`,
      );
    }
    if (isForbiddenLiveEvidenceKind(entry.kind)) {
      throw new CertificationRecordError(
        `${subject}: evidence '${entry.evidenceId}' carries forbidden live-claiming kind '${entry.kind}' (LAW 9 / GAP-02)`,
      );
    }
  }
}

/** The digest of a record's content (every field except recordDigest). */
function recordContentDigest(record: Omit<ChainedCertificationRecord, "recordDigest">): string {
  return contentDigest(record);
}

/**
 * The canonical BYTE rendering of a record — the determinism proof
 * substrate (identical inputs render byte-identically).
 */
export function certificationRecordBytes(
  record: ChainedCertificationRecord,
): string {
  return canonicalString(record);
}

/**
 * The append-only certification-record ledger: versioned,
 * digest-chained records with the live-claim scan at the door.
 */
export class CertificationRecordLedger {
  private readonly records: ChainedCertificationRecord[] = [];
  private readonly byId = new Map<string, ChainedCertificationRecord>();

  /** The chain head (undefined at genesis). */
  head(): ChainedCertificationRecord | undefined {
    return this.records[this.records.length - 1];
  }

  /** Every record ever appended, in append order. Never rewritten. */
  all(): readonly ChainedCertificationRecord[] {
    return Object.freeze([...this.records]);
  }

  /** The chain history of a subject, oldest first. */
  historyFor(subjectId: string): readonly ChainedCertificationRecord[] {
    return Object.freeze(
      this.records.filter((record) => record.subject.subjectId === subjectId),
    );
  }

  recordById(recordId: string): ChainedCertificationRecord | undefined {
    return this.byId.get(recordId);
  }

  /** Appends a record, chained to the current head. */
  append(input: {
    readonly recordId: string;
    readonly subject: FinancialCertificationSubjectRef;
    readonly suiteId: string;
    readonly suiteVersion: number;
    readonly evaluation: SuiteEvaluationResult;
    readonly wall: CertificationWallSummary;
    readonly evidence: readonly CertificationEvidence[];
    readonly recordedAt: string;
  }): ChainedCertificationRecord {
    if (input.recordId.length === 0) {
      throw new CertificationRecordError("recordId must not be empty");
    }
    if (this.byId.has(input.recordId)) {
      throw new CertificationRecordError(
        `certification record '${input.recordId}' already exists (append-only ledger: record ids are never reused)`,
      );
    }
    if (input.subject.subjectId.length === 0 || input.subject.version.length === 0) {
      throw new CertificationRecordError("subject references must be complete");
    }
    if (input.suiteId.length === 0 || input.suiteVersion < 1) {
      throw new CertificationRecordError("suite references must be complete");
    }
    if (input.recordedAt.length === 0) {
      throw new CertificationRecordError("recordedAt must not be empty");
    }
    if (input.evidence.length === 0) {
      throw new CertificationRecordError(
        `${input.subject.subjectId}: a certification record requires at least one evidence artifact (a pass is never fabricated)`,
      );
    }
    validateEvidence(input.evidence, input.subject.subjectId);
    assertNoLiveClaims(input.evidence, input.subject.subjectId);
    if (input.evaluation.subject.subjectId !== input.subject.subjectId) {
      throw new CertificationRecordError(
        "the suite evaluation must be for the record's subject",
      );
    }
    if (!DIGEST_SHAPE.test(input.wall.wallDigest)) {
      throw new CertificationRecordError(
        "the wall summary must carry a well-formed content digest",
      );
    }
    const previous = this.head();
    const base: Omit<ChainedCertificationRecord, "recordDigest"> = Object.freeze({
      recordId: input.recordId,
      recordVersion: 1,
      subject: input.subject,
      suiteId: input.suiteId,
      suiteVersion: input.suiteVersion,
      evaluation: input.evaluation,
      wall: Object.freeze({
        passed: input.wall.passed,
        wallDigest: input.wall.wallDigest,
        failedGates: Object.freeze([...input.wall.failedGates]),
      }),
      evidence: Object.freeze(
        input.evidence.map((entry) => Object.freeze({ ...entry })),
      ),
      previousRecordDigest: previous === undefined ? null : previous.recordDigest,
      recordedAt: input.recordedAt,
    });
    const record: ChainedCertificationRecord = Object.freeze({
      ...base,
      recordDigest: recordContentDigest(base),
    });
    this.records.push(record);
    this.byId.set(record.recordId, record);
    return record;
  }

  /**
   * Verifies the whole chain: every record's digest recomputes from its
   * content and every link points at the prior record's digest.
   */
  verifyChain():
    | { readonly ok: true; readonly records: number }
    | { readonly ok: false; readonly breakage: string } {
    let previous: ChainedCertificationRecord | undefined;
    for (const record of this.records) {
      const { recordDigest, ...content } = record;
      if (recordContentDigest(content) !== recordDigest) {
        return {
          ok: false,
          breakage: `record '${record.recordId}' digest does not recompute (content was mutated)`,
        };
      }
      const expectedPrevious = previous === undefined ? null : previous.recordDigest;
      if (record.previousRecordDigest !== expectedPrevious) {
        return {
          ok: false,
          breakage: `record '${record.recordId}' does not chain to its predecessor (history was reordered or spliced)`,
        };
      }
      previous = record;
    }
    return { ok: true, records: this.records.length };
  }
}
