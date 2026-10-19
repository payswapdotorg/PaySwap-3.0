/**
 * @payswap/opportunities — the pinned wire shapes of the Reality
 * Engineering Lab (P6-W2, lane r4-w2; commit 1/4).
 *
 * Authority: @payswap/lab (P6-W1, lane R4-W1 — NOW LANDED at base
 * 0755624). The old onchain-opportunities package drove the REAL Lab from
 * its test layer (the repository-wide INV-L01 discipline: no other
 * package's src/** imports the Lab runtime). Under the STRICTER
 * zero-sibling law of this rebuild, even the test layer may not import
 * @payswap/lab — so the lab-composition proofs are re-based onto THESE
 * PINNED WIRE SHAPES: the family registration surface stays pure data
 * (src/lab-registration.ts), and the test-layer composition harness
 * implements the Lab's OWN pinned selection laws (INV-13
 * catalogue-entry-only; the proposal-only composition constraint) over
 * the shapes below. The real Lab composition is TL-wired at integration;
 * the pinned laws are asserted byte-identical by test/pins.test.ts.
 *
 * Pins in this module (authority: @payswap/lab):
 * - PINNED_LAB_EXECUTION_MODES + the accepted `execution` field rename
 * - PinnedLabCapabilityDefinition (the declared-capability vocabulary the
 *   Lab search indexes)
 * - PinnedLabConnectedInstance (the ONLY executable grounding scope)
 * - PinnedLabCatalogueEntry (the advertisement shape — never authority)
 * - PinnedLabObservation (the two-axis observed evidence)
 * - PinnedLabSearchIndex / PinnedLabSearchQuery / PinnedLabSearchSelection
 *   / PinnedLabExecutableBlock + the frozen rejection-reason vocabulary
 * - PinnedLabSearchPlugin (the replaceable optimizer seam)
 * - PinnedLabDomainPack (the ten-dimension domain declaration subset)
 * - PINNED_LAB_PROPOSAL_ONLY_CONSTRAINT (INV-9)
 */

// ---------------------------------------------------------------------------
// Execution modes + the accepted field rename (CREDITED: capability lane)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/lab pins/capability.ts
 * `PINNED_EXECUTION_MODES` (itself pinned from @payswap/capability
 * src/execution-modes.ts; byte-identical, one hop closer). NONE of the
 * modes bypasses protocol authorization; INV-15: no mode priority.
 */
export const PINNED_LAB_EXECUTION_MODES = Object.freeze([
  "PASS_THROUGH_NATIVE",
  "COMPOSED_PAYSWAP",
  "OPTIMIZED_MULTI_PROVIDER",
] as const);

/** STRUCTURAL PIN — authority: @payswap/lab `PinnedExecutionMode`. */
export type PinnedLabExecutionMode =
  (typeof PINNED_LAB_EXECUTION_MODES)[number];

// ---------------------------------------------------------------------------
// The searchable capability vocabulary (the Lab search index shapes)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/lab pins/capability.ts
 * `PinnedCapabilityDefinition` (SUBSET of the capability lane's
 * CapabilityDefinition): the declared-capability vocabulary the Lab search
 * indexes. Opportunity family capabilities compile INTO this shape in the
 * test-layer composition harness.
 */
export interface PinnedLabCapabilityDefinition {
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly summary: string;
  readonly kind: string;
  readonly requiredPermissions: readonly string[];
  readonly executionModes: readonly PinnedLabExecutionMode[];
  readonly nativeOptimization?: {
    readonly optimizationKind: string;
    readonly benchmarkBaseline: boolean;
  };
}

/**
 * STRUCTURAL PIN — authority: @payswap/lab pins/capability.ts
 * `PinnedConnectedInstance` (SUBSET): the ONLY executable grounding scope
 * (INV-13 — a catalogue entry is never a connected instance).
 */
export interface PinnedLabConnectedInstance {
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly providerName: string;
  readonly authorization: {
    readonly status: "ACTIVE" | "PENDING" | "REVOKED" | "EXPIRED" | "UNKNOWN";
  };
  readonly geography: {
    readonly countries: readonly string[];
  };
  readonly currencies: readonly string[];
  readonly eligibility: {
    readonly eligible: boolean;
    readonly reasons: readonly string[];
  };
}

/**
 * STRUCTURAL PIN — authority: @payswap/lab pins/capability.ts
 * `PinnedProviderCatalogueEntry` (SUBSET): the platform-wide advertisement
 * shape — deliberately NON-overlapping with the instance shape (no
 * instanceId, no authorization, no eligibility: INV-13).
 */
export interface PinnedLabCatalogueEntry {
  readonly catalogueEntryId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly capabilityId: string;
  readonly summary: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/lab pins/observation.ts
 * `PinnedCapabilityObservation` (SUBSET): the two-axis observed evidence
 * with the monotonic observation version and the DERIVED availability.
 */
export interface PinnedLabObservation {
  readonly instanceId: string;
  readonly observedAt: string;
  /** Monotonic per-instance observation version. */
  readonly observationVersion: number;
  readonly capabilityState: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
  readonly sourceAvailability: "REACHABLE" | "UNREACHABLE" | "UNKNOWN";
  /** DERIVED from the two axes — never caller-declared. */
  readonly availability: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
  readonly eligibility: "ELIGIBLE" | "NOT_ELIGIBLE" | "UNKNOWN";
}

// ---------------------------------------------------------------------------
// The Lab search wire (query, index, selection, executable block)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/lab src/search.ts `LabSearchQuery`.
 * NOTE THE FIELD NAME: `execution` — the accepted P6-W1 rename of the old
 * `executionMode` field (the vocabulary is the capability lane's).
 */
export interface PinnedLabSearchQuery {
  readonly domain: string;
  readonly currency?: string;
  readonly execution?: PinnedLabExecutionMode;
  readonly country?: string;
  readonly capabilityId?: string;
}

/**
 * VALUE PIN — authority: @payswap/lab src/search.ts
 * `SearchRejectionReason` (the frozen rejection vocabulary, byte-identical).
 */
export const PINNED_LAB_REJECTION_REASONS = Object.freeze([
  "CATALOGUE_ENTRY_ONLY",
  "NO_CONNECTED_INSTANCE",
  "NO_OBSERVATION",
  "AUTHORIZATION_NOT_ACTIVE",
  "NOT_ELIGIBLE",
  "CURRENCY_NOT_SUPPORTED",
  "GEOGRAPHY_NOT_SUPPORTED",
  "EFFECTIVELY_UNAVAILABLE",
] as const);

/** STRUCTURAL PIN — authority: @payswap/lab `SearchRejectionReason`. */
export type PinnedLabRejectionReason =
  (typeof PINNED_LAB_REJECTION_REASONS)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/lab src/search.ts
 * `SearchSelection` (SUBSET of the EXECUTABLE/UNKNOWN/REJECTED union: the
 * REJECTED arm with the frozen reason vocabulary — the arm the
 * lab-composition proofs drive; the EXECUTABLE arm's fields are the
 * executable-block fields below).
 */
export type PinnedLabSearchSelection =
  | {
      readonly status: "EXECUTABLE";
      readonly definition: PinnedLabCapabilityDefinition;
      readonly instance: PinnedLabConnectedInstance;
      readonly observation: PinnedLabObservation;
      readonly effectiveAvailability: "AVAILABLE" | "DEGRADED";
      readonly isIncumbentBaseline: boolean;
    }
  | {
      readonly status: "REJECTED";
      readonly definition: PinnedLabCapabilityDefinition | undefined;
      readonly catalogueEntry: PinnedLabCatalogueEntry | undefined;
      readonly reason: PinnedLabRejectionReason;
      readonly detail: string;
    };

/**
 * STRUCTURAL PIN — authority: @payswap/lab src/search.ts
 * `ExecutableBlock`: a connected instance + its current observation — the
 * ONLY shape that can ground executable Lab selection (INV-13).
 */
export interface PinnedLabExecutableBlock {
  readonly definition: PinnedLabCapabilityDefinition;
  readonly instance: PinnedLabConnectedInstance;
  readonly observation: PinnedLabObservation;
  readonly effectiveAvailability: "AVAILABLE" | "DEGRADED";
  readonly isIncumbentBaseline: boolean;
}

/**
 * STRUCTURAL PIN — authority: @payswap/lab src/search.ts
 * `LabSearchIndex`: the deterministic fabric snapshot the search runs over.
 */
export interface PinnedLabSearchIndex {
  readonly definitions: readonly PinnedLabCapabilityDefinition[];
  readonly instances: readonly PinnedLabConnectedInstance[];
  readonly observations: readonly PinnedLabObservation[];
  readonly catalogueEntries: readonly PinnedLabCatalogueEntry[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/lab src/search-plugins.ts
 * `LabSearchPlugin` (SUBSET: the replaceable optimizer seam — plug-in
 * output is advisory candidate data, never authority: INV-9/INV-10).
 */
export interface PinnedLabSearchPlugin {
  readonly pluginId: string;
  readonly description: string;
  search(input: {
    readonly executableBlocks: readonly PinnedLabExecutableBlock[];
    readonly query: PinnedLabSearchQuery;
  }): readonly { readonly candidateId: string; readonly origin: string }[];
}

// ---------------------------------------------------------------------------
// The Domain Pack (the Lab's ten-dimension domain declaration, SUBSET)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/lab src/domain-packs.ts
 * `DomainPack` (SUBSET: the identity, domain, scenario types, hard
 * constraints, observables, action space, failure taxonomy, policy set
 * and provenance-requirement dimensions the opportunity-discovery domain
 * declares; the evaluation-suite reference and objectives are the Lab's
 * own evaluation law — opaque here).
 */
export interface PinnedLabDomainPack {
  readonly packId: string;
  readonly version: string;
  readonly domain: string;
  readonly scenarioTypes: readonly string[];
  readonly hardConstraints: readonly string[];
  readonly observables: readonly string[];
  readonly actionSpace: readonly {
    readonly dimensionId: string;
    readonly description: string;
    readonly domain: readonly string[];
  }[];
  readonly failureTaxonomy: readonly string[];
  readonly policySet: readonly string[];
  readonly provenanceRequirements: readonly {
    readonly requirementId: string;
    readonly description: string;
    readonly acceptedEvidenceKinds: readonly string[];
  }[];
}

// ---------------------------------------------------------------------------
// The Lab composition laws (VALUE pins — the never-authority constants)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/lab src/candidates.ts
 * `LAB_PROPOSAL_ONLY_CONSTRAINT` (byte-identical): Lab composition is a
 * proposal, not a grant — no budgets, no delegation, no mandate.
 */
export const PINNED_LAB_PROPOSAL_ONLY_CONSTRAINT =
  "LAB_COMPOSITION_IS_A_PROPOSAL_NOT_A_GRANT" as const;

/**
 * VALUE PIN — authority: @payswap/lab src/search.ts `INV-13` selection
 * law: a capability with NO connected instance is REJECTED with reason
 * CATALOGUE_ENTRY_ONLY — a catalogue claim alone can never authorize
 * execution. Opportunity families are searchable catalogue entries and
 * therefore NEVER executable blocks (the lab-composition law).
 */
export const PINNED_LAB_CATALOGUE_ENTRY_ONLY =
  "CATALOGUE_ENTRY_ONLY" as const;
