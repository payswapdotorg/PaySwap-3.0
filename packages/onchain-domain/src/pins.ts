/**
 * @payswap/onchain-domain — the PINNED WIRE SHAPES of the capability fabric
 * (P4-W1, lane R2-W1).
 *
 * LAYER LAW (spec/architecture/MODULE-OWNERSHIP.yaml, layer `rails`):
 * packages/onchain-domain is a v1 hermetic rails package — ZERO sibling
 * imports, no tsconfig paths entries. Where a PaySwap contract shape owned
 * by an authority lane is needed, it is re-declared here as a MINIMAL
 * SUBSET-TYPED STRUCTURAL MIRROR with an authority-naming doc comment (the
 * accepted structural-pin pattern: packages/agents/src/amount.ts,
 * packages/capability/src/capability-definition.ts PROOF_LEVEL_PIN,
 * packages/execution-graph/src/identifiers.ts).
 *
 * Every mirror below names its AUTHORITY — the lane that owns the shape and
 * its laws (@payswap/capability, the Capability and Network Authority's
 * contract package). The mirrors are deliberately SUBSET-typed: the onchain
 * domain requires LESS than the authority, so any genuine authority value
 * remains structurally assignable to the pin, while a pin can never widen
 * an authority law. Vocabulary VALUES are pinned byte-identical to the
 * authority lanes and their cross-lane consistency is asserted by
 * test/pins.test.ts (value pinning, never value imports — a value import
 * would be a runtime dependency).
 *
 * Pins in this module (authority: @payswap/capability):
 * - ProvenanceDescriptorPin, PINNED_CAPABILITY_CLASSES (catalogue base)
 * - PinnedCapabilityDefinition (the executable/non-executable catalogue arms)
 * - ProviderImplementationPin (layer-2 subset: identity + version pins)
 * - ConnectedInstancePin (layer 3 — the INV-13 authorization scope)
 * - ProviderCatalogueEntryPin (the INV-13 advertisement shape)
 * - PINNED_EXECUTION_MODES + PinnedConnectorExecutionRequest (explicit-mode
 *   + protocol-authorization-link law, INV-15/INV-5)
 * - ObservationProvenancePin
 * - PINNED_FINANCIAL_EFFECT_CLASSES (the executable-declaration effect law)
 * Structural validators for these pins live in pins-validation.ts; the
 * smart-contract declaration pin lives in pins-smart-contract.ts; the
 * settlement-machinery pins live in pins-settlement.ts.
 */

// ---------------------------------------------------------------------------
// Catalogue provenance + capability classes (layer 1 base pins)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/capability-definition.ts `ProvenanceDescriptor` ({ declaredBy,
 * artifactRef, contentHash }). Catalogue entries carry provenance: a
 * descriptive declaration without provenance is rejected by the domain
 * validators (an anonymous claim is never evidence).
 */
export interface ProvenanceDescriptorPin {
  readonly declaredBy: string;
  readonly artifactRef: string;
  readonly contentHash: string;
}

/**
 * VALUE PIN — authority: @payswap/capability
 * src/capability-definition.ts `CAPABILITY_CLASSES` (the 13 classes). Onchain
 * catalogue entries are `rail_movement` (a chain is a settlement-rail family
 * member — INV-17). Pinned locally, byte-identical; cross-lane consistency
 * is test-enforced (test/pins.test.ts).
 */
export const PINNED_CAPABILITY_CLASSES = [
  "rail_movement",
  "liquidity",
  "fx",
  "credit",
  "lending",
  "merchant_acceptance",
  "identity_kyc_aml",
  "expert_resolution",
  "agent_behavior",
  "software_extension",
  "developer_service",
  "verification",
  "data_oracle",
] as const;

/** STRUCTURAL PIN — authority: @payswap/capability `CapabilityClass`. */
export type PinnedCapabilityClass = (typeof PINNED_CAPABILITY_CLASSES)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/capability-definition.ts `CapabilityDefinitionBase` (SUBSET: the
 * onchain domain requires id/version/class/provenance; the authority's base
 * additionally carries conditions, cost, risk, economicAccountability and
 * proofRequirements — owned and validated by the capability lane, opaque
 * here). Branded ids (`CapabilityDefinitionId`, `VersionString`) are plain
 * strings on the pin — the brands are the authority's compile-time nominal
 * discipline, not a wire difference.
 */
export interface PinnedDefinitionBase {
  /** The capability definition id (authority brand: CapabilityDefinitionId). */
  readonly id: string;
  readonly version: string;
  readonly capabilityClass: PinnedCapabilityClass;
  readonly provenance: ProvenanceDescriptorPin;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `ExecutableCapabilityDefinition` (executable arm of the catalogue union).
 * The fourteen-part executable declaration law
 * (src/executable-declaration.ts) is the CAPABILITY LANE's authority: the
 * onchain domain requires only its structural PRESENCE (`execution` is a
 * non-null object) and validates the onchain flavor payload it owns.
 */
export interface PinnedExecutableDefinition extends PinnedDefinitionBase {
  readonly executable: true;
  /** The authority's ExecutableCapabilityDeclaration (14-part law) — opaque. */
  readonly execution: object;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `NonExecutableCapabilityDefinition` (non-executable arm: informational,
 * acceptance-only, advisory — executable absence is EXPLICIT, never silent).
 */
export interface PinnedNonExecutableDefinition extends PinnedDefinitionBase {
  readonly executable: false;
  readonly nonExecutableReason: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability `CapabilityDefinition`
 * (the discriminated union). Onchain catalogue entries extend one arm:
 * chain definitions extend the NON-executable arm (a chain is an
 * observation surface — consequential writes are onchain execution
 * capabilities, never chain catalogue entries); protocol definitions and
 * the onchain capability flavors extend the executable arm.
 */
export type PinnedCapabilityDefinition =
  | PinnedExecutableDefinition
  | PinnedNonExecutableDefinition;

// ---------------------------------------------------------------------------
// Layer 2 — ProviderImplementation subset pin
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/provider-implementation.ts `ProviderImplementation` (SUBSET: identity,
 * version pins and the opaque adapter reference; the authority's shape
 * additionally carries corridors, knownDeviations, nativeOptimization and
 * the narrowing restrictionSet — owned by the capability lane). The version
 * pin law carries over: `capabilityVersion` is the EXACT definition-version
 * pin (catalogue resolution must be deterministic).
 */
export interface ProviderImplementationPin {
  readonly implementationId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly capabilityId: string;
  /** Exact definition-version pin (authority law: never omitted). */
  readonly capabilityVersion: string;
  /** Implementation version (independent of the definition version). */
  readonly version: string;
  /**
   * Opaque, provider-neutral reference to the concrete adapter that will
   * realize this implementation (owned by the provider-runtime lane,
   * P2-W2). Deliberately a string.
   */
  readonly adapterRef: string;
}

// ---------------------------------------------------------------------------
// Layer 3 — ConnectedInstancePin (the ONLY authorization scope — INV-13)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/connected-instance.ts `ConnectorAuthorizationState`.
 */
export interface PinnedAuthorizationState {
  readonly status: "ACTIVE" | "PENDING" | "REVOKED" | "EXPIRED" | "UNKNOWN";
  readonly grantedAt?: string;
  readonly revokedAt?: string;
  readonly authorizationRef?: string;
}

/** STRUCTURAL PIN — authority: @payswap/capability `GeographyScope`. */
export interface PinnedGeographyScope {
  readonly countries: readonly string[];
  readonly regions?: readonly string[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability `CredentialScope`
 * (INV-19: `credentialRef` is an OPAQUE reference into the credential
 * broker — an instance NEVER carries credential material itself).
 */
export interface PinnedCredentialScope {
  readonly credentialRef: string;
  readonly credentialKind:
    | "API_KEY"
    | "OAUTH"
    | "DELEGATED_TOKEN"
    | "SESSION"
    | "PROVIDER_DEFINED";
  readonly delegationRef?: string;
}

/** STRUCTURAL PIN — authority: @payswap/capability `ConnectorPermissionState`. */
export interface PinnedPermissionState {
  readonly granted: readonly string[];
  readonly requested: readonly string[];
  readonly missing: readonly string[];
}

/** STRUCTURAL PIN — authority: @payswap/capability `InstanceEligibility`. */
export interface PinnedInstanceEligibility {
  readonly eligible: boolean;
  /** Empty when eligible; otherwise the disqualifying reasons. */
  readonly reasons: readonly string[];
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/connected-instance.ts `ConnectedCapabilityInstance` (layer 3): the
 * capability actually exposed by ONE connected provider account/tenant —
 * the scoped, authorized, eligible EXECUTION SURFACE for a real connection.
 * This is the ONLY shape that can authorize onchain execution (INV-13:
 * catalogue claims never authorize). The onchain domain's
 * ConnectedChainInstance / ConnectedProtocolInstance extend this pin.
 */
export interface ConnectedInstancePin {
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  /** The connected account this instance is scoped to. */
  readonly accountRef: string;
  readonly tenantRef: string;
  readonly authorization: PinnedAuthorizationState;
  readonly credentialScope: PinnedCredentialScope;
  readonly geography: PinnedGeographyScope;
  readonly currencies: readonly string[];
  readonly permissionState: PinnedPermissionState;
  readonly eligibility: PinnedInstanceEligibility;
  /** Provider-neutral configuration surface (opaque keys to primitives). */
  readonly configuration: Readonly<Record<string, string | number | boolean>>;
}

// ---------------------------------------------------------------------------
// The INV-13 advertisement shape (catalogue — never authority)
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/connected-instance.ts `ProviderCatalogueEntry`: a platform-wide
 * catalogue entry describing what a provider CAN do — an ADVERTISEMENT,
 * never authority (INV-13). Deliberately non-overlapping with
 * ConnectedInstancePin: no instanceId, no implementationId, no accountRef,
 * no authorization, no credential scope, no permission state, no
 * eligibility. The onchain execution-scope assertion rejects this shape
 * with the typed CatalogueNotAuthorityError.
 */
export interface ProviderCatalogueEntryPin {
  readonly catalogueEntryId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly capabilityId: string;
  readonly summary: string;
  /** Platform-wide advertised scope — what the provider claims to support. */
  readonly advertisedScope: {
    readonly platformWide: true;
    readonly advertisedGeographies: readonly string[];
    readonly advertisedCurrencies: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// Execution modes + the canonical execution request (explicit-mode law)
// ---------------------------------------------------------------------------

/**
 * VALUE PIN — authority: @payswap/capability src/execution-modes.ts
 * `EXECUTION_MODE_VOCABULARY_VERSION`. Pinned byte-identical; an execution
 * request carrying a different mode vocabulary version is stale and never
 * validates.
 */
export const PINNED_EXECUTION_MODE_VOCABULARY_VERSION = "1.0.0" as const;

/**
 * VALUE PIN — authority: @payswap/capability src/execution-modes.ts
 * `EXECUTION_MODES` (byte-identical; cross-lane consistency test-enforced).
 * NONE of the modes bypasses protocol authorization, policy, compliance,
 * security, idempotency or evidence. INV-15 baseline discipline: the
 * vocabulary assigns NO priority — PASS_THROUGH_NATIVE (the provider-native
 * incumbent baseline) is never structurally disadvantaged.
 */
export const PINNED_EXECUTION_MODES = [
  "PASS_THROUGH_NATIVE",
  "COMPOSED_PAYSWAP",
  "OPTIMIZED_MULTI_PROVIDER",
] as const;

/** STRUCTURAL PIN — authority: @payswap/capability `ExecutionMode`. */
export type PinnedExecutionMode = (typeof PINNED_EXECUTION_MODES)[number];

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/execution-modes.ts `ProtocolAuthorizationRef`: the protocol
 * authorization backing a connector execution. The referenced command is
 * the protocol-authorized envelope under which the external effect may
 * happen; the fabric holds an OPAQUE reference — it never verifies or
 * interprets authorization (trust/protocol lanes own that).
 */
export interface PinnedProtocolAuthorizationRef {
  readonly commandId: string;
  readonly principal: {
    readonly principalType: string;
    readonly principalId: string;
  };
  readonly authorizationEvidenceRef: string;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * src/execution-modes.ts `ConnectorExecutionRequest`: `executionMode` is
 * REQUIRED on every execution, and so is the protocol authorization
 * reference and the connected-instance reference — no mode (including
 * PASS_THROUGH_NATIVE) can bypass protocol authorization (INV-5), and no
 * catalogue/definition reference can stand in for a connected instance
 * (INV-13). The onchain domain's OnchainExecutionRequest narrows
 * `providerRequest` to the onchain execution directive.
 */
export interface PinnedConnectorExecutionRequest {
  readonly executionMode: PinnedExecutionMode;
  readonly modeVocabularyVersion: typeof PINNED_EXECUTION_MODE_VOCABULARY_VERSION;
  /** MUST reference a ConnectedCapabilityInstance (never a catalogue entry). */
  readonly capabilityInstanceId: string;
  /** Opaque provider-native request payload (never typed with provider SDKs). */
  readonly providerRequest: unknown;
  readonly idempotencyKey: string;
  readonly protocolAuthorization: PinnedProtocolAuthorizationRef;
}

/**
 * STRUCTURAL PIN — authority: @payswap/capability
 * `ExecutionRequestValidation`: total validation result — violations listed
 * verbatim, never thrown partially.
 */
export type PinnedExecutionRequestValidation =
  | { readonly ok: true; readonly mode: PinnedExecutionMode }
  | { readonly ok: false; readonly violations: readonly string[] };

// ---------------------------------------------------------------------------
// Observation provenance + financial effect classes
// ---------------------------------------------------------------------------

/**
 * STRUCTURAL PIN — authority: @payswap/capability src/observation.ts
 * `ObservationProvenance`. Every onchain observation (asset position,
 * execution attempt) carries provenance — mandatory, never anonymous.
 */
export interface ObservationProvenancePin {
  readonly providerName: string;
  readonly source: "PROVIDER_API" | "PROVIDER_WEBHOOK" | "OPERATOR" | "INTERNAL";
  readonly capturedAt: string;
}

/**
 * VALUE PIN — authority: @payswap/capability
 * src/executable-declaration.ts `FINANCIAL_EFFECT_CLASSES` (byte-identical;
 * cross-lane consistency test-enforced). This vocabulary REPLACED the old
 * repository's per-side-effect classification (NO_FINANCIAL_EFFECT /
 * MOVES_VALUE / …) in PaySwap 3.0: the onchain operation semantics table
 * reconciles to THESE values. OBSERVATION_ONLY carries no external effect;
 * CONSEQUENTIAL_EXTERNAL_EFFECT may cause an external financial effect and
 * therefore requires protocol authorization + evidence + idempotency
 * discipline before any external command.
 */
export const PINNED_FINANCIAL_EFFECT_CLASSES = [
  "NO_EFFECT",
  "OBSERVATION_ONLY",
  "PENDING_EXTERNAL_COMMAND",
  "CONSEQUENTIAL_EXTERNAL_EFFECT",
] as const;

/** STRUCTURAL PIN — authority: @payswap/capability `FinancialEffectClass`. */
export type PinnedFinancialEffectClass =
  (typeof PINNED_FINANCIAL_EFFECT_CLASSES)[number];
