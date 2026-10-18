/**
 * @payswap/route-compiler — journey evidence + lineage records (P5-W1).
 *
 * PORT+ADAPT of the old compiler's evidence.ts (173 lines, MMI-19): the
 * journey evidence pairs one plan with its OWN walk (references, never
 * re-declared), projects them into the canonical record and digests it
 * (binding-never-security). The 3.0 ADAPTATIONS:
 *
 * - the evidence-JSON file mode is DROPPED (the hermetic law: the
 *   battery is offline and deterministic; digest/tamper laws are
 *   IN-MEMORY — the dropped-site class is recorded in the evidence
 *   doc);
 * - the record carries the observation-VERSION fingerprint of the
 *   plan's lineage (the preservation law — see
 *   pins/execution-graph.ts);
 * - the lineage record names the ROUTE, QUOTE, AUTHORITY and EVIDENCE
 *   lineage of a compilation (the work-order law: "preserve route,
 *   quote, authority and evidence lineage").
 */

import { RouteCompilerError } from "./errors.ts";
import { deepFreeze, contentDigest, sortedBy } from "./canonical.ts";
import { observationVersionFingerprint } from "./pins/execution-graph.ts";
import type { PinnedObservationVersionPin } from "./pins/execution-graph.ts";
import type { RoutePlan } from "./route-plan.ts";
import type { RouteWalkResult } from "./route-walk.ts";
import type { CustodyTransfer } from "./custody.ts";

/** One journey evidence record: a plan + its own walk, canonically projected. */
export interface RouteJourneyEvidenceRecord {
  readonly journeyId: string;
  readonly intentRef: string;
  readonly shapeId: string;
  readonly planDigest: string;
  readonly compositionClass: string;
  readonly executionMode: string;
  readonly isProviderNativeBaseline: boolean;
  readonly observationVersionFingerprint: string;
  readonly legs: readonly {
    readonly legId: string;
    readonly legKind: string;
    readonly authorizationKind: string;
    readonly custody: CustodyTransfer;
    readonly plannedAmountBasis: string;
  }[];
  readonly outcome: {
    readonly status: string;
    readonly legStatuses: readonly { readonly legId: string; readonly status: string }[];
    readonly custodyAtStop?: { readonly partyKind: string; readonly assetRef: string };
    readonly reconciliation?: {
      readonly reasons: readonly string[];
      readonly blindRetryForbidden: boolean;
      readonly resolver: string;
    };
  };
  readonly evidenceRefs: readonly string[];
}

/** The journey-evidence file shape (in-memory; the law marker preserved). */
export interface RouteJourneyEvidenceFile {
  readonly law: "FIXTURE_PROVEN_LIVE_BROADCAST_IMPOSSIBLE_BY_LAW";
  readonly journeys: readonly RouteJourneyEvidenceRecord[];
  readonly digests: readonly { readonly journeyId: string; readonly digest: string }[];
}

/** The plan's complete lineage record (route/quote/authority/evidence). */
export interface RoutePlanLineageRecord {
  readonly planId: string;
  readonly intentRef: string;
  readonly intentAuthorizationRef: string;
  /** Route lineage: the shape + plan digest. */
  readonly routeLineage: { readonly shapeId: string; readonly planDigest: string };
  /** Quote lineage: the quote ids the plan decided on (swap legs' quotes). */
  readonly quoteIds: readonly string[];
  /** Authority lineage: the authorization-evidence kinds per leg, in hop order. */
  readonly authorityKinds: readonly string[];
  /** Evidence lineage: the plan's evidence refs (sorted, deduped). */
  readonly evidenceRefs: readonly string[];
  /** The exact observation versions decided on (the preservation law). */
  readonly observationVersionPins: readonly PinnedObservationVersionPin[];
  readonly lineageDigest: string;
}

/** Build one journey evidence record (the plan and its OWN walk). */
export function buildRouteJourneyEvidence(
  plan: RoutePlan,
  walk: RouteWalkResult,
  observationVersionPins: readonly PinnedObservationVersionPin[],
): RouteJourneyEvidenceRecord {
  if (walk.planId !== plan.planId) {
    throw new RouteCompilerError(
      "journey evidence pairs one plan with its own walk (the plan ids must match)",
      "EVIDENCE_PAIRING_FAILED",
    );
  }
  const journeyId = `journey:${plan.intentRef}:${plan.shapeId}`;
  const record: RouteJourneyEvidenceRecord = deepFreeze({
    journeyId,
    intentRef: plan.intentRef,
    shapeId: plan.shapeId,
    planDigest: plan.planDigest,
    compositionClass: plan.compositionClass,
    executionMode: plan.executionMode,
    isProviderNativeBaseline: plan.isProviderNativeBaseline,
    observationVersionFingerprint: observationVersionFingerprint(observationVersionPins),
    legs: Object.freeze(
      plan.legs.map((leg) =>
        Object.freeze({
          legId: leg.legId,
          legKind: leg.legKind,
          authorizationKind: leg.authorizationLineage.legAuthorization.kind,
          custody: leg.custody,
          plannedAmountBasis: leg.plannedAmount.basis,
        }),
      ),
    ),
    outcome: deepFreeze({
      status: walk.status,
      legStatuses: Object.freeze(
        walk.legExecutions.map((execution) =>
          Object.freeze({ legId: execution.legId, status: execution.status }),
        ),
      ),
      ...(walk.custodyAtStop !== undefined
        ? {
            custodyAtStop: Object.freeze({
              partyKind: walk.custodyAtStop.party.kind,
              assetRef: walk.custodyAtStop.assetRef,
            }),
          }
        : {}),
      ...(walk.reconciliation !== undefined
        ? {
            reconciliation: Object.freeze({
              reasons: walk.reconciliation.reasons,
              blindRetryForbidden: walk.reconciliation.blindRetryForbidden,
              resolver: walk.reconciliation.resolver,
            }),
          }
        : {}),
    }),
    evidenceRefs: Object.freeze(
      sortedBy([...new Set([...plan.evidenceRefs, ...walk.evidenceRefs])], (ref) => ref),
    ),
  });
  return record;
}

/** The digest of one journey record (binding-never-security). */
export function routeJourneyEvidenceDigest(record: RouteJourneyEvidenceRecord): string {
  return contentDigest(canonicalJourneyProjection(record));
}

/** The canonical journey projection (digest + serialization base). */
export function canonicalJourneyProjection(record: RouteJourneyEvidenceRecord): unknown {
  return {
    journeyId: record.journeyId,
    intentRef: record.intentRef,
    shapeId: record.shapeId,
    planDigest: record.planDigest,
    compositionClass: record.compositionClass,
    executionMode: record.executionMode,
    isProviderNativeBaseline: record.isProviderNativeBaseline,
    observationVersionFingerprint: record.observationVersionFingerprint,
    legs: record.legs.map((leg) => ({
      legId: leg.legId,
      legKind: leg.legKind,
      authorizationKind: leg.authorizationKind,
      custody: leg.custody,
      plannedAmountBasis: leg.plannedAmountBasis,
    })),
    outcome: record.outcome,
    evidenceRefs: [...record.evidenceRefs].sort(),
  };
}

/** Canonical byte-stable serialization of a record set (in-memory law). */
export function serializeRouteJourneyEvidence(
  records: readonly RouteJourneyEvidenceRecord[],
): string {
  const ordered = sortedBy(records, (record) => record.journeyId);
  return `${JSON.stringify(
    ordered.map((record) => canonicalJourneyProjection(record)),
    null,
    2,
  )}\n`;
}

/** Build the in-memory journey evidence file (law-marked, digest-paired). */
export function buildRouteJourneyEvidenceFile(
  records: readonly RouteJourneyEvidenceRecord[],
): RouteJourneyEvidenceFile {
  const ordered = sortedBy(records, (record) => record.journeyId);
  return deepFreeze({
    law: "FIXTURE_PROVEN_LIVE_BROADCAST_IMPOSSIBLE_BY_LAW",
    journeys: Object.freeze(ordered),
    digests: Object.freeze(
      ordered.map((record) =>
        Object.freeze({ journeyId: record.journeyId, digest: routeJourneyEvidenceDigest(record) }),
      ),
    ),
  });
}

/** Build the plan's complete lineage record (route/quote/authority/evidence). */
export function buildRoutePlanLineageRecord(
  plan: RoutePlan,
  intentAuthorizationRef: string,
  observationVersionPins: readonly PinnedObservationVersionPin[],
): RoutePlanLineageRecord {
  const quoteIds = plan.legs
    .filter((leg) => leg.plannedAmount.basis === "QUOTE_GROUNDED" && "quoteId" in leg.plannedAmount)
    .map((leg) => (leg.plannedAmount as { quoteId: string }).quoteId);
  const lineage = deepFreeze({
    planId: plan.planId,
    intentRef: plan.intentRef,
    intentAuthorizationRef,
    routeLineage: deepFreeze({ shapeId: plan.shapeId, planDigest: plan.planDigest }),
    quoteIds: Object.freeze([...new Set(sortedBy(quoteIds, (id) => id))]),
    authorityKinds: Object.freeze(plan.legs.map((leg) => leg.authorizationLineage.legAuthorization.kind)),
    evidenceRefs: Object.freeze(sortedBy([...plan.evidenceRefs], (ref) => ref)),
    observationVersionPins: Object.freeze(sortedBy(observationVersionPins, (pin) => `${pin.instanceId}@${pin.observationVersion}`) as readonly PinnedObservationVersionPin[]),
    lineageDigest: "",
  }) as RoutePlanLineageRecord;
  return deepFreeze({
    ...lineage,
    lineageDigest: contentDigest({
      planId: lineage.planId,
      intentRef: lineage.intentRef,
      routeLineage: lineage.routeLineage,
      quoteIds: lineage.quoteIds,
      authorityKinds: lineage.authorityKinds,
      evidenceRefs: lineage.evidenceRefs,
      observationVersionFingerprint: observationVersionFingerprint(lineage.observationVersionPins),
    }),
  });
}
