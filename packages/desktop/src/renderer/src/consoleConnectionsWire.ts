/**
 * @zcode/desktop — the payswap-desktop CONNECTIONS wire types,
 * structurally re-declared for the renderer (P21-A, the
 * consolePaymentMissionWire precedent; split for the ≤400-line file
 * law).
 *
 * The host DTOs live in src/host/payswap (not renderer-importable), so
 * this mirror carries the pinned shapes BY VALUE — the established
 * two-sided drift discipline (test/payswap/desktop-console-client.test
 * .ts asserts the MEMBER sets cannot drift; the shapes are pinned by
 * structural mirroring).
 *
 * THE WIRE LAWS (P21-A, ADR-0014 D5/D9):
 * - NO MATERIAL renderer-ward: the key-entry members carry the key
 *   renderer→host ONCE (sealed immediately; the receipt carries counts
 *   and the opaque handle ref, never the key); the probe outcome
 *   carries provider references and lifecycle facts ONLY — never key
 *   material, never the credential handle, never envelope internals;
 * - the evidence-tier law (D9): the probe outcome is PROVIDER_OBSERVATION —
 *   what the provider's read-only endpoints answered, never more;
 * - the honest scope notes render verbatim (a Flutterwave probe proves
 *   read-only balance access — never send capability, F3).
 */

/** The providers a REAL verification probe exists for (mirrors the host pin). */
export type PaySwapProbeProviderId = "stripe" | "flutterwave" | "paystack";

/** The probe outcome vocabulary (mirrors the host pin). */
export type PaySwapConnectionProbeOutcome = "CONFIRMED" | "UNKNOWN" | "FAILED";

/** The evidence-tier vocabulary (mirrors the host pin — the tiers never mix). */
export type PaySwapConnectionProbeEvidenceTier = "PROVIDER_OBSERVATION";

/** The key-entry seal receipt (mirrors DesktopCredentialSealReceipt). */
export interface PaySwapCredentialSealReceiptDto {
  readonly connectionId: string;
  /** The opaque handle ref — non-returnable, no material ever flows back. */
  readonly credentialHandleRef: string;
  /** How many secret strings were sealed (audit surface, not the strings). */
  readonly sealedSecretCount: number;
  /** The honest next state (verification is still required for ACTIVE). */
  readonly nextState: string;
}

/** One probed connection's secret-free result (mirrors ConnectionProbeResultDto). */
export interface PaySwapConnectionProbeResultDto {
  readonly connectionId: string;
  readonly outcome: PaySwapConnectionProbeOutcome;
  /** Provider references the probe read (wallets / account / transactions). */
  readonly providerReferences: readonly string[];
  /** The connection state AFTER the outcome was recorded through the authority. */
  readonly state: string;
  /** People-language summary (no envelope internals, no key material). */
  readonly summary: string;
  /** Present iff FAILED — the provider failure code, never verbatim provider text. */
  readonly failureCode?: string;
}

/** The secret-free outcome of one probe run (mirrors ConnectionProbeOutcomeDto). */
export interface PaySwapConnectionProbeOutcomeDto {
  readonly providerId: PaySwapProbeProviderId;
  readonly probedOperation: string;
  readonly results: readonly PaySwapConnectionProbeResultDto[];
  readonly evidenceTier: PaySwapConnectionProbeEvidenceTier;
  readonly note: string;
}

/**
 * (P22-H, ADR-0016 D9) One probed Stellar connection's secret-free
 * result (mirrors StellarAccountReadResultDto — the positions observed,
 * never the raw account address).
 */
export interface PaySwapStellarAccountReadResultDto {
  readonly connectionId: string;
  readonly outcome: PaySwapConnectionProbeOutcome;
  /** The issuer-scoped asset refs observed (the raw G… address never appears). */
  readonly providerReferences: readonly string[];
  /** The connection state AFTER the outcome was recorded through the authority. */
  readonly state: string;
  /** People-language summary (no envelope internals, no key material). */
  readonly summary: string;
  /** Present iff FAILED — the failure code, never verbatim provider text. */
  readonly failureCode?: string;
}

/**
 * (P22-H, ADR-0016 D9) The secret-free outcome of one Stellar
 * account-read probe run (mirrors StellarAccountReadOutcomeDto).
 */
export interface PaySwapStellarAccountReadOutcomeDto {
  readonly providerRef: "stellar:testnet";
  readonly probedOperation: "stellar.account.read";
  readonly results: readonly PaySwapStellarAccountReadResultDto[];
  readonly evidenceTier: PaySwapConnectionProbeEvidenceTier;
  readonly note: string;
}

/** One connection's status view (mirrors DesktopConnectionStatusView — the fields the renderer consumes). */
export interface PaySwapConnectionStatusViewDto {
  readonly connectionId: string;
  readonly providerId: string;
  readonly useCaseRef: string;
  readonly form: string;
  readonly credentialKind: string;
  readonly executionMode: string;
  readonly state: string;
  readonly credentialHandleRef: string;
  readonly createdAt: string;
  readonly lastTransitionAt: string;
}

/** The typed outcome of a setup seed (mirrors DesktopConnectionSetupOutcome — create or resume, honestly). */
export type PaySwapConnectionSetupOutcomeDto =
  | { readonly kind: "CREATED"; readonly connectionId: string; readonly state: string }
  | { readonly kind: "RESUMED"; readonly connectionId: string; readonly state: string }
  | { readonly kind: "REFUSED"; readonly reason: string };

/* ---------------------------------------------------------------------------
 * (P21-D Gap A, ADR-0014 D6/D12) The connection-derived CORRIDOR CAPABILITY
 * CHAIN wire types — the four-layer route chain the host's
 * connectionCapabilityChains member returns (mirrors the host's
 * ConnectionCapabilityRouteChain / chain-from-bridge.ts, which itself pins
 * the route-planning PinnedCorridorRouteChain shape BY VALUE). The instance
 * and observation layers are the pinned scope surfaces declared field-by-
 * field so the renderer composition can hand the chains to the engine
 * WITHOUT a cast — a pin drift fails the mirror-check gate rather than
 * silently widening the wire; the definition/implementation layers are
 * re-validated fail-closed by the REAL corridor machinery at the engine's
 * stage-2/3 snapshot derivation (a drifted DTO throws typed, never
 * fabricates a rail).
 *
 * THE WIRE LAW: capability metadata ONLY — no credentials, no secret
 * material, no authorization artifacts. The instance's credential scope
 * carries the OPAQUE connection reference (INV-19 — the same id
 * connectionStatuses discloses); the authorization field carries the
 * lifecycle STATUS, never an artifact.
 * ------------------------------------------------------------------------- */

/** The chain's capability-definition layer (the host pin's readable surface; opaque to route-planning). */
export interface PaySwapConnectionCapabilityDefinitionDto extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly version: string;
  readonly executable: boolean;
  readonly nonExecutableReason?: string;
}

/** The chain's provider-implementation layer (the host pin's own surface; opaque to route-planning). */
export interface PaySwapConnectionCapabilityImplementationDto {
  readonly implementationId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly version: string;
  readonly adapterRef: string;
  readonly corridors: readonly {
    readonly fromCountries?: readonly string[];
    readonly toCountries?: readonly string[];
    readonly currencies?: readonly string[];
  }[];
  readonly knownDeviations: readonly { readonly aspect: string; readonly deviation: string; readonly documented: true }[];
}

/** The chain's connected-instance layer (the PinnedInstanceScope surface — INV-13). */
export interface PaySwapConnectionCapabilityInstanceDto {
  readonly instanceId: string;
  readonly capabilityId: string;
  readonly implementationId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly accountRef: string;
  readonly tenantRef: string;
  readonly authorization: {
    readonly status: "ACTIVE" | "PENDING" | "REVOKED" | "EXPIRED" | "UNKNOWN";
    readonly grantedAt?: string;
    readonly revokedAt?: string;
    readonly authorizationRef?: string;
  };
  /** The OPAQUE connection reference — never credential material (INV-19). */
  readonly credentialScope: {
    readonly credentialRef: string;
    readonly credentialKind: "API_KEY" | "OAUTH" | "DELEGATED_TOKEN" | "SESSION" | "PROVIDER_DEFINED";
  };
  readonly geography: { readonly countries: readonly string[]; readonly regions?: readonly string[] };
  readonly currencies: readonly string[];
  readonly permissionState: {
    readonly granted: readonly string[];
    readonly requested: readonly string[];
    readonly missing: readonly string[];
  };
  readonly eligibility: { readonly eligible: boolean; readonly reasons: readonly string[] };
  readonly configuration: Readonly<Record<string, string | number | boolean>>;
}

/** The chain's observation layer (the PinnedObservationScope surface — the DERIVED two-axis availability). */
export interface PaySwapConnectionCapabilityObservationDto {
  readonly instanceId: string;
  readonly observedAt: string;
  readonly observationVersion: number;
  readonly capabilityState: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
  readonly sourceAvailability: "REACHABLE" | "UNREACHABLE" | "UNKNOWN";
  readonly availability: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";
  readonly eligibility: "ELIGIBLE" | "NOT_ELIGIBLE" | "UNKNOWN";
  readonly health: { readonly status: string; readonly lastCheckedAt: string };
  readonly provenance: {
    readonly providerName: string;
    readonly source: "PROVIDER_API" | "PROVIDER_WEBHOOK" | "OPERATOR" | "INTERNAL";
    readonly capturedAt: string;
  };
}

/** One connection-derived corridor route chain (mirrors the host ConnectionCapabilityRouteChain). */
export interface PaySwapConnectionCapabilityChainDto {
  readonly definition: PaySwapConnectionCapabilityDefinitionDto;
  readonly implementation: PaySwapConnectionCapabilityImplementationDto;
  readonly instance: PaySwapConnectionCapabilityInstanceDto;
  readonly observation: PaySwapConnectionCapabilityObservationDto;
}
