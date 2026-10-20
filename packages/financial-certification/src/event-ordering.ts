/**
 * @payswap/financial-certification — LAW 4: event ordering robustness
 * (P8-W1).
 *
 * Duplicate commands/events, out-of-order provider events and delayed
 * returns resolve DETERMINISTICALLY to the SAME reconciled state:
 *
 * - DUPLICATES ARE HARMLESS: (provider, eventId) is the dedupe key — a
 *   duplicate delivery contributes nothing (the pinned
 *   DUPLICATE_IGNORED outcome);
 * - NO REGRESSION: the canonical state of a provider object is its
 *   NEWEST observation (highest revision); every non-canonical revision
 *   is retained in history and flagged SUPERSEDED_BY_NEWER_OBSERVATION
 *   (the pinned outcome) — an out-of-order arrival cannot replace a
 *   newer canonical observation with an older one;
 * - ORDER-INDEPENDENCE WITH A TOTAL-ORDER PROOF: the reconciled state
 *   is a PURE FUNCTION OF THE EVENT SET — the fold sorts by the declared
 *   total order (provider, externalId, revision, eventId), so EVERY
 *   arrival permutation yields the BYTE-IDENTICAL reconciled digest;
 * - CONFLICTS ARE SURFACED: two different lifecycle steps at the same
 *   (externalId, revision) have no total order — the fold still resolves
 *   deterministically (lexicographic tie-break) but the conflict is
 *   reported, never silently absorbed.
 */

import { contentDigest } from "./digest.ts";
import { ConformanceError } from "./errors.ts";
import { conformanceVerdict, type ConformanceVerdict } from "./laws.ts";

/** One provider event as the certification sees it (the subject's artifact). */
export interface CertifiedProviderEvent {
  readonly providerName: string;
  /** The provider's event id — the idempotency (dedupe) key. */
  readonly eventId: string;
  /** The provider object the event observes. */
  readonly externalId: string;
  /** The revision of the observation (>= 1 — the ordering authority). */
  readonly revision: number;
  readonly lifecycleStep: string;
  readonly terminal: boolean;
}

/** One retained observation of a reconciled object (ascending revision). */
export interface RetainedObservation {
  readonly revision: number;
  readonly lifecycleStep: string;
  readonly terminal: boolean;
  readonly eventId: string;
}

/** The reconciled state of ONE provider object. */
export interface ReconciledObjectState {
  readonly providerName: string;
  readonly externalId: string;
  /** The canonical (newest-revision) lifecycle step. */
  readonly lifecycleStep: string;
  readonly canonicalRevision: number;
  readonly terminal: boolean;
  /** Every distinct observation, ascending by revision. */
  readonly observations: readonly RetainedObservation[];
  /** Event ids that were duplicate deliveries (deduped, harmless). */
  readonly duplicateEventIds: readonly string[];
  /** Revisions superseded by the canonical one (retained, flagged). */
  readonly supersededRevisions: readonly number[];
}

/** A same-(externalId, revision) lifecycle conflict (no total order). */
export interface RevisionConflict {
  readonly providerName: string;
  readonly externalId: string;
  readonly revision: number;
  readonly lifecycleSteps: readonly string[];
}

/** The reconciled state of a whole event set (order-independent). */
export interface ReconciledEventState {
  readonly objects: readonly ReconciledObjectState[];
  readonly conflicts: readonly RevisionConflict[];
  readonly duplicateEventCount: number;
  readonly digest: string;
}

function validateEvent(event: CertifiedProviderEvent): void {
  if (
    event === null ||
    typeof event !== "object" ||
    event.providerName.length === 0 ||
    event.eventId.length === 0 ||
    event.externalId.length === 0 ||
    event.lifecycleStep.length === 0
  ) {
    throw new ConformanceError(
      "a certified provider event requires provider, eventId, externalId and lifecycleStep",
    );
  }
  if (typeof event.revision !== "number" || !Number.isSafeInteger(event.revision) || event.revision < 1) {
    throw new ConformanceError(
      `event '${event.eventId}': revision must be a safe integer >= 1 (the ordering authority)`,
    );
  }
}

/**
 * The declared TOTAL ORDER over events: (providerName, externalId,
 * revision, eventId) — the fold's canonical application order.
 */
export function canonicalTotalOrder(
  events: readonly CertifiedProviderEvent[],
): readonly CertifiedProviderEvent[] {
  return [...events].sort((a, b) => {
    if (a.providerName !== b.providerName) {
      return a.providerName < b.providerName ? -1 : 1;
    }
    if (a.externalId !== b.externalId) {
      return a.externalId < b.externalId ? -1 : 1;
    }
    if (a.revision !== b.revision) {
      return a.revision - b.revision;
    }
    if (a.eventId !== b.eventId) {
      return a.eventId < b.eventId ? -1 : 1;
    }
    return 0;
  });
}

/**
 * The deterministic fold: dedupes by (provider, eventId), groups by
 * (provider, externalId), orders observations by the declared total
 * order and projects the canonical (newest-revision) state. A PURE
 * FUNCTION OF THE EVENT SET — arrival order cannot influence the
 * result.
 */
export function reconcileProviderEvents(
  events: readonly CertifiedProviderEvent[],
): ReconciledEventState {
  for (const event of events) {
    validateEvent(event);
  }
  // 1. Dedupe by (provider, eventId) — duplicates are harmless.
  const seen = new Set<string>();
  const duplicates: CertifiedProviderEvent[] = [];
  const distinct: CertifiedProviderEvent[] = [];
  for (const event of events) {
    const key = `${event.providerName}::${event.eventId}`;
    if (seen.has(key)) {
      duplicates.push(event);
      continue;
    }
    seen.add(key);
    distinct.push(event);
  }
  const duplicateEventIds: readonly string[] = duplicates.map(
    (event) => event.eventId,
  );
  // 2. Group by (provider, externalId), collecting observations.
  const objects = new Map<string, CertifiedProviderEvent[]>();
  const duplicatesByObject = new Map<string, string[]>();
  for (const event of distinct) {
    const key = `${event.providerName}::${event.externalId}`;
    const bucket = objects.get(key) ?? [];
    bucket.push(event);
    objects.set(key, bucket);
  }
  for (const duplicate of duplicates) {
    const key = `${duplicate.providerName}::${duplicate.externalId}`;
    const bucket = duplicatesByObject.get(key) ?? [];
    bucket.push(duplicate.eventId);
    duplicatesByObject.set(key, bucket);
  }
  // 3. Fold every object over the declared total order.
  const conflicts: RevisionConflict[] = [];
  const reconciled: ReconciledObjectState[] = [];
  for (const [key, bucket] of objects) {
    const ordered = canonicalTotalOrder(bucket);
    const observations: RetainedObservation[] = [];
    const [first] = ordered;
    if (first === undefined) {
      continue;
    }
    const revisionSteps = new Map<number, Set<string>>();
    for (const event of ordered) {
      observations.push({
        revision: event.revision,
        lifecycleStep: event.lifecycleStep,
        terminal: event.terminal,
        eventId: event.eventId,
      });
      const steps = revisionSteps.get(event.revision) ?? new Set<string>();
      steps.add(event.lifecycleStep);
      revisionSteps.set(event.revision, steps);
    }
    for (const [revision, steps] of revisionSteps) {
      if (steps.size > 1) {
        conflicts.push({
          providerName: first.providerName,
          externalId: first.externalId,
          revision,
          lifecycleSteps: Object.freeze([...steps].sort()),
        });
      }
    }
    const canonical = ordered[ordered.length - 1] as CertifiedProviderEvent;
    reconciled.push(
      Object.freeze({
        providerName: first.providerName,
        externalId: first.externalId,
        lifecycleStep: canonical.lifecycleStep,
        canonicalRevision: canonical.revision,
        terminal: canonical.terminal,
        observations: Object.freeze(observations),
        duplicateEventIds: Object.freeze(duplicatesByObject.get(key) ?? []),
        supersededRevisions: Object.freeze(
          ordered
            .filter((event) => event.revision !== canonical.revision)
            .map((event) => event.revision),
        ),
      }),
    );
  }
  reconciled.sort((a, b) => {
    if (a.providerName !== b.providerName) {
      return a.providerName < b.providerName ? -1 : 1;
    }
    if (a.externalId !== b.externalId) {
      return a.externalId < b.externalId ? -1 : 1;
    }
    return a.canonicalRevision - b.canonicalRevision;
  });
  const state: ReconciledEventState = Object.freeze({
    objects: Object.freeze(reconciled),
    conflicts: Object.freeze(conflicts),
    duplicateEventCount: duplicateEventIds.length,
    // The digest covers the RECONCILED STATE ONLY (canonical object
    // projections + surfaced conflicts) — duplicate-delivery telemetry is
    // reported, never state: re-delivering an event an extra time is the
    // harmless-duplicate law in action and must not change the digest.
    digest: contentDigest({
      objects: reconciled.map((object) => ({
        providerName: object.providerName,
        externalId: object.externalId,
        lifecycleStep: object.lifecycleStep,
        canonicalRevision: object.canonicalRevision,
        terminal: object.terminal,
        observations: object.observations,
      })),
      conflicts,
    }),
  });
  return state;
}

function deterministPermutations(
  events: readonly CertifiedProviderEvent[],
): readonly (readonly CertifiedProviderEvent[])[] {
  const n = events.length;
  if (n === 0) {
    return [[]];
  }
  const reversed = [...events].reverse();
  const rotated = [...events.slice(1), events[0] as CertifiedProviderEvent];
  const rotatedHalf = [
    ...events.slice(Math.floor(n / 2)),
    ...events.slice(0, Math.floor(n / 2)),
  ];
  const byEventIdDesc = [...events].sort((a, b) => (a.eventId < b.eventId ? 1 : -1));
  const duplicated = [...events, events[0] as CertifiedProviderEvent];
  const pairDuplicated = n > 1 ? [...events, events[n - 1] as CertifiedProviderEvent] : duplicated;
  return [events, reversed, rotated, rotatedHalf, byEventIdDesc, duplicated, pairDuplicated];
}

/**
 * CERTIFIES the event-ordering law (FIN-LAW-04): the reconciled digest
 * is identical across the canonical total order, every
 * deterministically-derived arrival permutation, every caller-supplied
 * permutation, AND the duplicate-appended variants; same-revision
 * lifecycle conflicts are surfaced (never silently absorbed).
 */
export function certifyOrderIndependence(input: {
  readonly subjectRef: string;
  readonly events: readonly CertifiedProviderEvent[];
  readonly permutations?: readonly (readonly CertifiedProviderEvent[])[];
  readonly evidenceRefs: readonly string[];
}): ConformanceVerdict {
  const violations: string[] = [];
  const canonical = reconcileProviderEvents(canonicalTotalOrder(input.events));
  if (canonical.conflicts.length > 0) {
    for (const conflict of canonical.conflicts) {
      violations.push(
        `FIN-LAW-04 (conflict): provider '${conflict.providerName}' object '${conflict.externalId}' carries DIFFERENT lifecycle steps [${conflict.lifecycleSteps.join(", ")}] at revision ${String(conflict.revision)} — there is no total order over the observations`,
      );
    }
  }
  const permutations = [
    ...deterministPermutations(input.events),
    ...(input.permutations ?? []),
  ];
  for (const [index, permutation] of permutations.entries()) {
    const folded = reconcileProviderEvents(permutation);
    if (folded.digest !== canonical.digest) {
      violations.push(
        `FIN-LAW-04 (order-independence): arrival permutation #${String(index)} folded to digest ${folded.digest} but the canonical total order folds to ${canonical.digest} — duplicate/out-of-order events must resolve deterministically to the SAME reconciled state`,
      );
    }
  }
  return conformanceVerdict({
    lawId: "FIN-LAW-04",
    scenarioId: canonical.duplicateEventCount > 0 ? "DUPLICATE_PROVIDER_EVENTS" : "OUT_OF_ORDER_PROVIDER_EVENTS",
    subjectRef: input.subjectRef,
    violations,
    evidenceRefs: input.evidenceRefs,
  });
}
