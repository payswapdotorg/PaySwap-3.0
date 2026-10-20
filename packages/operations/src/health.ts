/**
 * @payswap/operations — production health: evidence counters + the
 * liveness/readiness law (P8-W3, hard law 3).
 *
 * REAUTHORED from payswap.org@8a735bf packages/operations/src/
 * observability.ts (the counters/health half) onto the canonical
 * architecture:
 * - EVIDENCE COUNTERS are the operational counters a healthy deployment
 *   must expose; CUMULATIVE counters are MONOTONIC (a decrease means
 *   lost history and fails the check); every snapshot is digest-anchored.
 * - LIVENESS/READINESS SEPARATION: liveness asserts process aliveness
 *   ONLY; readiness asserts a plane may serve traffic and EVERY readiness
 *   claim cites >= 1 DECLARED, contract-backed source — no health claim
 *   without a contract-backed source (the operational form of the pinned
 *   surface law "claimed without evidence throws").
 *
 * Deterministic only: pure functions over caller-supplied snapshots.
 */

import { contentDigest } from "./digest.js";

/** Raised when a health-contract or counter contract is violated. */
export class HealthContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthContractError";
  }
}

// ---------------------------------------------------------------------------
// Evidence counters (monotonic, digest-anchored)
// ---------------------------------------------------------------------------

export const EVIDENCE_COUNTER_KINDS = [
  "eventsPublished",
  "outboxPublished",
  "reconciliationCasesOpened",
  "reconciliationCasesResolved",
  "terminalTransitionsRecorded",
  "unknownOutcomesOpen",
  "outboxDepth",
  "rolloutStagesHeld",
  "rollbacksExecuted",
  "secretExposuresDetected",
] as const;
export type EvidenceCounterKind = (typeof EVIDENCE_COUNTER_KINDS)[number];

/** CUMULATIVE counters are monotonic; GAUGE counters may move both ways. */
export const COUNTER_ARITY: Readonly<
  Record<EvidenceCounterKind, "CUMULATIVE" | "GAUGE">
> = Object.freeze({
  eventsPublished: "CUMULATIVE",
  outboxPublished: "CUMULATIVE",
  reconciliationCasesOpened: "CUMULATIVE",
  reconciliationCasesResolved: "CUMULATIVE",
  terminalTransitionsRecorded: "CUMULATIVE",
  unknownOutcomesOpen: "GAUGE",
  outboxDepth: "GAUGE",
  rolloutStagesHeld: "CUMULATIVE",
  rollbacksExecuted: "CUMULATIVE",
  secretExposuresDetected: "CUMULATIVE",
});

/** One snapshot of the evidence counters (all kinds, all non-negative). */
export interface EvidenceCounterSnapshot {
  readonly counters: Readonly<Record<EvidenceCounterKind, number>>;
  /** The deployment the snapshot was taken for. */
  readonly deploymentId: string;
  /** Digest anchor: contentDigest over the counter map + deploymentId. */
  readonly snapshotDigest: string;
}

/** Assemble a digest-anchored counter snapshot (fail-closed on shape). */
export function recordEvidenceCounters(
  deploymentId: string,
  counters: Readonly<Partial<Record<EvidenceCounterKind, number>>>,
): EvidenceCounterSnapshot {
  if (typeof deploymentId !== "string" || deploymentId.length < 1) {
    throw new HealthContractError(
      "a counter snapshot is anchored to a deployment id",
    );
  }
  const full = {} as Record<EvidenceCounterKind, number>;
  for (const kind of EVIDENCE_COUNTER_KINDS) {
    const value = counters[kind] ?? 0;
    if (!Number.isInteger(value) || value < 0) {
      throw new HealthContractError(
        `counter '${kind}' must be a non-negative integer, got '${String(value)}'`,
      );
    }
    full[kind] = value;
  }
  const snapshotDigest = contentDigest({
    deploymentId,
    counters: full,
  });
  return { counters: full, deploymentId, snapshotDigest };
}

export interface CounterMonotonicityReport {
  readonly passed: boolean;
  readonly violations: readonly string[];
}

/**
 * The monotonicity law: every CUMULATIVE counter is non-decreasing from
 * the earlier snapshot to the later one. A decreasing cumulative counter
 * means lost history — the check fails closed.
 */
export function checkCounterMonotonicity(
  earlier: EvidenceCounterSnapshot,
  later: EvidenceCounterSnapshot,
): CounterMonotonicityReport {
  const violations: string[] = [];
  for (const kind of EVIDENCE_COUNTER_KINDS) {
    if (COUNTER_ARITY[kind] !== "CUMULATIVE") {
      continue;
    }
    if (later.counters[kind] < earlier.counters[kind]) {
      violations.push(
        `cumulative counter '${kind}' decreased (${String(earlier.counters[kind])} -> ${String(later.counters[kind])}) — lost history`,
      );
    }
  }
  return { passed: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Liveness / readiness (the health law)
// ---------------------------------------------------------------------------

/** What may back a readiness claim — all contract-backed, no vibes. */
export const READINESS_SOURCE_KINDS = [
  "DEPENDENCY_PROBE",
  "COUNTER_THRESHOLD",
  "CONTRACT_CHECK",
  "EVIDENCE_RECORD",
  "GATE_VERDICT",
] as const;
export type ReadinessSourceKind = (typeof READINESS_SOURCE_KINDS)[number];

/** A declared, contract-backed readiness source. */
export interface ReadinessSource {
  readonly sourceId: string;
  readonly kind: ReadinessSourceKind;
  /** What the source observes (e.g. "system-of-record reachable"). */
  readonly observes: string;
}

/** A plane's readiness: cites >= 1 DECLARED source. */
export interface ReadinessDeclaration {
  readonly planeId: string;
  readonly sourceIds: readonly string[];
}

/** A plane's liveness: process aliveness ONLY — never dependency state. */
export interface LivenessDeclaration {
  readonly planeId: string;
}

export interface HealthContractReport {
  readonly passed: boolean;
  readonly violations: readonly string[];
}

/**
 * The health-contract check:
 *  1. every readiness declaration cites at least one source (no health
 *     claim without a contract-backed source);
 *  2. every cited source is DECLARED (no phantom sources);
 *  3. liveness and readiness are separate planes-level declarations —
 *     a plane with readiness but no liveness declaration (or vice versa)
 *     is incomplete;
 *  4. sources are uniquely identified.
 */
export function checkHealthContracts(input: {
  readonly sources: readonly ReadinessSource[];
  readonly readiness: readonly ReadinessDeclaration[];
  readonly liveness: readonly LivenessDeclaration[];
}): HealthContractReport {
  const violations: string[] = [];
  const sourceIds = new Set<string>();
  for (const source of input.sources) {
    if (sourceIds.has(source.sourceId)) {
      violations.push(`duplicate readiness source '${source.sourceId}'`);
    }
    sourceIds.add(source.sourceId);
    if (!READINESS_SOURCE_KINDS.includes(source.kind)) {
      violations.push(
        `source '${source.sourceId}' has unknown kind '${String(source.kind)}'`,
      );
    }
  }
  for (const declaration of input.readiness) {
    if (declaration.sourceIds.length === 0) {
      violations.push(
        `plane '${declaration.planeId}' claims readiness with ZERO sources — no health claim without a contract-backed source`,
      );
    }
    for (const sourceId of declaration.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        violations.push(
          `plane '${declaration.planeId}' cites undeclared readiness source '${sourceId}'`,
        );
      }
    }
  }
  const readinessPlanes = new Set(input.readiness.map((r) => r.planeId));
  const livenessPlanes = new Set(input.liveness.map((l) => l.planeId));
  for (const planeId of readinessPlanes) {
    if (!livenessPlanes.has(planeId)) {
      violations.push(
        `plane '${planeId}' declares readiness but not liveness — the pair is required`,
      );
    }
  }
  for (const planeId of livenessPlanes) {
    if (!readinessPlanes.has(planeId)) {
      violations.push(
        `plane '${planeId}' declares liveness but not readiness — the pair is required`,
      );
    }
  }
  return { passed: violations.length === 0, violations };
}
