/**
 * @payswap/opportunities — the pinned wire shapes of the capability
 * fabric's observation + eligibility model (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/capability (P2-W1). The evidence discipline this
 * discovery projection follows is the capability lane's: VERSIONED
 * OBSERVATIONS (monotonic per-instance observationVersion — pinned for
 * opportunity evidence identically); TWO-AXIS AVAILABILITY (state and
 * source reachability separate; UNREACHABLE/UNKNOWN source -> UNKNOWN —
 * never success, never failure; resolver behaviour-identical, asserted by
 * test/pins.test.ts); the closed ELIGIBLE | NOT_ELIGIBLE | UNKNOWN
 * vocabulary; INV-13 (the ConnectedCapabilityInstance is the ONLY
 * authorization scope; a catalogue entry can never ground an executable
 * block — the law the Lab-composition sites prove).
 */

// ---------------------------------------------------------------------------
// The two-axis availability law (CREDITED to the capability lane — P2-W1)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability src/availability.ts
 * `CAPABILITY_STATES` (byte-identical).
 */
export const PINNED_CAPABILITY_STATES = Object.freeze([
  "AVAILABLE",
  "DEGRADED",
  "UNAVAILABLE",
] as const);

/** STRUCTURAL PIN — authority: @payswap/capability `CapabilityState`. */
export type PinnedCapabilityState = (typeof PINNED_CAPABILITY_STATES)[number];

/**
 * VALUE PIN — authority: @payswap/capability src/availability.ts
 * `SOURCE_AVAILABILITIES` (byte-identical).
 */
export const PINNED_SOURCE_AVAILABILITIES = Object.freeze([
  "REACHABLE",
  "UNREACHABLE",
  "UNKNOWN",
] as const);

/** STRUCTURAL PIN — authority: @payswap/capability `SourceAvailability`. */
export type PinnedSourceAvailability =
  (typeof PINNED_SOURCE_AVAILABILITIES)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `EffectiveAvailability`. There is deliberately NO 'FAILED' member —
 * external ambiguity can never be converted into failure or success.
 */
export type PinnedEffectiveAvailability =
  | "AVAILABLE"
  | "DEGRADED"
  | "UNAVAILABLE"
  | "UNKNOWN";

/**
 * VALUE PIN — authority: @payswap/capability
 * `resolveEffectiveAvailability` (behaviour-identical; asserted by
 * test/pins.test.ts): REACHABLE -> the state governs; UNREACHABLE or
 * UNKNOWN -> UNKNOWN (never success, never failure).
 */
export function pinnedResolveEffectiveAvailability(
  state: PinnedCapabilityState,
  source: PinnedSourceAvailability,
): PinnedEffectiveAvailability {
  switch (source) {
    case "REACHABLE":
      return state;
    case "UNREACHABLE":
      return "UNKNOWN";
    case "UNKNOWN":
      return "UNKNOWN";
  }
}

// ---------------------------------------------------------------------------
// The observation discipline (versioned, evidence — never authorization)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/observation.ts
 * `EligibilityObservation` (byte-identical closed vocabulary).
 */
export type PinnedEligibilityObservation =
  | "ELIGIBLE"
  | "NOT_ELIGIBLE"
  | "UNKNOWN";

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `ObservationProvenance` (subset: the source-of-record vocabulary).
 */
export interface PinnedObservationProvenance {
  readonly providerName: string;
  readonly source:
    | "PROVIDER_API"
    | "PROVIDER_WEBHOOK"
    | "OPERATOR"
    | "INTERNAL";
  readonly capturedAt: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `CapabilityObservation` (SUBSET: identity, monotonic version, the two
 * axes, derived availability, eligibility; health/quota/terms and the
 * INV-14 envelope are the authority's — opaque here). OBSERVATIONS ARE
 * EVIDENCE, NEVER AUTHORIZATION: an ELIGIBLE observation never
 * substitutes for protocol authorization.
 */
export interface PinnedCapabilityObservation {
  readonly instanceId: string;
  readonly observedAt: string;
  /** Monotonic per-instance observation version (positive integer). */
  readonly observationVersion: number;
  readonly capabilityState: PinnedCapabilityState;
  readonly sourceAvailability: PinnedSourceAvailability;
  /** DERIVED from the two axes — never caller-declared. */
  readonly availability: PinnedEffectiveAvailability;
  readonly eligibility: PinnedEligibilityObservation;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/connected-instance.ts
 * `ConnectedCapabilityInstance` (SUBSET: the ONLY authorization scope in
 * the fabric). Pinned ONLY for the contrast law: a FinancialOpportunity
 * is deliberately INCOMPATIBLE with it — no instanceId, no
 * authorization, no permission state, no exported conversion.
 */
export interface PinnedConnectedInstanceScope {
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly authorization: {
    readonly status: "ACTIVE" | "PENDING" | "REVOKED" | "EXPIRED" | "UNKNOWN";
  };
  readonly eligibility: {
    readonly eligible: boolean;
    readonly reasons: readonly string[];
  };
}

/**
 * VALUE PIN — authority: @payswap/capability INV-13
 * (catalogue-never-authorizes): a value that structurally CANNOT be a
 * connected instance is a catalogue-shaped claim and may never ground an
 * executable block (behaviour-identical to the Lab's own pin of the same
 * authority).
 */
export function pinnedLooksLikeConnectedInstance(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<PinnedConnectedInstanceScope>;
  return (
    typeof record.instanceId === "string" &&
    record.instanceId.length > 0 &&
    record.authorization !== null &&
    typeof record.authorization === "object" &&
    typeof record.authorization.status === "string" &&
    record.eligibility !== null &&
    typeof record.eligibility === "object" &&
    typeof record.eligibility.eligible === "boolean"
  );
}

// ---------------------------------------------------------------------------
// The corridor exclusion vocabulary (P23-A, ADR-0015 D2 — the 26 codes the
// repair-operator catalogue is TOTAL over)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability src/corridor-types.ts
 * `CORRIDOR_EXCLUSION_CODES` (byte-identical, all 26 entries, same order —
 * corridor-types.ts:48-75): the stable machine codes for every exclusion
 * the corridor projection can surface. The typed repair-operator catalogue
 * (./repair-operators.ts) is TOTAL over EXACTLY this list: every code is
 * either operator-applicable (at least one repair operator's
 * `applicableExclusionCodes`) or carries exactly one honest non-operator
 * classification row (./repair-classifications.ts) — never both, never
 * neither (the totality law, machine-checked by the battery).
 */
export const PINNED_CORRIDOR_EXCLUSION_CODES = Object.freeze([
  "AUTHORIZATION_NOT_ACTIVE",
  "INSTANCE_INELIGIBLE",
  "MISSING_PERMISSIONS",
  "INSTANCE_GEOGRAPHY_NOT_SERVED",
  "INSTANCE_CURRENCY_NOT_SUPPORTED",
  "IMPLEMENTATION_SCOPE_NOT_SERVED",
  "AVAILABILITY_UNAVAILABLE",
  "AVAILABILITY_UNKNOWN",
  "OBSERVATION_NOT_ELIGIBLE",
  "OBSERVATION_ELIGIBILITY_UNKNOWN",
  "STALE_OBSERVATION",
  "QUOTA_EXHAUSTED",
  "SOURCE_COUNTRY_NOT_SERVED",
  "DESTINATION_COUNTRY_NOT_SERVED",
  "SOURCE_CURRENCY_NOT_SUPPORTED",
  "DESTINATION_CURRENCY_NOT_SUPPORTED",
  "CUSTOMER_TYPE_NOT_SERVED",
  "AMOUNT_BELOW_MINIMUM",
  "AMOUNT_ABOVE_MAXIMUM",
  "AMOUNT_CURRENCY_MISMATCH",
  "FUNDING_METHOD_NOT_SERVED",
  "PAYOUT_METHOD_NOT_SERVED",
  "RECIPIENT_TYPE_NOT_SERVED",
  "MISSING_REQUIRED_FIELDS",
  "CUTOFF_PASSED",
  "NOT_EXECUTABLE_CAPABILITY",
] as const);

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/corridor-types.ts
 * `CorridorExclusionCode` (the 26-member union over the pinned list).
 */
export type PinnedCorridorExclusionCode = (typeof PINNED_CORRIDOR_EXCLUSION_CODES)[number];

/** Fail-closed membership test over the pinned corridor exclusion vocabulary. */
export function isPinnedCorridorExclusionCode(value: unknown): value is PinnedCorridorExclusionCode {
  return typeof value === "string" && (PINNED_CORRIDOR_EXCLUSION_CODES as readonly unknown[]).includes(value);
}
