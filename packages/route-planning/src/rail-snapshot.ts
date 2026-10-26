/**
 * @payswap/route-planning — the per-side eligible-rail snapshots
 * (P16-A; ROUTINE-CONTRACT stages 2 and 3).
 *
 * Sender and recipient rails are derived INDEPENDENTLY: two separate
 * corridor evaluations, each with its own observation grounding and the
 * caller-supplied query instant (`asOf` is DATA — never a clock read).
 * Every snapshot record carries the per-rail LINEAGE (ids + versions,
 * provider, restriction set ids), the observation version + observed-at
 * stamp + the freshness policy + the derived staleness verdict (derived
 * from the REAL projection's STALE_OBSERVATION exclusion, never
 * re-evaluated locally), the connected-instance SCOPES (account/tenant,
 * authorization status, permission state, geography, currencies), the
 * amount/corridor LIMITS (amount limits, quota, cutoffs, terms refs),
 * the FULL typed exclusion list (code + cause + layer + message,
 * verbatim), and a deterministic digest. Catalogue-only, stale,
 * unscoped or unauthorized instances NEVER qualify (INV-13 — a catalogue
 * entry is structurally unconstructible as a chain and rejected typed).
 */

import { CatalogueRailRejectedError, RailSnapshotError } from "./errors.ts";
import { contentDigest, deepFreeze, isRecord, isStrictIsoUtcTimestamp, requireObject } from "./canonical.ts";
import type {
  PinnedCorridorExclusion,
  PinnedCorridorQuery,
  PinnedCorridorRestrictionSet,
  PinnedCorridorRouteChain,
  PinnedCorridorRouteEvaluation,
  PinnedCorridorRouteLineage,
  PinnedEffectiveAvailability,
  PinnedExecutionMode,
  PinnedInstanceScope,
  PinnedObservationFreshnessPolicy,
  PinnedObservationScope,
} from "./pins/capability.ts";
import { PINNED_STALE_OBSERVATION_CODE } from "./pins/capability.ts";
import { requireCorridorProjectionPort, type CorridorProjectionPort, type CorridorSide } from "./ports.ts";

/** The per-side snapshot derivation request (one side, one evaluation). */
export interface RailSnapshotSideRequest {
  readonly side: CorridorSide;
  readonly query: PinnedCorridorQuery;
  readonly freshnessPolicy: PinnedObservationFreshnessPolicy;
  readonly chains: readonly PinnedCorridorRouteChain[];
  readonly corridorPort: CorridorProjectionPort;
}
/** The connected-instance scope record a snapshot discloses (INV-13 surface). */
export interface RailScopeDisclosure {
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly accountRef: string;
  readonly tenantRef: string;
  readonly authorizationStatus: string;
  readonly permissionState: { readonly granted: readonly string[]; readonly requested: readonly string[]; readonly missing: readonly string[] };
  readonly geography: readonly string[];
  readonly currencies: readonly string[];
}
/** The amount/corridor limits a snapshot discloses. */
export interface RailLimitDisclosure {
  readonly restrictionSetIds: readonly string[];
  readonly amountLimits: readonly {
    readonly min?: { readonly currency: string; readonly minorUnits: string };
    readonly max?: { readonly currency: string; readonly minorUnits: string };
  }[];
  readonly cutoffs: readonly { readonly cutoffId: string; readonly cutoffTimeUtc: string; readonly processingDayRule: string }[];
  readonly termsRefs: readonly { readonly termsRef: string; readonly termsVersion: string; readonly deliveryEstimateLabel: string }[];
  readonly quota?: { readonly limit?: number; readonly remaining?: number; readonly windowSeconds?: number };
}
/** One per-rail snapshot record (the versioned eligible-rail evidence). */
export interface EligibleRailSnapshotRecord {
  readonly routeId: string;
  readonly side: CorridorSide;
  readonly eligible: boolean;
  /** The corridor route evaluation this record derives from (VERBATIM). */
  readonly evaluation: PinnedCorridorRouteEvaluation;
  readonly lineage: PinnedCorridorRouteLineage;
  readonly observationVersion: number;
  readonly observedAt: string;
  readonly freshnessPolicy: PinnedObservationFreshnessPolicy;
  /** Derived from the REAL projection's STALE_OBSERVATION exclusion. */
  readonly stale: boolean;
  readonly scopes: RailScopeDisclosure;
  readonly limits: RailLimitDisclosure;
  /** The FULL typed exclusion list (verbatim — never just the first). */
  readonly exclusions: readonly PinnedCorridorExclusion[];
  readonly effectiveAvailability: PinnedEffectiveAvailability;
  readonly offeredExecutionModes: readonly PinnedExecutionMode[];
}
/** The per-side eligible-rail snapshot (the stage-2 / stage-3 output). */
export interface EligibleRailSnapshot {
  readonly side: CorridorSide;
  readonly query: PinnedCorridorQuery;
  readonly evaluatedAsOf: string;
  readonly freshnessPolicy: PinnedObservationFreshnessPolicy;
  readonly rails: readonly EligibleRailSnapshotRecord[];
  /** Only REAL-projection-eligible routes appear (never catalogue, stale, unscoped or unauthorized). */
  readonly eligibleRouteIds: readonly string[];
  readonly snapshotDigest: string;
  /** LITERAL: rail discovery never permits execution. */
  readonly railsPermitExecution: false;
}
/** True iff the value carries the connected-instance scope surface (INV-13). */
function isInstanceScope(value: unknown): value is PinnedInstanceScope {
  if (!isRecord(value)) {
    return false;
  }
  const candidate = value as Partial<PinnedInstanceScope>;
  return (
    typeof candidate.instanceId === "string" &&
    candidate.instanceId !== "" &&
    typeof candidate.accountRef === "string" &&
    typeof candidate.tenantRef === "string" &&
    typeof candidate.implementationId === "string" &&
    isRecord(candidate.authorization) &&
    isRecord(candidate.permissionState) &&
    isRecord(candidate.eligibility) &&
    isRecord(candidate.geography) &&
    Array.isArray(candidate.currencies)
  );
}

/** True iff the value is shaped like a provider catalogue entry (INV-13 reject). */
function looksLikeCatalogueEntry(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const scope = (value as { advertisedScope?: unknown }).advertisedScope;
  return (
    typeof (value as { catalogueEntryId?: unknown }).catalogueEntryId === "string" &&
    isRecord(scope) &&
    (scope as { platformWide?: unknown }).platformWide === true
  );
}

function requireInstanceScope(chain: unknown, index: number): PinnedInstanceScope {
  if (looksLikeCatalogueEntry(chain)) {
    throw new CatalogueRailRejectedError(
      `chains[${index}] carries a provider CATALOGUE entry — a catalogue claim never qualifies a rail (INV-13: only a ConnectedCapabilityInstance scoped to a real account/tenant, authorization, geography/currency and permission state can appear in a rail snapshot)`,
      { index, catalogueEntryId: (chain as { catalogueEntryId: string }).catalogueEntryId },
    );
  }
  const record = requireObject(chain, `chains[${index}]`);
  const instance = record["instance"];
  if (looksLikeCatalogueEntry(instance)) {
    throw new CatalogueRailRejectedError(
      `chains[${index}].instance is a provider CATALOGUE entry — a catalogue claim never qualifies a rail (INV-13)`,
      { index, catalogueEntryId: (instance as { catalogueEntryId: string }).catalogueEntryId },
    );
  }
  if (!isInstanceScope(instance)) {
    throw new RailSnapshotError(
      `chains[${index}].instance must carry the connected-instance scope surface (instanceId, accountRef, tenantRef, authorization, permissionState, eligibility, geography, currencies)`,
      { index },
    );
  }
  return instance;
}

function requireObservationScope(chain: unknown, index: number): PinnedObservationScope {
  const record = requireObject(chain, `chains[${index}]`);
  const observation = record["observation"];
  if (!isRecord(observation)) {
    throw new RailSnapshotError(`chains[${index}].observation must be an object`, { index });
  }
  const candidate = observation as Partial<PinnedObservationScope>;
  if (
    typeof candidate.instanceId !== "string" || candidate.instanceId === "" ||
    !isStrictIsoUtcTimestamp(candidate.observedAt) ||
    typeof candidate.observationVersion !== "number" || !Number.isSafeInteger(candidate.observationVersion) ||
    candidate.observationVersion < 1
  ) {
    throw new RailSnapshotError(
      `chains[${index}].observation must carry instanceId, a strict ISO-8601 UTC observedAt stamp and a positive integer observationVersion`,
      { index },
    );
  }
  return observation as unknown as PinnedObservationScope;
}

function validateSideRequest(request: RailSnapshotSideRequest): void {
  if (request.side !== "SENDER" && request.side !== "RECIPIENT") {
    throw new RailSnapshotError("the snapshot side must be SENDER or RECIPIENT");
  }
  const query = requireObject(request.query, "the corridor query");
  const codeOf = (value: unknown, pattern: RegExp): value is string =>
    typeof value === "string" && pattern.test(value);
  for (const field of ["sourceCountry", "destinationCountry"] as const) {
    if (!codeOf(query[field], /^[A-Z]{2}$/)) {
      throw new RailSnapshotError(`query.${field} must be an ISO 3166-1 alpha-2 code`);
    }
  }
  for (const field of ["sourceCurrency", "destinationCurrency"] as const) {
    if (!codeOf(query[field], /^[A-Z]{3}$/)) {
      throw new RailSnapshotError(`query.${field} must be a three-letter currency code`);
    }
  }
  if (query["customerType"] !== "PERSONAL" && query["customerType"] !== "BUSINESS") {
    throw new RailSnapshotError("query.customerType must be PERSONAL or BUSINESS");
  }
  const sendAmount = requireObject(query["sendAmount"], "query.sendAmount");
  if (!codeOf(sendAmount["currency"], /^[A-Z]{3}$/)) {
    throw new RailSnapshotError("query.sendAmount.currency must be a three-letter currency code");
  }
  if (!codeOf(sendAmount["minorUnits"], /^(0|[1-9][0-9]*)$/)) {
    throw new RailSnapshotError("query.sendAmount.minorUnits must be a canonical integer string");
  }
  if (!isStrictIsoUtcTimestamp(query["asOf"])) {
    throw new RailSnapshotError("query.asOf must be a strict ISO-8601 UTC timestamp (caller-supplied data, never a clock read)");
  }
  const policy = requireObject(request.freshnessPolicy, "the freshness policy");
  const maxAgeSeconds = policy["maxAgeSeconds"];
  if (typeof maxAgeSeconds !== "number" || !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1) {
    throw new RailSnapshotError("freshnessPolicy.maxAgeSeconds must be a positive integer");
  }
  if (!Array.isArray(request.chains)) {
    throw new RailSnapshotError("chains must be an array of four-layer corridor route chains");
  }
  const seen = new Set<string>();
  for (let index = 0; index < request.chains.length; index += 1) {
    const chain = request.chains[index] as PinnedCorridorRouteChain;
    const instance = requireInstanceScope(chain, index);
    const observation = requireObservationScope(chain, index);
    if (observation.instanceId !== instance.instanceId) {
      throw new RailSnapshotError(
        `chains[${index}]: observation instanceId '${observation.instanceId}' does not match the connected instance '${instance.instanceId}' (the chain rule)`,
        { index },
      );
    }
    if (seen.has(instance.instanceId)) {
      throw new RailSnapshotError(
        `duplicate connected instance '${instance.instanceId}' — a rail appears at most once per side`,
        { instanceId: instance.instanceId },
      );
    }
    seen.add(instance.instanceId);
  }
}

function limitsOf(
  restrictionSets: readonly PinnedCorridorRestrictionSet[],
  lineage: PinnedCorridorRouteLineage,
  quota: PinnedObservationScope["quota"],
): RailLimitDisclosure {
  return deepFreeze({
    restrictionSetIds: lineage.restrictionSetIds,
    amountLimits: Object.freeze(
      restrictionSets.flatMap((set) => (set.amountLimits !== undefined ? [set.amountLimits] : [])),
    ),
    cutoffs: Object.freeze(
      restrictionSets.flatMap((set) =>
        set.cutoffs.map((cutoff) => ({
          cutoffId: cutoff.cutoffId,
          cutoffTimeUtc: cutoff.cutoffTimeUtc,
          processingDayRule: cutoff.processingDayRule,
        })),
      ),
    ),
    termsRefs: Object.freeze(
      restrictionSets.flatMap((set) => (set.terms !== undefined ? [set.terms] : [])),
    ),
    ...(quota !== undefined ? { quota: Object.freeze({ ...quota }) } : {}),
  });
}

/**
 * Derive ONE side's eligible-rail snapshot: a single corridor evaluation
 * through the injected port (the REAL capability machinery), with its own
 * observation grounding and the caller-supplied query instant. The
 * snapshot records EVERY evaluated rail with its verdict and the FULL
 * typed exclusion list; only REAL-projection-eligible route ids enter
 * eligibleRouteIds (catalogue-only, stale, unscoped or unauthorized
 * instances never qualify).
 */
export function deriveEligibleRailSnapshot(
  request: RailSnapshotSideRequest,
): EligibleRailSnapshot {
  validateSideRequest(request);
  const corridorPort = requireCorridorProjectionPort(request.corridorPort);
  const sideEvaluation = corridorPort.evaluateSide({
    side: request.side,
    query: request.query,
    freshnessPolicy: request.freshnessPolicy,
    chains: request.chains,
  });
  if (
    sideEvaluation === null ||
    typeof sideEvaluation !== "object" ||
    !Array.isArray(sideEvaluation.routeRestrictionSets) ||
    sideEvaluation.routeRestrictionSets.length !== sideEvaluation.view.routes.length
  ) {
    throw new RailSnapshotError(
      "the corridor side evaluation is malformed: routeRestrictionSets must be index-aligned with view.routes",
    );
  }
  const records = sideEvaluation.view.routes.map((route, index) => {
    const chain = request.chains[index];
    if (chain === undefined || route.lineage.connectedInstanceId !== chain.instance.instanceId) {
      throw new RailSnapshotError(
        `the corridor view's route ${index} does not correspond to chains[${index}] (lineage/chain mismatch — a malformed port never assembles a snapshot)`,
        { index, routeId: route.routeId },
      );
    }
    const record: EligibleRailSnapshotRecord = deepFreeze({
      routeId: route.routeId,
      side: request.side,
      eligible: route.eligible,
      evaluation: route,
      lineage: route.lineage,
      observationVersion: route.lineage.observationVersion,
      observedAt: route.lineage.observedAt,
      freshnessPolicy: request.freshnessPolicy,
      stale: route.exclusionReasons.some(
        (exclusion) => exclusion.code === PINNED_STALE_OBSERVATION_CODE,
      ),
      scopes: deepFreeze({
        instanceId: chain.instance.instanceId,
        capabilityId: chain.instance.capabilityId,
        implementationId: chain.instance.implementationId,
        accountRef: chain.instance.accountRef,
        tenantRef: chain.instance.tenantRef,
        authorizationStatus: chain.instance.authorization.status,
        permissionState: chain.instance.permissionState,
        geography: chain.instance.geography.countries,
        currencies: chain.instance.currencies,
      }),
      limits: limitsOf(
        sideEvaluation.routeRestrictionSets[index] ?? [],
        route.lineage,
        chain.observation.quota,
      ),
      exclusions: route.exclusionReasons,
      effectiveAvailability: route.effectiveAvailability,
      offeredExecutionModes: route.offeredExecutionModes,
    });
    return record;
  });
  const eligibleRouteIds = records.filter((record) => record.eligible).map((record) => record.routeId);
  // The digest binds the PINNED evaluation surface this package discloses
  // (the corridor pin's own fields): the verbatim authority evaluation is
  // preserved on the record for consumers, but the authority may carry
  // lane-owned optional members with ABSENT values (e.g. `certified:`),
  // which are not digestable wire data under the one canonical flavor
  // (ADR-0009 D4 — the flavor rejects undefined; the pinned projection is
  // this package's value form).
  const snapshotDigest = contentDigest({
    side: request.side,
    query: request.query,
    evaluatedAsOf: request.query.asOf,
    freshnessPolicy: request.freshnessPolicy,
    rails: records.map((record) => ({
      routeId: record.routeId,
      eligible: record.eligible,
      lineage: record.lineage,
      observationVersion: record.observationVersion,
      observedAt: record.observedAt,
      stale: record.stale,
      scopes: record.scopes,
      limits: record.limits,
      exclusions: record.exclusions,
      effectiveAvailability: record.effectiveAvailability,
      offeredExecutionModes: record.offeredExecutionModes,
      termsRefs: record.evaluation.termsRefs,
    })),
    eligibleRouteIds,
  });
  return deepFreeze({
    side: request.side,
    query: request.query,
    evaluatedAsOf: request.query.asOf,
    freshnessPolicy: request.freshnessPolicy,
    rails: Object.freeze(records),
    eligibleRouteIds: Object.freeze(eligibleRouteIds),
    snapshotDigest,
    railsPermitExecution: false,
  });
}

/**
 * Derive the sender AND recipient snapshots INDEPENDENTLY: two separate
 * corridor evaluations (each with its own chains, observations, query and
 * port binding) — no cross-side contamination (test-enforced).
 */
export function deriveRailSnapshotPair(input: {
  readonly sender: RailSnapshotSideRequest;
  readonly recipient: RailSnapshotSideRequest;
}): { readonly sender: EligibleRailSnapshot; readonly recipient: EligibleRailSnapshot } {
  if (input.sender.side !== "SENDER" || input.recipient.side !== "RECIPIENT") {
    throw new RailSnapshotError(
      "the pair derivation requires side SENDER on the sender request and side RECIPIENT on the recipient request",
    );
  }
  return deepFreeze({
    sender: deriveEligibleRailSnapshot(input.sender),
    recipient: deriveEligibleRailSnapshot(input.recipient),
  });
}
