/**
 * @payswap/operations — evidence lineage: versioned, digest-chained
 * records with deterministic replay (P8-W3, hard law 8).
 *
 * REAUTHORED from the evidence-chain disciplines of
 * payswap.org@8a735bf packages/operations (deployment fingerprints,
 * promotion/rollback records, release-record digests) into one explicit
 * lineage contract. The laws:
 *
 * - EVERY OPERATIONAL RECORD CARRIES VERSIONED, DIGEST-CHAINED EVIDENCE:
 *   each record digests its own payload PLUS the previous record's
 *   digest — the chain is append-only and tamper-evident against its own
 *   body;
 * - DETERMINISTIC REPLAY VERIFIES THE CHAIN: `verifyEvidenceChain`
 *   recomputes every link in order; a tampered payload, a spliced record
 *   or a reordered chain all fail closed;
 * - REPLAY IS REPRODUCIBLE: `replayEvidenceChain` derives the terminal
 *   digest purely from the record sequence — the same sequence always
 *   produces the same terminal digest (the pinned Lab replay law);
 * - RECORDS ARE VERSIONED: every record carries the lineage schema
 *   version and a monotone sequence number; historical records stay
 *   immutable.
 *
 * Deterministic only: pure functions; no I/O, no clock, no entropy.
 */

import { contentDigest, deepFreeze } from "./digest.js";

/** Raised when the evidence-lineage contract is violated. */
export class EvidenceLineageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceLineageError";
  }
}

/** The lineage schema version. */
export const EVIDENCE_LINEAGE_SCHEMA_VERSION = "1.0" as const;

/** The digest of the empty lineage (the genesis anchor). */
export const GENESIS_DIGEST = contentDigest({ lineage: "genesis" });

/** One versioned, digest-chained evidence record. */
export interface EvidenceRecord {
  readonly schema_version: typeof EVIDENCE_LINEAGE_SCHEMA_VERSION;
  /** Monotone sequence number within the chain (0, 1, 2, ...). */
  readonly sequence: number;
  readonly recordId: string;
  /** What kind of operational evidence this record carries. */
  readonly evidenceKind: string;
  /** The digest of the payload (caller-computed over the payload body). */
  readonly payloadDigest: string;
  /** The previous record's recordDigest (GENESIS_DIGEST for sequence 0). */
  readonly prevRecordDigest: string;
  /** contentDigest over (schema_version, sequence, recordId, payloadDigest, prevRecordDigest). */
  readonly recordDigest: string;
}

/** An append-only evidence chain (functional — snapshots never mutate). */
export interface EvidenceChain {
  readonly records: readonly EvidenceRecord[];
}

export function emptyEvidenceChain(): EvidenceChain {
  return { records: [] };
}

/** Compute a record's chain digest (the link law — never reorder fields). */
export function computeRecordDigest(input: {
  readonly sequence: number;
  readonly recordId: string;
  readonly evidenceKind: string;
  readonly payloadDigest: string;
  readonly prevRecordDigest: string;
}): string {
  return contentDigest({
    schema_version: EVIDENCE_LINEAGE_SCHEMA_VERSION,
    sequence: input.sequence,
    recordId: input.recordId,
    evidenceKind: input.evidenceKind,
    payloadDigest: input.payloadDigest,
    prevRecordDigest: input.prevRecordDigest,
  });
}

/**
 * Append one evidence record to the chain and return a NEW chain.
 * Fail-closed: unique recordId, positive-length payload digest, the
 * sequence must be exactly the chain length, and the prevRecordDigest
 * must be the current terminal digest (GENESIS_DIGEST for an empty
 * chain).
 */
export function appendEvidenceRecord(
  chain: EvidenceChain,
  input: {
    readonly recordId: string;
    readonly evidenceKind: string;
    readonly payloadDigest: string;
  },
): EvidenceChain {
  if (input.recordId.length < 3) {
    throw new EvidenceLineageError("recordId must be a non-trivial string");
  }
  if (input.evidenceKind.length < 3) {
    throw new EvidenceLineageError(
      "evidenceKind names what the record carries (lineage)",
    );
  }
  if (input.payloadDigest.length < 3) {
    throw new EvidenceLineageError(
      "a record carries its payload digest — evidence without content cannot exist",
    );
  }
  if (
    chain.records.some((record) => record.recordId === input.recordId)
  ) {
    throw new EvidenceLineageError(
      `duplicate recordId '${input.recordId}' (the chain is append-only)`,
    );
  }
  const sequence = chain.records.length;
  const prevRecordDigest =
    sequence === 0
      ? GENESIS_DIGEST
      : (chain.records[sequence - 1] as EvidenceRecord).recordDigest;
  const record: EvidenceRecord = deepFreeze({
    schema_version: EVIDENCE_LINEAGE_SCHEMA_VERSION,
    sequence,
    recordId: input.recordId,
    evidenceKind: input.evidenceKind,
    payloadDigest: input.payloadDigest,
    prevRecordDigest,
    recordDigest: computeRecordDigest({
      sequence,
      recordId: input.recordId,
      evidenceKind: input.evidenceKind,
      payloadDigest: input.payloadDigest,
      prevRecordDigest,
    }),
  });
  return { records: [...chain.records, record] };
}

// ---------------------------------------------------------------------------
// Deterministic replay + verification
// ---------------------------------------------------------------------------

export interface ChainVerificationReport {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly recordCount: number;
  /** The terminal digest a deterministic replay derives ("" when empty). */
  readonly terminalDigest: string;
}

/**
 * DETERMINISTIC REPLAY: recompute every record's digest in sequence
 * order. Verifies:
 *  1. sequences are exactly 0..n-1 in order (no gaps, no reordering);
 *  2. each record's prevRecordDigest equals the previous record's
 *     recordDigest (GENESIS_DIGEST first);
 *  3. each record's recordDigest equals the recomputed link digest
 *     (tamper/splice detection);
 *  4. recordIds are unique.
 * The terminal digest is what the replay derives — callers compare it
 * against what they recorded.
 */
export function verifyEvidenceChain(
  chain: EvidenceChain,
): ChainVerificationReport {
  const problems: string[] = [];
  const seen = new Set<string>();
  let expectedPrev = GENESIS_DIGEST;
  for (let index = 0; index < chain.records.length; index += 1) {
    const record = chain.records[index];
    if (record === undefined) {
      problems.push(`missing record at sequence ${String(index)}`);
      continue;
    }
    if (record.schema_version !== EVIDENCE_LINEAGE_SCHEMA_VERSION) {
      problems.push(
        `record '${record.recordId}' carries schema_version '${String(record.schema_version)}'`,
      );
    }
    if (record.sequence !== index) {
      problems.push(
        `record '${record.recordId}' has sequence ${String(record.sequence)}, expected ${String(index)} (no gaps, no reordering)`,
      );
    }
    if (seen.has(record.recordId)) {
      problems.push(`duplicate recordId '${record.recordId}'`);
    }
    seen.add(record.recordId);
    if (record.prevRecordDigest !== expectedPrev) {
      problems.push(
        `record '${record.recordId}' prevRecordDigest mismatch — the chain was spliced or reordered`,
      );
    }
    const recomputed = computeRecordDigest(record);
    if (recomputed !== record.recordDigest) {
      problems.push(
        `record '${record.recordId}' recordDigest mismatch — the record body changed after digesting`,
      );
    }
    expectedPrev = record.recordDigest;
  }
  return {
    ok: problems.length === 0,
    problems,
    recordCount: chain.records.length,
    terminalDigest:
      chain.records.length === 0
        ? GENESIS_DIGEST
        : (chain.records[chain.records.length - 1] as EvidenceRecord)
            .recordDigest,
  };
}

/**
 * Replay the chain purely from the record sequence and derive the
 * terminal digest — the reproducibility law: the same sequence always
 * produces the same terminal digest, independent of assembly history.
 */
export function replayEvidenceChain(
  chain: EvidenceChain,
): string {
  let expectedPrev = GENESIS_DIGEST;
  for (const record of chain.records) {
    const recomputed = computeRecordDigest(record);
    if (recomputed !== record.recordDigest) {
      throw new EvidenceLineageError(
        `replay failed at record '${record.recordId}' — the chain does not verify`,
      );
    }
    if (record.prevRecordDigest !== expectedPrev) {
      throw new EvidenceLineageError(
        `replay failed at record '${record.recordId}' — the chain does not verify`,
      );
    }
    expectedPrev = record.recordDigest;
  }
  return expectedPrev;
}

/**
 * The byte-determinism proof: two chains assembled by appending the same
 * record inputs in the same order are deep-equal and replay to the same
 * terminal digest.
 */
export function chainsAreEquivalent(
  left: EvidenceChain,
  right: EvidenceChain,
): boolean {
  if (left.records.length !== right.records.length) {
    return false;
  }
  for (let index = 0; index < left.records.length; index += 1) {
    const a = left.records[index];
    const b = right.records[index];
    if (
      a === undefined ||
      b === undefined ||
      a.recordDigest !== b.recordDigest
    ) {
      return false;
    }
  }
  return replayEvidenceChain(left) === replayEvidenceChain(right);
}
